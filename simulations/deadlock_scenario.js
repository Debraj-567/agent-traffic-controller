import { WaitForGraph } from "../src/detection/wait_for_graph.js";
import { DeadlockDetector } from "../src/detection/deadlock.js";

const graph = new WaitForGraph();

graph.addDependency("Agent-A", "Agent-B");
graph.addDependency("Agent-B", "Agent-C");
graph.addDependency("Agent-C", "Agent-A");

const detector = new DeadlockDetector(graph);

console.log("WAIT-FOR GRAPH:");
console.log(JSON.stringify(graph.getGraph(), null, 2));

console.log("\nDEADLOCK ANALYSIS:");
console.log(JSON.stringify(detector.detect(), null, 2));
