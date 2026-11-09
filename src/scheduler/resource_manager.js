export class ResourceManager {
  constructor() {
    this.locks = new Map();
  }

  acquire(resourceId, agentId) {
    const owner = this.locks.get(resourceId);

    if (owner && owner !== agentId) {
      return {
        acquired: false,
        owner,
        waitingFor: owner
      };
    }

    this.locks.set(resourceId, agentId);

    return {
      acquired: true,
      resourceId,
      agentId
    };
  }

  release(resourceId, agentId) {
    if (this.locks.get(resourceId) !== agentId) {
      throw new Error("Agent does not own this resource");
    }

    this.locks.delete(resourceId);
    return true;
  }

  getLocks() {
    return Object.fromEntries(this.locks);
  }
}
