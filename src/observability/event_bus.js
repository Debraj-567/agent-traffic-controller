export class EventBus {
  constructor(limit = 500) {
    this.limit = limit;
    this.sequence = 0;
    this.history = [];
    this.listeners = new Set();
  }

  publish(type, detail = {}) {
    const event = {
      ...detail,
      id: ++this.sequence,
      timestamp: new Date().toISOString(),
      type
    };

    this.history.push(event);

    if (this.history.length > this.limit) {
      this.history.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[EventBus] Listener error:", error.message);
      }
    }

    return event;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSince(id = 0) {
    return this.history.filter(event => event.id > Number(id));
  }

  getLatest(limit = 100) {
    return this.history.slice(-limit);
  }
}
