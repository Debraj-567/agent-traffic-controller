const $ = id => document.getElementById(id);

let selectedCount = 3;
let latestState = null;
let events = [];
let replayTimer = null;
let replaying = false;
let lastDeadlockId = null;

const eventSource = new EventSource("/api/events");

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function timeString(value) {
  if (!value) return "--:--:--";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2600);
}

function addEvent(event) {
  if (!event || events.some(item => item.id === event.id)) return;

  events.push(event);
  events.sort((a, b) => a.id - b.id);
  events = events.slice(-180);

  if (event.type === "deadlock.detected") {
    lastDeadlockId = event.id;
    toast("CIRCULAR WAIT DETECTED — INCIDENT RECORDED");
  }

  if (event.type === "agent.cancelled") {
    toast(`VICTIM CANCELLED: ${event.agentId}`);
  }

  if (!replaying) renderEvents();
}

eventSource.addEventListener("telemetry", event => {
  try {
    addEvent(JSON.parse(event.data));
  } catch {
    console.warn("Invalid telemetry packet");
  }
});

eventSource.onopen = () => {
  $("engine-state").textContent = "TELEMETRY CONNECTED";
};

eventSource.onerror = () => {
  $("engine-state").textContent = "RECONNECTING";
};

async function fetchState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("State endpoint unavailable");

    latestState = await response.json();
    renderState(latestState);
  } catch (error) {
    $("engine-state").textContent = "API DISCONNECTED";
    $("health-label").textContent = "CONNECTION LOST";
    $("health-square").className = "status-square danger";
  }
}

function renderState(state) {
  const agents = state.agents || [];
  const tasks = state.tasks || [];
  const locks = state.locks || {};
  const waiting = state.waiting || {};
  const graph = state.waitGraph || {};
  const deadlock = state.deadlocks || {};
  const active = state.activeExecutions || [];

  const completed = tasks.filter(task => task.status === "completed").length;
  const running = tasks.filter(task => task.status === "running").length;
  const lockedCount = Object.keys(locks).length;
  const waitingCount = Object.values(waiting).reduce(
    (sum, queue) => sum + queue.length, 0
  );

  $("metric-agents").textContent = String(agents.length).padStart(2, "0");
  $("metric-agents-active").textContent =
    `${agents.filter(agent => agent.status === "working").length} working`;

  $("metric-tasks").textContent =
    `${String(completed).padStart(2, "0")}/${String(tasks.length).padStart(2, "0")}`;
  $("metric-task-detail").textContent = `${running} currently running`;

  $("metric-locks").textContent = String(lockedCount).padStart(2, "0");
  $("metric-lock-detail").textContent =
    waitingCount ? `${waitingCount} requests queued` : "No queued requests";

  const incidentCount = events.filter(event =>
    event.type === "deadlock.detected"
  ).length;

  $("metric-incidents").textContent = String(incidentCount).padStart(2, "0");
  $("metric-recovery").textContent =
    incidentCount ? "Recovery events recorded" : "Recovery standing by";

  const isRunning = state.runStatus === "running";
  const isFailed = state.runStatus === "failed";
  const isDeadlocked = Boolean(deadlock.deadlocked);

  $("engine-state").textContent = isRunning ? "EXECUTING" :
    isFailed ? "TEST FAILED" : "ENGINE ONLINE";

  $("health-label").textContent = isDeadlocked ? "DEADLOCK ACTIVE" :
    isRunning ? "EXECUTION ACTIVE" :
    state.runStatus === "passed" ? "RECOVERY VERIFIED" : "STANDBY";

  $("health-square").className = "status-square" +
    (isDeadlocked ? " danger" : isRunning ? " warning" : "");

  $("metric-lock-detail").textContent = waitingCount
    ? `${waitingCount} requests queued`
    : lockedCount ? "Resources currently held" : "No active locks";

  $("agent-count-tag").textContent = `${agents.length} REGISTERED`;

  renderGraph(agents, graph, deadlock);
  renderResources(locks, waiting);
  renderAgents(agents, tasks, active);
  renderTestResults(state.runSummary);

  $("chaos-status").textContent =
    state.runStatus === "running" ? "TEST EXECUTING / LIVE BACKEND" :
    state.runStatus === "passed" ? "TEST COMPLETE / ASSERTIONS PASSED" :
    state.runStatus === "failed" ? "TEST COMPLETE / ASSERTIONS FAILED" :
    "ENGINE STANDING BY / NO TEST ACTIVE";

  $("run-chaos").disabled = isRunning;
  $("run-chaos").innerHTML = isRunning
    ? "<span>◌</span> EXECUTION IN PROGRESS <i>LIVE</i>"
    : "<span>▶</span> EXECUTE STRESS TEST <i>↗</i>";

  $("replay-button").disabled = !events.some(
    event => event.type === "deadlock.detected"
  );

  $("footer-time").textContent = timeString(state.serverTime);
}

function renderGraph(agents, graph, deadlock) {
  const svg = $("dependency-graph");
  const edges = Object.entries(graph).flatMap(([from, targets]) =>
    (targets || []).map(to => ({ from, to }))
  );

  const names = [...new Set([
    ...agents.map(agent => agent.id),
    ...edges.flatMap(edge => [edge.from, edge.to])
  ])];

  $("graph-nodes").textContent = `${names.length} NODES / ${edges.length} EDGES`;
  $("graph-state").textContent = deadlock.deadlocked
    ? "CIRCULAR WAIT DETECTED"
    : edges.length ? "DEPENDENCIES ACTIVE" : "NO ACTIVE CYCLES";

  if (!names.length) {
    svg.innerHTML = `
      <g class="graph-empty">
        <circle cx="350" cy="145" r="42"></circle>
        <text x="350" y="140" text-anchor="middle">NO NODES</text>
        <text x="350" y="160" text-anchor="middle" class="graph-empty-sub">AWAITING AGENTS</text>
      </g>`;
    return;
  }

  const center = { x: 350, y: 145 };
  const radius = names.length > 8 ? 115 : 105;
  const positions = {};

  names.forEach((name, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / names.length;
    positions[name] = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  });

  const cycles = deadlock.cycles || [];
  const cycleEdges = new Set();

  cycles.forEach(cycle => {
    for (let i = 0; i < cycle.length - 1; i++) {
      cycleEdges.add(`${cycle[i]}->${cycle[i + 1]}`);
    }
  });

  const edgeMarkup = edges.map(edge => {
    const a = positions[edge.from];
    const b = positions[edge.to];
    if (!a || !b) return "";

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const sx = a.x + dx / length * 23;
    const sy = a.y + dy / length * 23;
    const ex = b.x - dx / length * 23;
    const ey = b.y - dy / length * 23;
    const curve = cycleEdges.has(`${edge.from}->${edge.to}`);

    return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"
      class="graph-edge ${curve ? "cycle" : ""}"
      marker-end="url(#arrowhead)"/>`;
  }).join("");

  const nodeMarkup = names.map(name => {
    const p = positions[name];
    const agent = agents.find(item => item.id === name);
    const busy = agent && ["waiting", "working"].includes(agent.status);

    return `
      <g>
        <circle cx="${p.x}" cy="${p.y}" r="22"
          class="graph-node ${busy ? "busy" : ""}"/>
        <text x="${p.x}" y="${p.y + 4}" class="graph-node-label">
          ${escapeHTML(name.replace("Agent-", "A"))}
        </text>
      </g>`;
  }).join("");

  svg.innerHTML = `
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="8"
        refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#71917a"/>
      </marker>
    </defs>
    <circle cx="350" cy="145" r="136" fill="none"
      stroke="#1d2921" stroke-dasharray="2 7"/>
    ${edgeMarkup}
    ${nodeMarkup}
    <text x="350" y="310" fill="#66766b" font-size="8"
      text-anchor="middle" font-family="monospace">
      ${edges.length} ACTIVE DEPENDENCY EDGES
    </text>`;
}

function renderResources(locks, waiting) {
  const resources = [...new Set([
    "database", "cache",
    ...Object.keys(locks),
    ...Object.keys(waiting)
  ])];

  let totalWaiting = 0;

  $("resource-list").innerHTML = resources.map(resource => {
    const owner = locks[resource] || null;
    const queue = waiting[resource] || [];
    totalWaiting += queue.length;

    const queueNames = queue.map(item => item.agentId).join(" · ");

    return `
      <div class="resource-row">
        <div class="resource-head">
          <span class="resource-name">${escapeHTML(resource.toUpperCase())}</span>
          <span class="lock-state ${owner ? "locked" : ""}">
            ${owner ? "● LOCKED" : "○ AVAILABLE"}
          </span>
        </div>
        <div class="resource-owner">
          OWNER / ${escapeHTML(owner || "NONE")}
        </div>
        <div class="queue-track">
          <div class="queue-fill" style="width:${Math.min(queue.length * 18, 100)}%"></div>
        </div>
        <div class="resource-queue">
          QUEUE / ${queue.length ? escapeHTML(queueNames) : "EMPTY"}
        </div>
      </div>`;
  }).join("");

  $("queue-total").textContent = `${totalWaiting} WAITING`;
}

function renderAgents(agents, tasks, active) {
  if (!agents.length) {
    $("agent-list").innerHTML =
      '<div class="empty-state">No agents registered. Launch a scenario in the Chaos Laboratory.</div>';
    return;
  }

  $("agent-list").innerHTML = agents.map(agent => {
    const task = tasks.find(item =>
      item.id === agent.currentTask || item.assignedTo === agent.id &&
      item.status === "running"
    );

    const execution = active.find(item => item.agentId === agent.id);
    const status = agent.status || "idle";

    return `
      <div class="agent-card">
        <div class="agent-card-head">
          <span class="agent-id">${escapeHTML(agent.id)}</span>
          <span class="state-pill ${escapeHTML(status)}">${escapeHTML(status.toUpperCase())}</span>
        </div>
        <div class="agent-role">${escapeHTML(agent.role || "worker")}</div>
        <div class="agent-meta">
          <span>${escapeHTML(task?.id || execution?.taskId || "NO TASK")}</span>
          <span>${agent.blockedBy ? `WAIT → ${escapeHTML(agent.blockedBy)}` : "LOCAL"}</span>
        </div>
      </div>`;
  }).join("");
}

const eventLabels = {
  "agent.registered": "AGENT REGISTERED",
  "task.submitted": "TASK SUBMITTED",
  "task.assigned": "TASK ASSIGNED",
  "task.execution_started": "EXECUTION STARTED",
  "agent.started": "WORKER STARTED",
  "resource.acquired": "RESOURCE ACQUIRED",
  "resource.waiting": "RESOURCE WAITING",
  "resource.released": "RESOURCE RELEASED",
  "resource.granted": "RESOURCE GRANTED",
  "deadlock.detected": "DEADLOCK DETECTED",
  "deadlock.victim_selected": "VICTIM SELECTED",
  "agent.cancellation_requested": "CANCELLATION REQUESTED",
  "agent.cancelled": "AGENT CANCELLED",
  "task.requeued": "TASK REQUEUED",
  "task.completed": "TASK COMPLETED",
  "task.failed": "TASK FAILED",
  "deadlock.recovered": "RECOVERY RECORDED",
  "chaos.started": "CHAOS TEST STARTED",
  "chaos.completed": "CHAOS TEST COMPLETED",
  "chaos.failed": "CHAOS TEST FAILED"
};

function eventSubject(event) {
  return event.agentId || event.victimAgent || event.taskId ||
    event.resourceId || event.agentCount && `${event.agentCount} AGENTS` || "SYSTEM";
}

function renderEvents() {
  $("event-count").textContent = `${events.length} EVENTS`;

  const visible = events.slice(-45).reverse();

  if (!visible.length) {
    $("event-list").innerHTML =
      '<div class="empty-state">Waiting for runtime events...</div>';
    return;
  }

  $("event-list").innerHTML = visible.map(event => {
    const label = eventLabels[event.type] || event.type.toUpperCase();
    const alert = event.type.includes("deadlock") || event.type.includes("failed");
    const warn = event.type.includes("cancel") || event.type.includes("waiting");

    return `
      <div class="event-row" data-event-id="${event.id}">
        <span class="event-type ${alert ? "alert" : warn ? "warn" : ""}">
          ${escapeHTML(label)}
        </span>
        <span class="event-subject">${escapeHTML(eventSubject(event))}</span>
        <span class="event-time">${timeString(event.timestamp)}</span>
      </div>`;
  }).join("");
}

function renderTestResults(summary) {
  const container = $("test-results");

  if (!summary) {
    container.innerHTML =
      '<div class="empty-state">Run a test to generate verifiable assertions.</div>';
    return;
  }

  if (summary.error) {
    container.innerHTML = `<div class="test-result">
      <span>${escapeHTML(summary.error)}</span><b class="fail">ERROR</b>
    </div>`;
    return;
  }

  container.innerHTML = (summary.checks || []).map(check => `
    <div class="test-result">
      <span>${escapeHTML(check.name)}</span>
      <b class="${check.passed ? "pass" : "fail"}">
        ${check.passed ? "PASS" : "FAIL"}
      </b>
    </div>`).join("") +
    `<div class="test-result">
      <span>${summary.completedTasks}/${summary.agentCount} tasks completed</span>
      <b class="${summary.passed ? "pass" : "fail"}">${summary.passed ? "VERIFIED" : "INCOMPLETE"}</b>
    </div>`;
}

$("worker-select").addEventListener("click", event => {
  const button = event.target.closest("button[data-count]");
  if (!button) return;

  selectedCount = Number(button.dataset.count);

  document.querySelectorAll(".worker-select button").forEach(item => {
    item.classList.toggle("selected", item === button);
  });
});

$("run-chaos").addEventListener("click", async () => {
  $("run-chaos").disabled = true;
  $("chaos-status").textContent = "INITIALIZING TEST / CONTACTING RUNTIME";

  try {
    const response = await fetch("/api/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentCount: selectedCount })
    });

    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "Test could not start");

    toast(`${selectedCount} AGENT STRESS TEST STARTED`);
    fetchState();
  } catch (error) {
    toast(error.message);
    $("run-chaos").disabled = false;
  }
});

$("clear-view").addEventListener("click", () => {
  events = [];
  lastDeadlockId = null;
  renderEvents();
  $("replay-button").disabled = true;
  toast("EVENT VIEW CLEARED");
});

$("replay-button").addEventListener("click", () => {
  if (replayTimer) clearInterval(replayTimer);

  const start = lastDeadlockId || 0;
  const incident = events.filter(event =>
    event.id >= start &&
    [
      "deadlock.detected",
      "deadlock.victim_selected",
      "agent.cancellation_requested",
      "agent.cancelled",
      "resource.released",
      "resource.granted",
      "task.requeued",
      "task.completed",
      "deadlock.recovered"
    ].includes(event.type)
  );

  if (!incident.length) return;

  replaying = true;
  let index = 0;
  $("event-list").innerHTML = "";
  toast("PLAYING RECORDED INCIDENT");

  replayTimer = setInterval(() => {
    if (index >= incident.length) {
      clearInterval(replayTimer);
      replayTimer = null;
      replaying = false;
      renderEvents();
      return;
    }

    const event = incident[index++];
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <span class="event-type warn">${escapeHTML(eventLabels[event.type] || event.type)}</span>
      <span class="event-subject">${escapeHTML(eventSubject(event))}</span>
      <span class="event-time">${timeString(event.timestamp)}</span>`;
    $("event-list").prepend(row);
  }, 650);
});

function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("en-GB", { hour12: false });
}

document.querySelectorAll(".nav-item").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(item =>
      item.classList.toggle("active", item === link)
    );
  });
});

updateClock();
setInterval(updateClock, 1000);
fetchState();
setInterval(fetchState, 1200);
