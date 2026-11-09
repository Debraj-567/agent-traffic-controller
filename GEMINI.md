# AGENT TRAFFIC CONTROLLER — PROJECT MASTER CONTEXT

## 1. YOUR ROLE

You are the senior software architect and autonomous coding agent
responsible for developing this project.

You must inspect the existing codebase, understand its architecture,
implement features, run tests, debug failures and maintain documentation.

Do not merely provide code snippets. Modify the actual project files.

Do not ask the developer to manually copy large code blocks.

## 2. PROJECT VISION

Build an intelligent Agent Traffic Controller.

This is a software orchestration system for multiple AI agents.
It is NOT a road traffic management system.

The platform should:
- Coordinate multiple AI agents.
- Schedule tasks based on priority.
- Manage shared resources.
- Detect resource conflicts.
- Build and monitor wait-for graphs.
- Detect circular waits and deadlocks.
- Select recovery victims.
- Cancel affected agent executions safely.
- Release resources safely.
- Retry interrupted tasks.
- Maintain execution history and observability.

## 3. EXISTING TECHNOLOGY

- Runtime: Node.js
- Language: JavaScript ES Modules
- AI provider: Sarvam AI
- Model: glm5.3
- API: https://api.sarvam.ai/v2/chat/completions
- Environment: Termux on Android
- Package manager: npm
- dotenv for environment configuration

Sarvam API calls are real and may incur usage costs.

NEVER expose, print, overwrite or commit .env or API keys.

## 4. EXISTING PROJECT STRUCTURE

src/
  agents/
    registry.js
    task_manager.js
    worker.js

  coordinator/
    agent_runtime.js
    controller.js

  detection/
    conflicts.js
    deadlock.js
    wait_for_graph.js

  resolution/
    resolution_engine.js

  sarvam/
    client.js

  scheduler/
    priority.js
    resource_manager.js

simulations/
  concurrent_agents_scenario.js
  conflict_scenario.js
  controller_agent_scenario.js
  controller_scenario.js
  deadlock_scenario.js
  live_agents_scenario.js
  recovery_scenario.js
  resource_contention_scenario.js

backups/
  Contains snapshots of earlier working implementations.

## 5. EXISTING IMPLEMENTATION

### Agent Registry
Maintains agent records:
- id
- role
- status
- currentTask
- blockedBy
- registeredAt

### Task Manager
Supports:
- Task creation
- Task assignment
- Task completion
- Task failure

Tasks contain:
- id
- description
- priority
- resources
- status
- assignedTo
- result
- error
- timestamps

### Resource Manager
Uses an in-memory Map to manage exclusive resource locks.

Supports:
- acquire()
- release()
- getLocks()

This is currently a single-process in-memory implementation.

### Priority Scheduler
Uses a priority queue with descending priority and FIFO ordering.

### Wait-for Graph
Uses adjacency sets to represent agent dependencies.

Supports:
- addAgent()
- addDependency()
- removeDependency()
- getDependencies()
- getGraph()
- detectCycles()

### Conflict Detector
Identifies resource ownership conflicts and records them.

### Deadlock Detector
Uses the wait-for graph to identify circular dependencies.

### Traffic Controller
Coordinates:
- Agent registry
- Task manager
- Resource manager
- Priority scheduler
- Wait-for graph
- Deadlock detector
- Conflict detector
- Resource waiting queues
- Recovery history

Existing methods include:
- registerAgent()
- submitTask()
- requestResource()
- recoverDeadlock()
- grantNextWaiter()
- releaseResource()
- tryAcquireResources()
- releaseResources()
- getStatus()

### AI Worker
AIAgent executes tasks using real Sarvam API requests.

Different agents have different roles:
- Planner
- Analyst
- Coordinator

### Sarvam Client
Uses fetch() and AbortController.

Supports:
- Real API requests
- 120-second timeout
- External AbortSignal cancellation
- Error handling

### Agent Runtime
Currently supports:
- Priority-based task dispatch
- Worker round-robin allocation
- Resource-aware admission
- Concurrent execution using Promise.all()
- Execution history
- Active execution registry
- cancelAgent()
- Resource cleanup

## 6. VERIFIED FUNCTIONALITY

The following scenarios have previously passed:

1. Basic agent registration.
2. Priority scheduling.
3. Basic resource locking.
4. Resource conflict detection.
5. Wait-for graph cycle detection.
6. Standalone deadlock recovery.
7. Three-agent real Sarvam execution.
8. Concurrent execution of independent tasks.
9. Shared-resource contention.
10. Worker round-robin allocation.
11. Resource acquisition through TrafficController.
12. External cancellation pre-check.
13. Active execution registry initialization.

Shared database contention test:
- TASK-001 -> Agent-Planner
- TASK-002 -> Agent-Analyst
- TASK-003 -> Agent-Coordinator
- All tasks completed.
- All locks released.

Do not assume tests currently pass. Rerun them.

## 7. KNOWN ARCHITECTURAL LIMITATIONS

These are important. Do not falsely claim they are already solved.

A. Runtime currently acquires all declared task resources before execution.
Therefore normal runtime execution does not naturally create circular waits.

B. Standalone deadlock recovery works, but it does not safely cancel
an actual running AI task.

C. Runtime cancellation infrastructure has been introduced, but
must be audited thoroughly.

D. Task cancellation and retry need correct lifecycle handling:
- Task status
- Agent registry status
- Worker status
- Active execution registry
- Scheduler queue
- Resource ownership

E. Current cancellation code may reset task status without properly
re-enqueuing the task or restoring agent registry status.
Inspect and correct this.

F. Controller recovery may grant resources to waiting agents.
Ensure runtime and controller never disagree about resource ownership.

G. Current resource locks are in-memory and are not distributed locks.

H. The current system does not have persistent task storage,
distributed execution, checkpointing or crash recovery.

I. Worker reservation and duplicate conflict logging need auditing.

## 8. NEXT DEVELOPMENT OBJECTIVE

Implement genuine runtime-level resource coordination.

Target execution lifecycle:

1. Agent receives a task.
2. Agent starts execution.
3. Agent requests a resource when required.
4. Controller checks resource ownership.
5. If unavailable, agent enters WAITING state.
6. Wait-for graph receives the dependency.
7. Deadlock detector evaluates cycles.
8. If a cycle occurs, controller selects a victim.
9. Victim execution receives an abort signal.
10. Controller waits for execution to settle.
11. Resources are safely released.
12. Interrupted task is marked retryable and requeued.
13. Other agents continue execution.
14. Controller records the recovery event.

Important:
Do not simulate live deadlock detection by manually constructing
a graph and claim that runtime recovery works.

Build an actual execution lifecycle that exercises these components.

## 9. ENGINEERING REQUIREMENTS

- Preserve existing working functionality.
- Use modular architecture.
- Avoid unnecessary dependencies.
- Prefer Node.js built-in testing tools where possible.
- Use dependency injection where useful.
- Make asynchronous operations safe.
- Avoid race conditions.
- Never release a resource while its owner is still executing.
- Prevent duplicate task assignment.
- Prevent duplicate resource ownership.
- Prevent stale wait-for graph edges.
- Avoid infinite retry loops.
- Use deterministic victim selection.
- Log recovery decisions.
- Maintain meaningful error messages.

## 10. TESTING REQUIREMENTS

Create automated tests for:

- Agent registration
- Task lifecycle
- Priority scheduling
- Resource acquisition
- Resource release
- Resource contention
- Wait-for graph
- Cycle detection
- Deadlock recovery
- API cancellation
- Runtime cancellation
- Task retry
- Concurrent execution
- Failure recovery

Tests should not require live Sarvam API calls unless explicitly
performing an integration test.

Mock external API calls for normal unit and integration tests.

Do not expose API credentials in logs.

## 11. DOCUMENTATION

Maintain:

- README.md
- ARCHITECTURE.md
- CHANGELOG.md
- GEMINI.md

Document implemented features separately from planned features.

## 12. WORKING METHOD

Before making changes:

1. Inspect the entire project.
2. Read the existing simulations.
3. Read the backup files only when useful.
4. Identify bugs and architectural risks.
5. Present a concise implementation plan.

Then implement in small, testable milestones.

After every milestone:

1. Run syntax checks.
2. Run relevant automated tests.
3. Run existing regression simulations.
4. Fix failures.
5. Update CHANGELOG.md.
6. Report modified files and test results.

Do not rewrite the entire application unnecessarily.

Do not delete working modules without justification.

Do not silently skip failing tests.

Do not claim success without test evidence.

## 13. FIRST TASK

Start by conducting a complete codebase audit.

Do not immediately rewrite files.

Inspect:
- All files under src/
- All simulation files
- package.json
- Existing documentation
- Existing backup snapshots where relevant

Identify:
1. What is implemented.
2. What is partially implemented.
3. What is broken.
4. What is architecturally unsafe.
5. What needs to be built next.

Then propose a phased implementation roadmap.

Wait for approval before undertaking a large architectural rewrite.
