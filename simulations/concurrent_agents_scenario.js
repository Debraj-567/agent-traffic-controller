import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

const controller = new TrafficController();

const workers = [
  new AIAgent("Agent-Planner", "Architecture and task planning"),
  new AIAgent("Agent-Analyst", "Concurrency and deadlock analysis"),
  new AIAgent("Agent-Coordinator", "Execution coordination")
];

for (const worker of workers) {
  controller.registerAgent(worker.id, worker.role);
}

controller.submitTask(
  "TASK-001",
  "Design a technical architecture for an AI agent traffic controller.",
  3,
  ["architecture-store"]
);

controller.submitTask(
  "TASK-002",
  "Analyze concurrency risks and deadlock prevention strategies.",
  2,
  ["analysis-store"]
);

controller.submitTask(
  "TASK-003",
  "Design a task scheduling and recovery strategy.",
  1,
  ["execution-store"]
);

const runtime = new AgentRuntime(controller, workers);

console.log("\n===== CONCURRENT AGENT EXECUTION =====");

const startedAt = Date.now();
const results = await runtime.runConcurrent();
const totalDuration = Date.now() - startedAt;

console.log("\n===== EXECUTION RESULTS =====");

console.table(
  results.map(result => ({
    task: result.taskId,
    agent: result.agentId,
    status: result.status,
    duration: result.durationMs
  }))
);

console.log("\nTotal batch duration:", totalDuration, "ms");

console.log("\n===== RESOURCE LOCKS AFTER EXECUTION =====");
console.log(controller.resources.getLocks());

console.log("\n===== FINAL TASK STATUS =====");
console.table(
  controller.tasks.list().map(task => ({
    id: task.id,
    agent: task.assignedTo,
    status: task.status,
    priority: task.priority
  }))
);
