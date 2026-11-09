import { AgentRegistry } from "../src/agents/registry.js";
import { ResourceManager } from "../src/scheduler/resource_manager.js";
import { ConflictDetector } from "../src/detection/conflicts.js";
import { WaitForGraph } from "../src/detection/wait_for_graph.js";
import { ResolutionEngine } from "../src/resolution/resolution_engine.js";

const registry = new AgentRegistry();
registry.register("Agent-A");
registry.register("Agent-B");

const resources = new ResourceManager();
resources.acquire("database", "Agent-A");

const detector = new ConflictDetector(resources);

const conflict = detector.check("database", "Agent-B");

console.log("CONFLICT:");
console.log(JSON.stringify(conflict, null, 2));

const graph = new WaitForGraph();

const resolver = new ResolutionEngine(
  resources,
  registry,
  graph
);

console.log("\nRESOLUTION:");
console.log(JSON.stringify(resolver.resolve(conflict), null, 2));
