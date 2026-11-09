export class WaitForGraph {
  constructor() {
    this.graph = new Map();
  }

  addAgent(agentId) {
    if (!this.graph.has(agentId)) {
      this.graph.set(agentId, new Set());
    }
  }

  addDependency(waitingAgent, blockingAgent) {
    if (waitingAgent === blockingAgent) {
      throw new Error("An agent cannot wait for itself");
    }

    this.addAgent(waitingAgent);
    this.addAgent(blockingAgent);

    this.graph.get(waitingAgent).add(blockingAgent);
  }

  removeDependency(waitingAgent, blockingAgent) {
    this.graph.get(waitingAgent)?.delete(blockingAgent);
  }

  getDependencies(agentId) {
    return [...(this.graph.get(agentId) ?? [])];
  }

  getGraph() {
    return Object.fromEntries(
      [...this.graph].map(([agent, dependencies]) => [
        agent,
        [...dependencies]
      ])
    );
  }

  detectCycles() {
    const visited = new Set();
    const active = new Set();
    const stack = [];
    const cycles = [];
    const signatures = new Set();

    const dfs = (node) => {
      visited.add(node);
      active.add(node);
      stack.push(node);

      for (const next of this.graph.get(node) ?? []) {
        if (!visited.has(next)) {
          dfs(next);
        } else if (active.has(next)) {
          const start = stack.indexOf(next);
          const cycle = stack.slice(start);
          const signature = [...cycle].sort().join("|");

          if (!signatures.has(signature)) {
            signatures.add(signature);
            cycles.push([...cycle, next]);
          }
        }
      }

      stack.pop();
      active.delete(node);
    };

    for (const node of this.graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }
}
