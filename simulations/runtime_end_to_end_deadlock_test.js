import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";

const controller = new TrafficController();

controller.registerAgent("Agent-A", "planner");
controller.registerAgent("Agent-B", "analyst");

let arrivals = 0;
let releaseBarrier;

const barrier = new Promise(resolve => {
  releaseBarrier = resolve;
});

const attempts = new Map();

function createMockWorker(id, firstResource, secondResource) {
  return {
    id,

    async execute(task, context, { signal, requestResource }) {
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);

      console.log(`\n[Mock ${id}] Attempt ${attempt}`);

      console.log(`[Mock ${id}] Requesting ${firstResource}`);
      await requestResource(firstResource);

      console.log(`[Mock ${id}] Acquired ${firstResource}`);

      // Only the first attempt deliberately creates circular wait.
      if (attempt === 1) {
        arrivals++;

        if (arrivals === 2) {
          releaseBarrier();
        }

        await barrier;

        if (signal.aborted) {
          const error = new Error("Execution cancelled");
          error.name = "AbortError";
          throw error;
        }
      }

      console.log(`[Mock ${id}] Requesting ${secondResource}`);
      await requestResource(secondResource);

      console.log(`[Mock ${id}] Acquired ${secondResource}`);

      return {
        message: `${id} completed successfully`,
        attempt
      };
    }
  };
}

const workers = [
  createMockWorker("Agent-A", "database", "cache"),
  createMockWorker("Agent-B", "cache", "database")
];

controller.submitTask(
  "TASK-A",
  "Acquire database then cache",
  2,
  []
);

controller.submitTask(
  "TASK-B",
  "Acquire cache then database",
  2,
  []
);

const runtime = new AgentRuntime(controller, workers);

console.log("\n===== END-TO-END RUNTIME DEADLOCK TEST =====");

const result = await runtime.runAll();

console.log("\n===== EXECUTION RESULT =====");
console.dir(result, { depth: 5 });

console.log("\n===== TASK STATUS =====");
console.table(controller.tasks.list().map(task => ({
  id: task.id,
  status: task.status,
  retryCount: task.retryCount,
  assignedTo: task.assignedTo
})));

console.log("\n===== EXECUTION HISTORY =====");
console.table(runtime.getHistory());

console.log("\n===== FINAL LOCKS =====");
console.log(controller.resources.getLocks());

console.log("\n===== FINAL WAIT-FOR GRAPH =====");
console.log(controller.waitGraph.getGraph());

const tasks = controller.tasks.list();
const history = runtime.getHistory();
const locks = controller.resources.getLocks();
const deadlock = controller.deadlocks.detect();

const allCompleted = tasks.length === 2 &&
  tasks.every(task => task.status === "completed");

const retryOccurred = tasks.some(task => task.retryCount >= 1);

const cancellationRecorded = history.some(
  record => record.status === "cancelled"
);

const locksCleared = Object.keys(locks).length === 0;

if (
  result.status === "completed" &&
  allCompleted &&
  retryOccurred &&
  cancellationRecorded &&
  locksCleared &&
  !deadlock.deadlocked
) {
  console.log("\nPASS: End-to-end runtime deadlock recovery verified.");
} else {
  console.log("\nFAIL: End-to-end runtime deadlock recovery failed.");
  process.exitCode = 1;
}
