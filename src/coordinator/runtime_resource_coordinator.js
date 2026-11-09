function cancellationError() {
  const error = new Error("Resource request cancelled");
  error.name = "AbortError";
  return error;
}

export class RuntimeResourceCoordinator {
  constructor(controller, onDeadlock) {
    this.controller = controller;
    this.onDeadlock = onDeadlock;
    this.waiters = new Map();
    this.waitingByAgent = new Map();
  }

  syncQueue(resourceId) {
    const queue = this.waiters.get(resourceId) ?? [];

    this.controller.resourceWaiters.set(
      resourceId,
      queue.map(waiter => waiter.agentId)
    );
  }

  removeWaiter(waiter) {
    const queue = this.waiters.get(waiter.resourceId) ?? [];
    const index = queue.indexOf(waiter);

    if (index !== -1) {
      queue.splice(index, 1);
    }

    if (queue.length === 0) {
      this.waiters.delete(waiter.resourceId);
    }

    if (this.waitingByAgent.get(waiter.agentId) === waiter) {
      this.waitingByAgent.delete(waiter.agentId);
    }

    if (waiter.blockingAgent) {
      this.controller.waitGraph.removeDependency(
        waiter.agentId,
        waiter.blockingAgent
      );
    }

    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    this.syncQueue(waiter.resourceId);
  }

  refreshResourceDependencies(resourceId, newOwner) {
    const queue = this.waiters.get(resourceId) ?? [];

    for (const waiter of queue) {
      if (waiter.blockingAgent) {
        this.controller.waitGraph.removeDependency(
          waiter.agentId,
          waiter.blockingAgent
        );
      }

      waiter.blockingAgent = newOwner;

      if (newOwner && waiter.agentId !== newOwner) {
        this.controller.waitGraph.addDependency(
          waiter.agentId,
          newOwner
        );
      }

      const agent = this.controller.registry.get(waiter.agentId);

      if (agent) {
        agent.status = "waiting";
        agent.blockedBy = newOwner;
      }
    }

    this.syncQueue(resourceId);
  }

  detectHandoffDeadlock(currentOwner) {
    const deadlock = this.controller.deadlocks.detect();

    if (!deadlock.deadlocked) return;

    console.log(
      "[Deadlock Detector] Deadlock exposed after lock handoff:",
      deadlock.cycles
    );

    this.controller.emitEvent?.("deadlock.detected", {
      cycles: deadlock.cycles,
      affectedAgents: deadlock.affectedAgents,
      reason: "lock_handoff"
    });

    const cycleAgents = new Set(deadlock.affectedAgents ?? []);

    let victim = cycleAgents.has(currentOwner) &&
      this.waitingByAgent.has(currentOwner)
      ? currentOwner
      : null;

    if (!victim) {
      for (const cycle of deadlock.cycles) {
        for (const agentId of cycle) {
          if (this.waitingByAgent.has(agentId)) {
            victim = agentId;
            break;
          }
        }

        if (victim) break;
      }
    }

    if (victim && this.onDeadlock) {
      console.log(
        `[Recovery] Handoff deadlock victim selected: ${victim}`
      );

      this.controller.emitEvent?.("deadlock.victim_selected", {
        agentId: victim,
        reason: "lock_handoff"
      });

      void Promise.resolve(
        this.onDeadlock(victim, deadlock)
      ).catch(error => {
        console.error("[Recovery] Deadlock callback failed:", error);
      });
    }
  }

  async request(agentId, resourceId, signal) {
    if (signal?.aborted) {
      throw cancellationError();
    }

    if (this.waitingByAgent.has(agentId)) {
      throw new Error(
        `${agentId} already has a pending resource request`
      );
    }

    const result = this.controller.resources.acquire(
      resourceId,
      agentId
    );

    if (result.acquired) {
      this.controller.emitEvent?.("resource.acquired", {
        agentId,
        resourceId
      });

      return {
        ...result,
        status: "granted"
      };
    }

    this.controller.conflicts.check(resourceId, agentId);

    this.controller.waitGraph.addDependency(
      agentId,
      result.owner
    );

    const registryAgent = this.controller.registry.get(agentId);

    if (registryAgent) {
      registryAgent.status = "waiting";
      registryAgent.blockedBy = result.owner;
    }

    let resolvePromise;
    let rejectPromise;

    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const waiter = {
      agentId,
      resourceId,
      blockingAgent: result.owner,
      signal,
      resolve: resolvePromise,
      reject: rejectPromise,
      onAbort: null
    };

    waiter.onAbort = () => {
      this.controller.emitEvent?.("resource.wait.cancelled", {
        agentId,
        resourceId
      });

      this.removeWaiter(waiter);
      rejectPromise(cancellationError());
    };

    if (!this.waiters.has(resourceId)) {
      this.waiters.set(resourceId, []);
    }

    this.waiters.get(resourceId).push(waiter);
    this.waitingByAgent.set(agentId, waiter);

    signal?.addEventListener("abort", waiter.onAbort, {
      once: true
    });

    this.syncQueue(resourceId);

    this.controller.emitEvent?.("resource.waiting", {
      agentId,
      resourceId,
      blockingAgent: result.owner
    });

    const deadlock = this.controller.deadlocks.detect();

    if (deadlock.deadlocked) {
      console.log(
        "[Deadlock Detector] Runtime cycle detected:",
        deadlock.cycles
      );

      this.controller.emitEvent?.("deadlock.detected", {
        cycles: deadlock.cycles,
        affectedAgents: deadlock.affectedAgents
      });

      this.onDeadlock?.(agentId, deadlock);
    }

    return promise;
  }

  release(agentId, resourceId) {
    const locks = this.controller.resources.getLocks();

    if (locks[resourceId] !== agentId) {
      return { released: false };
    }

    this.controller.resources.release(resourceId, agentId);

    this.controller.emitEvent?.("resource.released", {
      agentId,
      resourceId
    });

    const queue = this.waiters.get(resourceId) ?? [];

    while (queue.length > 0) {
      const waiter = queue.shift();

      if (waiter.signal?.aborted) {
        this.removeWaiter(waiter);
        continue;
      }

      const acquired = this.controller.resources.acquire(
        resourceId,
        waiter.agentId
      );

      if (!acquired.acquired) {
        waiter.blockingAgent = acquired.owner;

        if (acquired.owner) {
          this.controller.waitGraph.addDependency(
            waiter.agentId,
            acquired.owner
          );
        }

        queue.unshift(waiter);
        this.syncQueue(resourceId);

        return {
          released: true,
          grantedTo: null
        };
      }

      if (this.waitingByAgent.get(waiter.agentId) === waiter) {
        this.waitingByAgent.delete(waiter.agentId);
      }

      if (waiter.blockingAgent) {
        this.controller.waitGraph.removeDependency(
          waiter.agentId,
          waiter.blockingAgent
        );
      }

      const nextAgent = this.controller.registry.get(waiter.agentId);

      if (nextAgent) {
        nextAgent.status = "working";
        nextAgent.blockedBy = null;
      }

      waiter.signal?.removeEventListener(
        "abort",
        waiter.onAbort
      );

      if (queue.length === 0) {
        this.waiters.delete(resourceId);
      }

      // The new lock owner becomes the blocker for every
      // remaining waiter in this resource queue.
      this.refreshResourceDependencies(
        resourceId,
        waiter.agentId
      );

      this.controller.emitEvent?.("resource.granted", {
        agentId: waiter.agentId,
        resourceId,
        previousOwner: agentId
      });

      waiter.resolve({
        acquired: true,
        resourceId,
        agentId: waiter.agentId,
        status: "granted"
      });

      // Re-check the graph because lock handoff can expose
      // a cycle that was hidden by an outdated dependency.
      this.detectHandoffDeadlock(waiter.agentId);

      return {
        released: true,
        grantedTo: waiter.agentId
      };
    }

    this.waiters.delete(resourceId);
    this.syncQueue(resourceId);

    return {
      released: true,
      grantedTo: null
    };
  }

  releaseAll(agentId) {
    const locks = this.controller.resources.getLocks();
    const released = [];

    for (const [resourceId, owner] of Object.entries(locks)) {
      if (owner !== agentId) continue;

      const result = this.release(agentId, resourceId);

      if (result.released) {
        released.push(resourceId);
      }
    }

    return released;
  }

  getWaiting() {
    return Object.fromEntries(
      [...this.waiters.entries()].map(([resource, queue]) => [
        resource,
        queue.map(waiter => ({
          agentId: waiter.agentId,
          blockingAgent: waiter.blockingAgent
        }))
      ])
    );
  }
}
