import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TrafficController } from "./src/coordinator/controller.js";
import { AgentRuntime } from "./src/coordinator/agent_runtime.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

let controller;
let runtime = null;
let runStatus = "idle";
let runSummary = null;
let activeUnsubscribe = null;
const clients = new Set();

function attachController(next) {
  activeUnsubscribe?.();
  controller = next;

  activeUnsubscribe = controller.eventBus.subscribe(event => {
    const packet = `event: telemetry\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      if (!client.destroyed) client.write(packet);
    }
  });
}

function resetSystem() {
  runtime = null;
  runStatus = "idle";
  runSummary = null;
  attachController(new TrafficController());
}

resetSystem();

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function getState() {
  const state = controller.getStatus();

  return {
    ...state,
    waiting: runtime?.resourceCoordinator.getWaiting() ?? {},
    activeExecutions: runtime?.getActiveExecutions() ?? [],
    executionHistory: runtime?.getHistory() ?? [],
    schedulerQueue: controller.scheduler.list().length,
    runStatus,
    runSummary,
    serverTime: new Date().toISOString()
  };
}

function createWorker(id, index, attempts) {
  const firstResource = index % 2 === 0 ? "database" : "cache";
  const secondResource = firstResource === "database" ? "cache" : "database";
  const pairAgent = index < 2;

  return {
    id,

    async execute(task, context, { signal, requestResource }) {
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);

      controller.emitEvent("agent.started", {
        agentId: id,
        taskId: task,
        attempt
      });

      const deliberateDeadlock = pairAgent && attempt === 1;

      // Only the first two agents create the intentional circular wait.
      // Every other execution follows one consistent lock ordering.
      const acquisitionOrder = deliberateDeadlock
        ? [firstResource, secondResource]
        : ["database", "cache"];

      // Additional agents wait until the initial pair owns its first locks.
      if (!pairAgent && attempt === 1) {
        await pairBarrier;
      }

      for (let i = 0; i < acquisitionOrder.length; i++) {
        const resourceId = acquisitionOrder[i];

        controller.emitEvent("agent.requesting_resource", {
          agentId: id,
          resourceId
        });

        await requestResource(resourceId);

        controller.emitEvent("agent.resource_acquired", {
          agentId: id,
          resourceId
        });

        // Synchronize the initial pair after acquiring their first locks.
        if (deliberateDeadlock && i === 0) {
          pairArrivals++;

          if (pairArrivals === 2) {
            controller.emitEvent("chaos.barrier_released", {
              agents: ["Agent-01", "Agent-02"]
            });

            releasePair();
          }

          await pairBarrier;

          if (signal.aborted) {
            const error = new Error("Execution cancelled");
            error.name = "AbortError";
            throw error;
          }
        }
      }

      return {
        message: `${id} completed resource coordination`,
        attempt
      };
    }
  };
}

let pairArrivals = 0;
let releasePair;
let pairBarrier;

function createBarrier() {
  pairArrivals = 0;
  pairBarrier = new Promise(resolve => {
    releasePair = resolve;
  });
}

async function runChaos(agentCount) {
  if (runStatus === "running") {
    return { error: "A stress test is already running." };
  }

  resetSystem();
  createBarrier();

  runStatus = "running";
  controller.emitEvent("chaos.started", {
    agentCount,
    resources: ["database", "cache"]
  });

  const attempts = new Map();
  const workers = Array.from({ length: agentCount }, (_, index) => {
    const id = `Agent-${String(index + 1).padStart(2, "0")}`;
    const worker = createWorker(id, index, attempts);
    controller.registerAgent(id, index < 2 ? "deadlock-test" : "contender");
    return worker;
  });

  workers.forEach((worker, index) => {
    controller.submitTask(
      `CHAOS-${String(index + 1).padStart(3, "0")}`,
      `Acquire shared resources and complete coordination cycle (${worker.id})`,
      agentCount - index,
      []
    );
  });

  runtime = new AgentRuntime(controller, workers);

  try {
    const execution = await runtime.runAll();
    const tasks = controller.tasks.list();
    const history = runtime.getHistory();
    const events = controller.eventBus.getLatest(500);
    const locks = controller.resources.getLocks();
    const graph = controller.waitGraph.getGraph();

    const checks = [
      {
        name: "All tasks completed",
        passed: tasks.length === agentCount &&
          tasks.every(task => task.status === "completed")
      },
      {
        name: "Deadlock detected",
        passed: events.some(event => event.type === "deadlock.detected")
      },
      {
        name: "Victim cancelled",
        passed: history.some(record => record.status === "cancelled")
      },
      {
        name: "Task automatically retried",
        passed: tasks.some(task => task.retryCount >= 1)
      },
      {
        name: "All resource locks released",
        passed: Object.keys(locks).length === 0
      },
      {
        name: "Wait-for graph cleared",
        passed: !controller.deadlocks.detect().deadlocked &&
          Object.values(graph).every(edges => edges.length === 0)
      }
    ];

    const passed = execution.status === "completed" &&
      checks.every(check => check.passed);

    runStatus = passed ? "passed" : "failed";
    runSummary = {
      agentCount,
      passed,
      checks,
      completedTasks: tasks.filter(task => task.status === "completed").length,
      retryCount: tasks.reduce((sum, task) => sum + task.retryCount, 0),
      cancelledExecutions: history.filter(record => record.status === "cancelled").length,
      durationMs: history.reduce((sum, record) => sum + (record.durationMs || 0), 0),
      finishedAt: new Date().toISOString()
    };

    controller.emitEvent("chaos.completed", runSummary);
  } catch (error) {
    runStatus = "failed";
    runSummary = {
      agentCount,
      passed: false,
      error: error.message,
      finishedAt: new Date().toISOString()
    };

    controller.emitEvent("chaos.failed", {
      agentCount,
      error: error.message
    });
  }

  return runSummary;
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) {
      throw new Error("Request body too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, getState());
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    });

    res.write("retry: 2000\n\n");

    for (const event of controller.eventBus.getLatest(100)) {
      res.write(`event: telemetry\ndata: ${JSON.stringify(event)}\n\n`);
    }

    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chaos") {
    try {
      const body = await readBody(req);
      const count = Number(body.agentCount);

      if (![3, 5, 10, 20].includes(count)) {
        return sendJson(res, 400, {
          error: "Choose 3, 5, 10 or 20 agents."
        });
      }

      if (runStatus === "running") {
        return sendJson(res, 409, {
          error: "A stress test is already running."
        });
      }

      // Start the actual runtime execution without blocking the HTTP response.
      runChaos(count);

      return sendJson(res, 202, {
        accepted: true,
        agentCount: count,
        message: "Stress test started."
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    if (runStatus === "running") {
      return sendJson(res, 409, { error: "Cannot reset during an active test." });
    }

    resetSystem();
    return sendJson(res, 200, { reset: true });
  }

  if (req.method === "GET") {
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(ROOT, "public", requested);

    if (!filePath.startsWith(path.resolve(ROOT, "public") + path.sep)) {
      return sendJson(res, 403, { error: "Forbidden" });
    }

    try {
      const content = await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream"
      });
      return res.end(content);
    } catch {
      return sendJson(res, 404, { error: "Not found" });
    }
  }

  return sendJson(res, 404, { error: "Route not found" });
});

server.listen(PORT, HOST, () => {
  console.log("\n====================================");
  console.log(" ATC / CONTROL — AGENT CONTROL ROOM");
  console.log("====================================");
  console.log(` Local: http://${HOST}:${PORT}`);
  console.log(" API:   /api/state");
  console.log(" SSE:   /api/events");
  console.log(" Chaos: POST /api/chaos");
  console.log("====================================\n");
});
