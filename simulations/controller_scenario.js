import { TrafficController } from "../src/coordinator/controller.js";

const controller = new TrafficController();

controller.registerAgent("Agent-A");
controller.registerAgent("Agent-B");
controller.registerAgent("Agent-C");

controller.submitTask("Task-A", "Research", 3);
controller.submitTask("Task-B", "Development", 2);
controller.submitTask("Task-C", "Testing", 1);

controller.resources.acquire("database", "Agent-A");
controller.resources.acquire("cache", "Agent-B");

console.log("AGENT A REQUESTS CACHE:");
console.log(
  JSON.stringify(
    controller.requestResource("Agent-A", "cache"),
    null,
    2
  )
);

console.log("\nAGENT B REQUESTS DATABASE:");
console.log(
  JSON.stringify(
    controller.requestResource("Agent-B", "database"),
    null,
    2
  )
);

console.log("\nCOMPLETE CONTROLLER STATUS:");
console.log(JSON.stringify(controller.getStatus(), null, 2));
