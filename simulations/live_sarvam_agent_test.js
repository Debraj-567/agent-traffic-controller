import "dotenv/config";
import assert from "node:assert/strict";
import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

if (!process.env.SARVAM_API_KEY) {
  throw new Error("SARVAM_API_KEY missing from .env");
}

const controller = new TrafficController();

const agent = new AIAgent(
  "Live-Sarvam-Agent",
  "Resource Coordination Specialist"
);

controller.registerAgent(agent.id, agent.role);

controller.submitTask(
  "LIVE-TEST-001",
  `Use your resource tools to perform these exact steps:
   1. Acquire the resource named database.
   2. Check the resource status.
   3. Release the database resource.
   4. Report what happened.
   You must actually call the tools, not merely describe the steps.`,
  1,
  []
);

const runtime = new AgentRuntime(controller, [agent]);

console.log("\n===== LIVE SARVAM AGENT TEST =====");
console.log("Provider: Sarvam");
console.log("Model: glm5.3");
console.log("Mode: REAL API — no mocked responses\n");

const result = await runtime.runAll();

console.log("\n===== RESULT =====");
console.dir(result, { depth: 4 });

console.log("\n===== FINAL STATE =====");
console.log("Task:", controller.tasks.list()[0]?.status);
console.log("Locks:", controller.resources.getLocks());
console.log("Agent:", agent.status);

assert.equal(result.status, "completed");
assert.equal(controller.tasks.list()[0]?.status, "completed");
assert.deepEqual(controller.resources.getLocks(), {});

console.log("\nPASS: Live Sarvam agent execution completed.");
