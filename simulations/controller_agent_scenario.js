import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

const controller = new TrafficController();

const planner = new AIAgent(
  "Agent-Planner",
  "Architecture design and task decomposition"
);

const analyst = new AIAgent(
  "Agent-Analyst",
  "Concurrency analysis, resource contention and deadlock detection"
);

const coordinator = new AIAgent(
  "Agent-Coordinator",
  "Execution scheduling, prioritization and coordination strategy"
);

const workers = [planner, analyst, coordinator];

for (const worker of workers) {
  controller.registerAgent(worker.id, worker.role);
}

controller.submitTask(
  "TASK-001",
  "Design the architecture for a software-based multi-agent coordination engine.",
  3
);

controller.submitTask(
  "TASK-002",
  "Analyze the architecture for race conditions, resource conflicts, deadlocks and recovery risks.",
  2
);

controller.submitTask(
  "TASK-003",
  "Create the execution strategy using the architecture and risk analysis.",
  1
);

const runtime = new AgentRuntime(controller, workers);

console.log("\n===== CONTROLLER-DRIVEN AGENT EXECUTION =====");

const results = await runtime.runAll();

console.log("\n===== EXECUTION SUMMARY =====");

console.table(
  results.map(r => ({
    task: r.taskId,
    agent: r.agentId,
    status: r.status,
    duration: r.durationMs
  }))
);

console.log("\n===== FINAL TASK STATUS =====");

console.table(
  controller.getStatus().tasks.map(t => ({
    id: t.id,
    assignedTo: t.assignedTo,
    status: t.status,
    priority: t.priority
  }))
);

console.log("\n===== DEADLOCK STATUS =====");
console.log(controller.getStatus().deadlocks);
