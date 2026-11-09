export class DeadlockDetector {
  constructor(waitForGraph) {
    this.waitForGraph = waitForGraph;
  }

  detect() {
    const cycles = this.waitForGraph.detectCycles();

    return {
      deadlocked: cycles.length > 0,
      count: cycles.length,
      cycles,
      affectedAgents: [
        ...new Set(cycles.flat())
      ]
    };
  }
}
