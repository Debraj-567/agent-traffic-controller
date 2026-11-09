export class PriorityScheduler {
  constructor() {
    this.queue = [];
    this.sequence = 0;
  }

  enqueue(task) {
    this.queue.push({
      ...task,
      sequence: this.sequence++,
      queuedAt: Date.now()
    });

    this.queue.sort((a, b) =>
      b.priority - a.priority ||
      a.sequence - b.sequence
    );
  }

  next() {
    return this.queue.shift() ?? null;
  }

  list() {
    return [...this.queue];
  }
}
