import { runSarvamToolLoop } from "../sarvam/client.js";
import {
  RESOURCE_TOOLS,
  executeResourceTool
} from "./resource_tools.js";

export class AIAgent {
  constructor(id, role) {
    this.id = id;
    this.role = role;
    this.status = "idle";
    this.lastResult = null;
  }

  async execute(
    task,
    context = "",
    {
      signal,
      requestResource,
      releaseResource,
      getResourceStatus
    } = {}
  ) {
    if (this.status === "working") {
      throw new Error(`${this.id} is already working`);
    }

    if (signal?.aborted) {
      const error = new Error("Agent execution cancelled before starting");
      error.name = "AbortError";
      throw error;
    }

    if (
      typeof requestResource !== "function" ||
      typeof releaseResource !== "function" ||
      typeof getResourceStatus !== "function"
    ) {
      throw new Error("Runtime resource tools are not connected");
    }

    this.status = "working";

    const resourceApi = {
      requestResource,
      releaseResource,
      getResourceStatus
    };

    try {
      console.log(`\n[${this.id}] Starting task: ${task}`);

      const result = await runSarvamToolLoop(
        [
          {
            role: "system",
            content: `
You are ${this.id}, a specialist AI agent.

Your role: ${this.role}.

PROJECT:
We are building an Agent Traffic Controller.
It coordinates AI agents, shared resources, dependencies,
conflicts, circular waits, deadlocks and recovery.

This is NOT a road traffic management system.

RESOURCE TOOL RULES:
1. Use request_resource before accessing a shared resource.
2. Wait for its result. Never assume a lock was granted.
3. Use get_resource_status when resource ownership or contention is unclear.
4. Release resources after completing the operations that require them.
5. Never claim to own a resource unless the tool confirms it.
6. Never invent resource identifiers or tool results.
7. If a resource request is cancelled, stop the task immediately.
8. Do not repeatedly request the same resource without a reason.

Perform only your assigned role.
Use previous agent output when provided.
Distinguish implemented functionality from recommendations.
            `.trim()
          },
          {
            role: "user",
            content: `
TASK:
${task}

PREVIOUS AGENT OUTPUT:
${context || "No previous output."}

Complete the task using resource tools whenever shared resources are needed.
Return a structured technical response.
            `.trim()
          }
        ],
        {
          signal,
          tools: RESOURCE_TOOLS,
          maxToolCalls: 8,
          executeTool: (name, args) =>
            executeResourceTool(name, args, {
              agentId: this.id,
              resourceApi
            })
        }
      );

      this.lastResult = result;

      return {
        agentId: this.id,
        role: this.role,
        status: "completed",
        result
      };

    } catch (error) {
      this.status =
        error.name === "AbortError" ? "cancelled" : "failed";

      throw error;

    } finally {
      if (this.status === "working") {
        this.status = "idle";
      }
    }
  }
}
