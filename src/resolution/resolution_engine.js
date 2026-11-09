export class ResolutionEngine {
  constructor(resourceManager, registry, waitForGraph) {
    this.resourceManager = resourceManager;
    this.registry = registry;
    this.waitForGraph = waitForGraph;
    this.history = [];
  }

  resolve(conflict) {
    const requester = this.registry.get(conflict.requestingAgent);
    const blocker = this.registry.get(conflict.blockingAgent);

    if (!requester || !blocker) {
      return { resolved: false, reason: "Unknown agent" };
    }

    const decision = {
      conflictId: conflict.id,
      strategy: "wait_and_retry",
      reason: `${blocker.id} currently owns ${conflict.resourceId}`,
      status: "pending",
      timestamp: Date.now()
    };

    this.waitForGraph.addDependency(requester.id, blocker.id);

    const deadlocks = this.waitForGraph.detectCycles();

    if (deadlocks.length > 0) {
      decision.strategy = "deadlock_detected";
      decision.status = "escalated";
      decision.reason = "Circular wait detected; recovery required";
    }

    this.history.push(decision);
    return decision;
  }

  getHistory() {
    return [...this.history];
  }
}
