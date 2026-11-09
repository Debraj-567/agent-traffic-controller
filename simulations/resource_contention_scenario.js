import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

const controller = new TrafficController();

const workers = [
  new AIAgent("Agent-Planner", "Architecture planning"),
  new AIAgent("Agent-Analyst", "Concurrency analysis"),
  new AIAgent("Agent-Coordinator", "Execution coordination")
];

for (const worker of workers) {
  controller.registerAgent(worker.id, worker.role);
}

const sharedResource = ["shared-database"];

controller.submitTask(
  "TASK-001",
  "Design the database coordination architecture.",
  3,
  sharedResource
);

controller.submitTask(
  "TASK-002",
  "Analyze database locking and concurrency risks.",
  2,
  sharedResource
);

controller.submitTask(
  "TASK-003",
  "Design database recovery and retry mechanisms.",
  1,
  sharedResource
);

const runtime = new AgentRuntime(controller, workers);

console.log("\n===== RESOURCE CONTENTION TEST =====");
console.log("All three tasks require shared-database.");

const result = await runtime.runAll();

console.log("\n===== FINAL RESULT =====");
console.log(JSON.stringify(result, null, 2));

console.log("\n===== RESOURCE LOCKS =====");
console.log(controller.resources.getLocks());

console.log("\n===== TASK STATUS =====");
console.table(
  controller.tasks.list().map(task => ({
    task: task.id,
    agent: task.assignedTo,
    status: task.status
  }))
);
