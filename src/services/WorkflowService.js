import { AppError, NotFoundError, ValidationError } from '#core/AppError.js';

const EMPTY_GRAPH = { nodes: [], edges: [] };

export class WorkflowService {
  constructor({ repository, runs, validator, dispatcher, logger }) {
    this.repository = repository;
    this.runs = runs;
    this.validator = validator;
    this.dispatcher = dispatcher;
    this.logger = logger;
  }

  list() {
    const stats = this.runs.statsByWorkflow();
    return this.repository.list().map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled,
      nodeCount: workflow.graph.nodes?.length ?? 0,
      updatedAt: workflow.updatedAt,
      stats: stats[workflow.id] ?? { active: 0, waiting: 0, done: 0, failed: 0, cancelled: 0 }
    }));
  }

  get(id) {
    const workflow = this.repository.find(id);
    if (!workflow) throw new NotFoundError('Workflow');
    return workflow;
  }

  create({ name, graph, enabled }) {
    const normalized = this.validator.normalize(graph ?? EMPTY_GRAPH);
    const label = String(name ?? '').trim().slice(0, 120) || 'New workflow';
    if (enabled) this.#assertValid(normalized);
    const id = this.repository.create({ name: label, graph: normalized, enabled: Boolean(enabled) });
    this.dispatcher.primeCursor(this.repository.find(id));
    this.logger.info(`Workflow "${label}" was created.`);
    return id;
  }

  update(id, patch) {
    const existing = this.get(id);
    const nextGraph = patch.graph === undefined ? existing.graph : this.validator.normalize(patch.graph);
    const nextEnabled = patch.enabled === undefined ? existing.enabled : Boolean(patch.enabled);
    if (nextEnabled) this.#assertValid(nextGraph);

    this.repository.update(id, {
      name: patch.name === undefined ? undefined : String(patch.name).trim().slice(0, 120) || existing.name,
      description: patch.description === undefined ? undefined : String(patch.description).slice(0, 500),
      graph: patch.graph === undefined ? undefined : nextGraph,
      enabled: patch.enabled === undefined ? undefined : nextEnabled
    });

    this.dispatcher.primeCursor(this.repository.find(id));

    if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
      this.logger.info(`Workflow "${existing.name}" was ${patch.enabled ? 'enabled' : 'disabled'}.`);
    }
  }

  duplicate(id) {
    const source = this.get(id);
    return this.repository.create({
      name: `${source.name} (copy)`.slice(0, 120),
      description: source.description,
      graph: source.graph,
      enabled: false
    });
  }

  remove(id) {
    this.get(id);
    this.repository.delete(id);
    this.logger.info(`Workflow ${id} was deleted.`);
  }

  test(id, sample) {
    const workflow = this.get(id);
    const outcome = this.dispatcher.simulate(workflow, {
      text: String(sample?.text ?? '').slice(0, 4000),
      sender: String(sample?.sender ?? '').slice(0, 200),
      phone: String(sample?.phone ?? '').slice(0, 40),
      name: String(sample?.name ?? '').slice(0, 120)
    });
    if (!outcome.created) throw new ValidationError(outcome.reason || 'The test produced no run.');
    return outcome.created;
  }

  #assertValid(graph) {
    const report = this.validator.validate(graph);
    if (report.valid) return;
    throw new AppError('invalid_graph', 'The workflow cannot run with this graph.', 400, { issues: report.issues });
  }
}
