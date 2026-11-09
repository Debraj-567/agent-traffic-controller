import { AIAgent } from "../src/agents/worker.js";

const planner = new AIAgent(
  "Agent-Planner",
  "Task planning and decomposition"
);

const analyst = new AIAgent(
  "Agent-Analyst",
  "Risk analysis and dependency detection"
);

const coordinator = new AIAgent(
  "Agent-Coordinator",
  "Multi-agent execution coordination"
);

const task = `
Design a system that coordinates multiple AI agents.

The system must detect resource conflicts, identify deadlocks,
prioritize tasks and recover from circular waiting conditions.

Propose a practical architecture.
`;

async function runWorkflow() {
  try {
    console.log("=== LIVE MULTI-AGENT EXECUTION ===");

    const plan = await planner.execute(task);

    console.log("\n=== PLANNER OUTPUT ===");
    console.log(plan.result);

    const analysis = await analyst.execute(
      "Review the proposed architecture. Identify risks, dependencies and possible deadlocks.",
      plan.result
    );

    console.log("\n=== ANALYST OUTPUT ===");
    console.log(analysis.result);

    const finalPlan = await coordinator.execute(
      "Create the final coordinated execution strategy.",
      `PLANNER OUTPUT:\n${plan.result}\n\nANALYST OUTPUT:\n${analysis.result}`
    );

    console.log("\n=== COORDINATOR OUTPUT ===");
    console.log(finalPlan.result);

    console.log("\n=== ALL AGENTS COMPLETED ===");
  } catch (error) {
    console.error("\nWORKFLOW FAILED:", error.message);
  }
}

runWorkflow();
