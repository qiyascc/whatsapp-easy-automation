import { GraphRouter } from './GraphRouter.js';
import { NodeResult } from '#nodes/WorkflowNode.js';
import { Template } from '#core/Template.js';
import { clamp } from '#core/Support.js';

const MAX_STEPS_PER_PASS = 60;
const RETRY_BASE_DELAY_MS = 60000;

export class RunExecutor {
  constructor({ nodeRegistry, repositories, pacer, settings, logger, config }) {
    this.nodes = nodeRegistry;
    this.repositories = repositories;
    this.pacer = pacer;
    this.settings = settings;
    this.logger = logger;
    this.config = config;
  }

  async execute({ run, workflow, gateway, sessionKey }) {
    const router = new GraphRouter(workflow.graph);
    const trigger = router.triggerOf(this.nodes);
    let cursor = run.cursorNode || (trigger ? router.next(trigger.id) : null);

    if (!cursor) {
      this.#finish(run, 'done');
      return { steps: 0, status: 'done' };
    }

    const variables = { ...(run.context?.vars ?? {}) };
    const payload = run.payload ?? {};
    let contact = run.contactId ? this.repositories.contacts.findById(run.contactId) : null;
    let contactChanged = false;
    let steps = 0;

    while (cursor && steps < MAX_STEPS_PER_PASS) {
      const node = router.node(cursor);
      if (!node) {
        this.#persist(run, { status: 'done', cursorNode: null, context: { vars: variables } });
        return { steps, status: 'done' };
      }

      if (this.nodes.isTrigger(node.type)) {
        cursor = router.next(node.id);
        continue;
      }

      const instance = this.nodes.instanceOf(node.type);
      if (!instance) {
        this.#persist(run, {
          status: 'failed',
          cursorNode: node.id,
          lastError: `The node type "${node.type}" is not available in this build.`,
          context: { vars: variables }
        });
        return { steps, status: 'failed' };
      }

      const scope = this.nodes.scopeOf(node.type);
      if (scope === 'contact' && !contact) {
        cursor = router.next(node.id, 'default');
        steps += 1;
        continue;
      }

      if (scope === 'run' && !this.#claimOnce(run, workflow, node)) {
        cursor = router.next(node.id, 'default');
        steps += 1;
        continue;
      }

      const costly = this.nodes.isCostly(node.type);
      if (costly) {
        if (this.pacer.quotaReached(sessionKey)) {
          this.logger.warn(`The daily action limit for session "${sessionKey}" was reached, runs are paused.`);
          this.#persist(run, {
            status: 'waiting',
            cursorNode: node.id,
            resumeAt: Date.now() + this.pacer.quotaCooldownMs,
            context: { vars: variables }
          });
          return { steps, status: 'waiting' };
        }
        if (!this.pacer.canAct(sessionKey)) {
          this.#persist(run, {
            status: 'waiting',
            cursorNode: node.id,
            resumeAt: this.pacer.readyAt(sessionKey),
            context: { vars: variables }
          });
          return { steps, status: 'waiting' };
        }
      }

      const context = {
        params: node.params ?? {},
        node,
        run,
        contact,
        payload,
        variables,
        gateway,
        settings: {
          default_group_jid: this.settings.get('default_group_jid'),
          default_invite_message: this.settings.get('default_invite_message')
        },
        services: {
          contacts: this.repositories.contacts,
          state: this.repositories.state,
          logger: this.logger
        },
        scope: Template.buildScope({ contact, payload, variables }),
        assignContact: (next) => {
          contact = next;
          contactChanged = true;
        }
      };

      let result;
      try {
        result = await instance.execute(context);
      } catch (error) {
        result = NodeResult.fail(error.message || String(error));
      }

      steps += 1;

      if (contactChanged) {
        this.repositories.runs.update(run.id, { contactId: contact?.id ?? null });
        run.contactId = contact?.id ?? null;
        contactChanged = false;
      }

      if (result.kind === 'fail') {
        return this.#handleFailure(run, node, result.message, variables);
      }

      if (result.kind === 'wait') {
        const target = router.next(node.id, 'default');
        this.#persist(run, {
          status: target ? 'waiting' : 'done',
          cursorNode: target,
          resumeAt: target ? Date.now() + result.milliseconds : null,
          attempts: 0,
          lastError: null,
          context: { vars: variables }
        });
        return { steps, status: target ? 'waiting' : 'done' };
      }

      if (result.kind === 'stop') {
        this.#persist(run, { status: 'done', cursorNode: null, lastError: null, context: { vars: variables } });
        return { steps, status: 'done' };
      }

      if (costly && result.kind !== 'skip') {
        this.pacer.recordAction(sessionKey);
        this.pacer.reserve(sessionKey);
      }

      if (result.kind === 'skip' && result.reason) {
        this.logger.debug(`Step "${node.type}" was skipped: ${result.reason}`);
      }

      const nextId = router.next(node.id, result.output ?? 'default');
      if (!nextId) {
        this.#persist(run, { status: 'done', cursorNode: null, attempts: 0, lastError: null, context: { vars: variables } });
        return { steps, status: 'done' };
      }

      cursor = nextId;
      this.repositories.runs.update(run.id, { cursorNode: cursor, status: 'active', attempts: 0, context: { vars: variables } });
    }

    this.#persist(run, { status: 'active', cursorNode: cursor, context: { vars: variables } });
    return { steps, status: 'active' };
  }

  #claimOnce(run, workflow, node) {
    const eventId = run.payload?.eventId;
    if (!eventId) return true;
    const key = `once:${workflow.id}:${node.id}:${eventId}`;
    if (this.repositories.state.get(key)) return false;
    this.repositories.state.set(key, String(Date.now()));
    return true;
  }

  #handleFailure(run, node, message, variables) {
    const attempts = (run.attempts ?? 0) + 1;
    const detail = `${node.type}: ${message}`;
    if (attempts >= this.config.maxRunAttempts) {
      this.#persist(run, {
        status: 'failed',
        cursorNode: node.id,
        attempts,
        lastError: detail,
        context: { vars: variables }
      });
      this.logger.error(`Run ${run.id} failed permanently. ${detail}`);
      return { steps: 1, status: 'failed' };
    }
    const delay = clamp(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), RETRY_BASE_DELAY_MS, 3600000);
    this.#persist(run, {
      status: 'waiting',
      cursorNode: node.id,
      attempts,
      resumeAt: Date.now() + delay,
      lastError: detail,
      context: { vars: variables }
    });
    this.logger.warn(`Run ${run.id} will retry in ${Math.round(delay / 1000)}s. ${detail}`);
    return { steps: 1, status: 'waiting' };
  }

  #persist(run, fields) {
    this.repositories.runs.update(run.id, fields);
  }

  #finish(run, status) {
    this.repositories.runs.update(run.id, { status, cursorNode: null });
  }
}
