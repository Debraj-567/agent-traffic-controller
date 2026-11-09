import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";

const controller = new TrafficController();

controller.registerAgent("Agent-Test", "Cancellation testing");

controller.submitTask(
  "TASK-RETRY",
  "Test automatic cancellation and retry.",
  1,
  ["test-database"]
);

const worker = {
  id: "Agent-Test",
  calls: 0,

  async execute(task, context, { signal } = {}) {
    this.calls++;

    console.log(`[Mock Worker] Attempt ${this.calls}`);

    if (this.calls === 1) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          const error = new Error("Cancelled");
          error.name = "AbortError";
          reject(error);
          return;
        }

        signal.addEventListener("abort", () => {
          const error = new Error("Cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }

    return {
      result: "Successfully completed after retry"
    };
  }
};

const runtime = new AgentRuntime(controller, [worker]);

console.log("\n===== CANCELLATION RETRY TEST =====");

const runPromise = runtime.runAll();

while (runtime.activeExecutions.size === 0) {
  await new Promise(resolve => setTimeout(resolve, 5));
}

const cancellation = await runtime.cancelAgent(
  "Agent-Test",
  "Simulated deadlock recovery"
);

console.log("\nCancellation:", cancellation);

const result = await runPromise;

console.log("\nFinal execution:", result);

console.log("\nTask status:");
console.table(
  controller.tasks.list().map(task => ({
    id: task.id,
    status: task.status,
    retryCount: task.retryCount,
    assignedTo: task.assignedTo
  }))
);

console.log("\nRemaining locks:", controller.resources.getLocks());

if (
  result.status === "completed" &&
  controller.tasks.list()[0].status === "completed" &&
  controller.tasks.list()[0].retryCount === 1 &&
  Object.keys(controller.resources.getLocks()).length === 0
) {
  console.log("\nPASS: Cancellation and automatic retry verified.");
} else {
  console.log("\nFAIL: Cancellation and retry test failed.");
  process.exitCode = 1;
}
