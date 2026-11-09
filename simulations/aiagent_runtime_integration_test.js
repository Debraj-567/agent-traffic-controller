import assert from "node:assert/strict";
import { TrafficController } from "../src/coordinator/controller.js";
import { AgentRuntime } from "../src/coordinator/agent_runtime.js";
import { AIAgent } from "../src/agents/worker.js";

process.env.SARVAM_API_KEY ||= "test-only-key";

const responses = [
  {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: {
            name: "request_resource",
            arguments: '{"resource_id":"database"}'
          }
        }]
      }
    }]
  },
  {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-2",
          type: "function",
          function: {
            name: "get_resource_status",
            arguments: "{}"
          }
        }]
      }
    }]
  },
  {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-3",
          type: "function",
          function: {
            name: "release_resource",
            arguments: '{"resource_id":"database"}'
          }
        }]
      }
    }]
  },
  {
    choices: [{
      message: {
        role: "assistant",
        content: "Database coordination completed successfully."
      }
    }]
  }
];

let apiCalls = 0;

globalThis.fetch = async (url, options) => {
  apiCalls++;

  const request = JSON.parse(options.body);

  assert.equal(request.model, "glm5.3");
  assert.ok(request.tools);
  assert.equal(request.parallel_tool_calls, false);

  const response = responses.shift();

  if (!response) {
    throw new Error("Unexpected additional Sarvam request");
  }

  return {
    ok: true,
    status: 200,
    async json() {
      return response;
    }
  };
};

const controller = new TrafficController();

const agent = new AIAgent(
  "Agent-Sarvam-Test",
  "Database Architecture Specialist"
);

controller.registerAgent(agent.id, agent.role);

controller.submitTask(
  "TASK-AI-001",
  "Inspect database coordination and verify resource management.",
  1,
  []
);

const runtime = new AgentRuntime(controller, [agent]);

console.log("\n===== AI AGENT RUNTIME INTEGRATION TEST =====");

const result = await runtime.runAll();

console.log("\nEXECUTION RESULT:");
console.dir(result, { depth: 4 });

console.log("\nFINAL LOCKS:");
console.log(controller.resources.getLocks());

console.log("\nTASK STATUS:");
console.table(controller.tasks.list().map(task => ({
  id: task.id,
  status: task.status,
  retryCount: task.retryCount
})));

assert.equal(result.status, "completed");
assert.equal(controller.tasks.list()[0].status, "completed");
assert.deepEqual(controller.resources.getLocks(), {});
assert.equal(apiCalls, 4);
assert.equal(agent.status, "idle");

console.log("\nPASS: Actual AIAgent and AgentRuntime integration verified.");
console.log("Mock Sarvam API calls:", apiCalls);
