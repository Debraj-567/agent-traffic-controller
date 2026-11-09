export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(id, role = "worker") {
    if (this.agents.has(id)) {
      throw new Error(`Agent ${id} already exists`);
    }

    const agent = {
      id,
      role,
      status: "idle",
      currentTask: null,
      blockedBy: null,
      registeredAt: Date.now()
    };

    this.agents.set(id, agent);
    return agent;
  }

  get(id) {
    return this.agents.get(id);
  }

  updateStatus(id, status) {
    const agent = this.get(id);
    if (!agent) throw new Error(`Unknown agent: ${id}`);

    agent.status = status;
    return agent;
  }

  list() {
    return [...this.agents.values()];
  }
}
