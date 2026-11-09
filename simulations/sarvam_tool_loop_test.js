import assert from "node:assert/strict";

import { runSarvamToolLoop } from "../src/sarvam/client.js";
import {
  RESOURCE_TOOLS,
  executeResourceTool
} from "../src/agents/resource_tools.js";

process.env.SARVAM_API_KEY ||= "test-only-key";

const locks = {};
const waiting = {};

const resourceApi = {
  async requestResource(resourceId) {
    if (locks[resourceId]) {
      throw new Error("Resource is already locked");
    }

    locks[resourceId] = "Agent-Test";

    return {
      acquired: true,
      resourceId,
      agentId: "Agent-Test",
      status: "granted"
    };
  },

  async releaseResource(resourceId) {
    if (locks[resourceId] !== "Agent-Test") {
      return { released: false };
    }

    delete locks[resourceId];

    return {
      released: true,
      resourceId
    };
  },

  getResourceStatus() {
    return {
      locks: { ...locks },
      waiting: { ...waiting }
    };
  }
};

const modelResponses = [
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
        content: "Resource operations completed successfully."
      }
    }]
  }
];

const capturedRequests = [];

async function fakeFetch(url, options) {
  capturedRequests.push(JSON.parse(options.body));

  const data = modelResponses.shift();

  if (!data) {
    throw new Error("Unexpected additional model request");
  }

  return {
    ok: true,
    status: 200,
    async json() {
      return data;
    }
  };
}

const result = await runSarvamToolLoop(
  [{
    role: "user",
    content: "Acquire database, inspect status, release it."
  }],
  {
    signal: new AbortController().signal,
    tools: RESOURCE_TOOLS,
    maxToolCalls: 8,
    fetchImpl: fakeFetch,

    executeTool: (name, args) =>
      executeResourceTool(name, args, {
        agentId: "Agent-Test",
        resourceApi
      })
  }
);

assert.equal(
  result,
  "Resource operations completed successfully."
);

assert.equal(capturedRequests.length, 4);

assert.ok(
  capturedRequests.every(
    request => request.parallel_tool_calls === false
  )
);

const finalConversation = capturedRequests[3].messages;

assert.equal(
  finalConversation.filter(message => message.role === "tool").length,
  3
);

assert.deepEqual(locks, {});

console.log("\n===== SARVAM TOOL LOOP TEST =====");
console.log("Resource acquisition: PASS");
console.log("Resource status inspection: PASS");
console.log("Resource release: PASS");
console.log("Tool result messages: PASS");
console.log("Sequential tool calling: PASS");
console.log("Final model response: PASS");
console.log("Remaining locks:", locks);

console.log("\nPASS: Sarvam tool loop verified.");
