import { clamp } from '../core/Support.js';

const MAINTENANCE_INTERVAL_MS = 3600000;

export class WorkflowEngine {
  #timer = null;
  #running = false;
  #ticking = false;
  #lastMaintenanceAt = 0;

  constructor({ repositories, dispatcher, executor, ingest, sessions, settings, logger, config }) {
    this.repositories = repositories;
    this.dispatcher = dispatcher;
    this.executor = executor;
    this.ingest = ingest;
    this.sessions = sessions;
    this.settings = settings;
    this.logger = logger;
    this.config = config;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.ingest.start();
    const loop = async () => {
      if (!this.#running) return;
      await this.tick();
      if (!this.#running) return;
      this.#timer = setTimeout(loop, this.config.engineIntervalMs);
      if (this.#timer.unref) this.#timer.unref();
    };
    loop();
    this.logger.info('Workflow engine started.');
  }

  stop() {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.ingest.stop();
  }

  async tick() {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      const workflows = this.repositories.workflows.listEnabled();
      await this.ingest.pump(this.dispatcher.activeSources(workflows));

      for (const workflow of workflows) {
        try {
          const created = this.dispatcher.dispatch(workflow);
          if (created > 0) this.logger.info(`Workflow "${workflow.name}" started ${created} run(s).`);
        } catch (error) {
          this.logger.error(`Dispatching workflow "${workflow.name}" failed.`, { reason: error.message });
        }
      }

      await this.#drainRuns(workflows);
      this.#maintenance();
    } catch (error) {
      this.logger.error('The engine tick failed.', { reason: error.message });
    } finally {
      this.#ticking = false;
    }
  }

  async #drainRuns(workflows) {
    if (!workflows.length) return;
    const session = this.sessions.pickOpen();
    if (!session?.gateway) return;

    const runs = this.repositories.runs.findDue({
      workflowIds: workflows.map((workflow) => workflow.id),
      limit: this.config.maxRunsPerTick,
      now: Date.now()
    });
    if (!runs.length) return;

    const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));
    const sessionKey = session.phone || session.id;

    for (const run of runs) {
      const workflow = byId.get(run.workflowId);
      if (!workflow) continue;
      try {
        await this.executor.execute({ run, workflow, gateway: session.gateway, sessionKey });
      } catch (error) {
        this.logger.error(`Run ${run.id} crashed.`, { reason: error.message });
        this.repositories.runs.update(run.id, { status: 'failed', lastError: error.message });
      }
    }
  }

  #maintenance() {
    const now = Date.now();
    if (now - this.#lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
    this.#lastMaintenanceAt = now;
    const days = clamp(this.settings.number('retention_days', 14), 1, 365);
    const threshold = now - days * 86400000;
    this.repositories.logs.prune(threshold);
    this.repositories.runs.pruneFinished(threshold);
    this.repositories.counters.prune(new Date(threshold).toISOString().slice(0, 10));
    this.repositories.state.deletePrefixOlderThan('once:', threshold);
    this.logger.debug('Maintenance pass finished.');
  }
}
