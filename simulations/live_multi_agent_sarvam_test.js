import "dotenv/config";
import assert from "node:assert/strict";

import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

if (!process.env.SARVAM_API_KEY) {
  throw new Error("SARVAM_API_KEY missing from .env");
}

const controller = new TrafficController();

const agents = [
  new AIAgent(
    "Research-Agent",
    "Research Specialist"
  ),
  new AIAgent(
    "Analysis-Agent",
    "Data Analysis Specialist"
  ),
  new AIAgent(
    "Execution-Agent",
    "Execution and Coordination Specialist"
  )
];

const tasks = [
  {
    id: "LIVE-MULTI-001",
    description: `
      You are the Research Agent.

      Perform these exact operations:
      1. Acquire the shared resource named database.
      2. Call get_resource_status while holding it.
      3. Release database.
      4. Explain what happened.

      You MUST call the actual resource tools.
      Do not merely describe the operations.
    `
  },
  {
    id: "LIVE-MULTI-002",
    description: `
      You are the Analysis Agent.

      Perform these exact operations:
      1. Acquire the shared resource named cache.
      2. Call get_resource_status.
      3. Release cache.
      4. Explain what happened.

      You MUST call the actual resource tools.
      Do not merely describe the operations.
    `
  },
  {
    id: "LIVE-MULTI-003",
    description: `
      You are the Execution Agent.

      Perform these exact operations:
      1. Acquire the shared resource named database.
      2. Call get_resource_status.
      3. Release database.
      4. Explain what happened.

      Another agent may own database.
      If your request waits, wait for ATC to grant it.
      Do not assume acquisition succeeded.

      You MUST call the actual resource tools.
    `
  }
];

agents.forEach((agent, index) => {
  controller.registerAgent(agent.id, agent.role);

  controller.submitTask(
    tasks[index].id,
    tasks[index].description,
    10 - index,
    []
  );
});

const runtime = new AgentRuntime(controller, agents);

console.log("\n========================================");
console.log(" ATC — LIVE MULTI-AGENT SARVAM TEST");
console.log("========================================");
console.log("Provider: Sarvam");
console.log("Model: glm5.3");
console.log("Agents: 3");
console.log("Execution: Concurrent");
console.log("Resources: database, cache");
console.log("Mode: REAL API CALLS");
console.log("========================================\n");

const startedAt = Date.now();

const result = await runtime.runAll();

const duration = Date.now() - startedAt;
const finalTasks = controller.tasks.list();
const events = controller.eventBus.getLatest(500);
const locks = controller.resources.getLocks();
const graph = controller.waitGraph.getGraph();

const resourceEvents = {
  acquired: events.filter(e => e.type === "resource.acquired").length,
  waiting: events.filter(e => e.type === "resource.waiting").length,
  granted: events.filter(e => e.type === "resource.granted").length,
  released: events.filter(e => e.type === "resource.released").length
};

console.log("\n===== EXECUTION RESULTS =====");

console.table(finalTasks.map(task => ({
  id: task.id,
  status: task.status,
  retryCount: task.retryCount
})));

console.log("\n===== RESOURCE TELEMETRY =====");
console.table([resourceEvents]);

console.log("\n===== FINAL SYSTEM STATE =====");
console.log("Run status:", result.status);
console.log("Duration:", duration, "ms");
console.log("Locks:", locks);
console.log("Wait-for graph:", graph);

const checks = [
  {
    name: "All three tasks completed",
    passed: finalTasks.length === 3 &&
      finalTasks.every(task => task.status === "completed")
  },
  {
    name: "Actual resource tools executed",
    passed: resourceEvents.acquired >= 3
  },
  {
    name: "Resources released",
    passed: resourceEvents.released >= 3
  },
  {
    name: "All locks cleared",
    passed: Object.keys(locks).length === 0
  },
  {
    name: "Wait-for graph cleared",
    passed: Object.values(graph).every(edges => edges.length === 0)
  },
  {
    name: "All agents idle",
    passed: agents.every(agent => agent.status === "idle")
  }
];

console.log("\n===== VALIDATION =====");
console.table(checks);

const passed = checks.every(check => check.passed);

console.log(
  passed
    ? "\nPASS: Three live Sarvam agents coordinated through ATC."
    : "\nFAILED: Inspect task results and telemetry above."
);

if (!passed) {
  process.exitCode = 1;
}
