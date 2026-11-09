import { TrafficController } from "../src/coordinator/controller.js";
import { RuntimeResourceCoordinator } from "../src/coordinator/runtime_resource_coordinator.js";

const controller = new TrafficController();

controller.registerAgent("Agent-A");
controller.registerAgent("Agent-B");

const abortControllers = new Map([
  ["Agent-A", new AbortController()],
  ["Agent-B", new AbortController()]
]);

let detected = false;

const coordinator = new RuntimeResourceCoordinator(
  controller,
  (victim, deadlock) => {
    detected = true;

    console.log("\n[TEST] Deadlock detected:", deadlock.cycles);
    console.log("[TEST] Selected victim:", victim);

    abortControllers.get(victim).abort();
  }
);

console.log("\n1. Agent-A acquires database");
controller.resources.acquire("database", "Agent-A");

console.log("2. Agent-B acquires cache");
controller.resources.acquire("cache", "Agent-B");

console.log("\n3. Agent-A requests cache");

const agentARequest = coordinator.request(
  "Agent-A",
  "cache",
  abortControllers.get("Agent-A").signal
);

const agentAResult = agentARequest.catch(error => ({
  error: error.message
}));

console.log("Wait-for graph:", controller.waitGraph.getGraph());

console.log("\n4. Agent-B requests database");

try {
  await coordinator.request(
    "Agent-B",
    "database",
    abortControllers.get("Agent-B").signal
  );
} catch (error) {
  console.log("[TEST] Agent-B request cancelled:", error.message);
}

console.log("\n5. Release Agent-B resources");

coordinator.releaseAll("Agent-B");

const granted = await agentAResult;

console.log("\n6. Agent-A receives cache:", granted);

console.log("\nFINAL LOCKS:");
console.log(controller.resources.getLocks());

console.log("\nFINAL WAIT-FOR GRAPH:");
console.log(controller.waitGraph.getGraph());

const locks = controller.resources.getLocks();
const graph = controller.deadlocks.detect();

if (
  detected &&
  granted.acquired &&
  locks.database === "Agent-A" &&
  locks.cache === "Agent-A" &&
  !graph.deadlocked
) {
  console.log("\nPASS: Runtime resource coordinator test passed.");
} else {
  console.log("\nFAIL: Runtime resource coordinator test failed.");
  process.exitCode = 1;
}
