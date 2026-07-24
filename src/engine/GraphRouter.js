export class GraphRouter {
  #nodes = new Map();
  #edges = [];

  constructor(graph) {
    for (const node of graph?.nodes ?? []) {
      if (node && typeof node.id === 'string') this.#nodes.set(node.id, node);
    }
    this.#edges = (graph?.edges ?? []).filter((edge) => this.#nodes.has(edge?.from) && this.#nodes.has(edge?.to));
  }

  get nodes() {
    return [...this.#nodes.values()];
  }

  node(id) {
    return this.#nodes.get(id) ?? null;
  }

  triggersOf(registry) {
    return this.nodes.filter((node) => registry.isTrigger(node.type));
  }

  triggerOf(registry) {
    return this.triggersOf(registry)[0] ?? null;
  }

  next(fromId, output = 'default') {
    const candidates = this.#edges.filter((edge) => edge.from === fromId);
    const match = candidates.find((edge) => (edge.out || 'default') === output);
    return match ? match.to : null;
  }

  outgoing(fromId) {
    return this.#edges.filter((edge) => edge.from === fromId);
  }

  reachableFrom(startId) {
    const seen = new Set();
    const queue = startId ? [startId] : [];
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      for (const edge of this.outgoing(current)) queue.push(edge.to);
    }
    return seen;
  }
}
