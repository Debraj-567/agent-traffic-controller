export class ConflictDetector {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
    this.conflicts = [];
  }

  check(resourceId, requestingAgent) {
    const locks = this.resourceManager.getLocks();
    const owner = locks[resourceId];

    if (!owner || owner === requestingAgent) {
      return { conflict: false };
    }

    const conflict = {
      id: `conflict-${Date.now()}`,
      resourceId,
      requestingAgent,
      blockingAgent: owner,
      status: "detected",
      timestamp: Date.now()
    };

    this.conflicts.push(conflict);

    return { conflict: true, ...conflict };
  }

  list() {
    return [...this.conflicts];
  }
}
