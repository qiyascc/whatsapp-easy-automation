import { GraphRouter } from './GraphRouter.js';

const MAX_NODES = 200;
const MAX_EDGES = 400;

export class GraphValidator {
  #registry;
  #triggers;

  constructor({ nodeRegistry, triggerRegistry }) {
    this.#registry = nodeRegistry;
    this.#triggers = triggerRegistry;
  }

  normalize(graph) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];
    return {
      nodes: nodes.slice(0, MAX_NODES).map((node) => ({
        id: String(node?.id ?? ''),
        type: String(node?.type ?? ''),
        params: node?.params && typeof node.params === 'object' ? GraphValidator.#normalizeParams(node.params) : {},
        x: Number.isFinite(Number(node?.x)) ? Math.max(0, Math.round(Number(node.x))) : 40,
        y: Number.isFinite(Number(node?.y)) ? Math.max(0, Math.round(Number(node.y))) : 40
      })),
      edges: edges.slice(0, MAX_EDGES).map((edge) => ({
        from: String(edge?.from ?? ''),
        to: String(edge?.to ?? ''),
        out: ['default', 'true', 'false'].includes(edge?.out) ? edge.out : 'default'
      }))
    };
  }

  validate(graph) {
    const issues = [];
    const nodes = graph.nodes;
    const identifiers = new Set();

    for (const node of nodes) {
      if (!node.id) issues.push('A node is missing its identifier.');
      if (identifiers.has(node.id)) issues.push(`Duplicate node identifier "${node.id}".`);
      identifiers.add(node.id);
      if (!this.#registry.has(node.type)) issues.push(`Unknown node type "${node.type}".`);
    }

    for (const edge of graph.edges) {
      if (!identifiers.has(edge.from) || !identifiers.has(edge.to)) {
        issues.push('A connection points to a node that no longer exists.');
        continue;
      }
      if (edge.from === edge.to) issues.push('A node cannot be connected to itself.');
      const outputs = this.#registry.outputsOf(this.#typeOf(nodes, edge.from));
      if (!outputs.includes(edge.out)) {
        issues.push(`Connection from "${edge.from}" uses the unsupported output "${edge.out}".`);
      }
    }

    const router = new GraphRouter(graph);
    const triggers = router.triggersOf(this.#registry);
    if (triggers.length === 0) issues.push('The workflow needs exactly one trigger node.');
    if (triggers.length > 1) issues.push('The workflow has more than one trigger node. Keep a single trigger.');

    for (const trigger of triggers) {
      if (trigger.type !== 'trigger_event') continue;
      const source = trigger.params?.source;
      if (!source) issues.push('The event trigger has no source selected.');
      else if (!this.#triggers.has(source)) issues.push(`The event trigger uses the unknown source "${source}".`);
    }

    if (triggers.length === 1) {
      const reachable = router.reachableFrom(triggers[0].id);
      const orphans = nodes.filter((node) => !reachable.has(node.id) && node.id !== triggers[0].id);
      if (orphans.length) {
        issues.push(`${orphans.length} node(s) are not connected to the trigger and will never run.`);
      }
      if (router.outgoing(triggers[0].id).length === 0 && nodes.length > 1) {
        issues.push('The trigger is not connected to any step.');
      }
    }

    return { valid: issues.length === 0, issues: [...new Set(issues)] };
  }

  #typeOf(nodes, id) {
    return nodes.find((node) => node.id === id)?.type ?? '';
  }

  static #normalizeParams(params) {
    const output = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof key !== 'string' || key.length > 64) continue;
      if (value === null || value === undefined) continue;
      output[key] = typeof value === 'string' ? value.slice(0, 8000) : String(value).slice(0, 8000);
    }
    return output;
  }
}
