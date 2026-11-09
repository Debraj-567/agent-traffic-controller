import assert from "node:assert/strict";
import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";

const controller = new TrafficController();

let pairArrivals = 0;
let releasePair;

const pairBarrier = new Promise(resolve => {
  releasePair = resolve;
});

const attempts = new Map();

function createMockWorker(id, firstResource, secondResource, isPairAgent = false) {
  return {
    id,

    async execute(task, context, { signal, requestResource }) {
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);

      console.log(`\n[${id}] Attempt ${attempt}`);

      // Agent-C waits until A and B hold their first resources.
      if (!isPairAgent && attempt === 1) {
        await pairBarrier;
      }

      console.log(`[${id}] Requesting ${firstResource}`);
      await requestResource(firstResource);

      console.log(`[${id}] Acquired ${firstResource}`);

      // A and B deliberately create circular wait on first attempt.
      if (isPairAgent && attempt === 1) {
        pairArrivals++;

        if (pairArrivals === 2) {
          console.log("\n[TEST] Both primary agents hold their first resources.");
          releasePair();
        }

        await pairBarrier;

        if (signal.aborted) {
          const error = new Error("Execution cancelled");
          error.name = "AbortError";
          throw error;
        }
      }

      console.log(`[${id}] Requesting ${secondResource}`);
      await requestResource(secondResource);

      console.log(`[${id}] Acquired ${secondResource}`);

      return {
        message: `${id} completed successfully`,
        attempt
      };
    }
  };
}

const workers = [
  createMockWorker("Agent-A", "database", "cache", true),
  createMockWorker("Agent-B", "cache", "database", true),
  createMockWorker("Agent-C", "database", "cache", false)
];

for (const worker of workers) {
  controller.registerAgent(worker.id, "worker");
}

controller.submitTask("TASK-A", "Acquire database then cache", 3, []);
controller.submitTask("TASK-B", "Acquire cache then database", 2, []);
controller.submitTask("TASK-C", "Compete for database then cache", 1, []);

const runtime = new AgentRuntime(controller, workers);

console.log("\n===== THREE-AGENT STRESS TEST =====");
console.log("Agents: 3");
console.log("Resources: database, cache");
console.log("Expected: contention + deadlock + recovery + retry");

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

const allCompleted =
  tasks.length === 3 &&
  tasks.every(task => task.status === "completed");

const retryOccurred =
  tasks.some(task => task.retryCount >= 1);

const cancellationRecorded =
  history.some(record => record.status === "cancelled");

const locksCleared =
  Object.keys(locks).length === 0;

const deadlockCleared = !deadlock.deadlocked;

const passed =
  result.status === "completed" &&
  allCompleted &&
  retryOccurred &&
  cancellationRecorded &&
  locksCleared &&
  deadlockCleared;

console.log("\n===== STRESS TEST SUMMARY =====");
console.table([
  { check: "All 3 tasks completed", passed: allCompleted },
  { check: "At least one retry occurred", passed: retryOccurred },
  { check: "Victim cancellation recorded", passed: cancellationRecorded },
  { check: "All resource locks cleared", passed: locksCleared },
  { check: "Wait-for graph has no deadlock", passed: deadlockCleared }
]);

if (passed) {
  console.log("\nPASS: Three-agent contention and deadlock recovery verified.");
} else {
  console.log("\nFAIL: Stress test did not satisfy all conditions.");
  process.exitCode = 1;
}
