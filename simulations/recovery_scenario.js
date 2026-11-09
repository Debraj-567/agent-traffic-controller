import { TrafficController } from "../src/coordinator/controller.js";

const controller = new TrafficController();

controller.registerAgent("Agent-A");
controller.registerAgent("Agent-B");

console.log("\n1. Agent-A acquires database:");
console.log(controller.requestResource("Agent-A", "database"));

console.log("\n2. Agent-B acquires cache:");
console.log(controller.requestResource("Agent-B", "cache"));

console.log("\n3. Agent-A requests cache and waits:");
console.log(controller.requestResource("Agent-A", "cache"));

console.log("\n4. Agent-B requests database — this creates a deadlock:");
console.log(
  JSON.stringify(
    controller.requestResource("Agent-B", "database"),
    null,
    2
  )
);

console.log("\n5. Controller status after recovery:");
console.log(JSON.stringify(controller.getStatus(), null, 2));
