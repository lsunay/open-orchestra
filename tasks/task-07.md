# Task 07 — Workflows as the core primitive: make them configurable + implement memory + vision automation cleanly

## Required context (attach)

Attach `refactory.md` with this task. This task turns two “implicit behaviors” into explicit, configurable workflows:

- Vision auto-analysis currently lives in `src/index.ts:330` (must become a workflow + event)
- Memory auto-record currently lives in `src/index.ts:444` (must become an agent/workflow handshake)
- Worker mapping context: `refactory.md` → “Worker → OpenCode mapping” (memory/vision workers must be OpenCode-native)

## Dependencies

- Task 05 (recommended): memory workflow is far cleaner once workers can run as OpenCode agents (`backend: "agent"`).
- Task 06 (recommended): moving automation into a workflow engine is safer after modularization.

## Standards (non‑negotiable for this task)

- Workflows must be:
  - observable (events/logs)
  - configurable (no hidden “magic”)
  - safe (bounded steps/timeouts)
- Automatic workflows must not block the user’s main interaction unless explicitly configured.

---

## Before (what we have today)

- Workflows exist (`src/workflows/engine.ts`) and there is a built-in RooCode boomerang workflow.
- Vision has an “automatic” path in `chat.message`:
  - schedules analysis and injects placeholder text
- Memory auto-record writes directly to Neo4j on message updates:
  - no dedicated memory agent, no enrichment step, limited observability
- There is no unified “workflow contract” that covers:
  - triggers (on image, on turn end)
  - worker selection
  - success/failure reporting

---

## Current state (exact references)

Workflow engine + built-in workflow:

- Workflow engine core: `src/workflows/engine.ts:1`
- Built-in “RooCode boomerang” workflow: `src/workflows/roocode-boomerang.ts:1`
- Workflow config defaults + bounds: `src/config/orchestrator.ts:316`

Vision automation (implicit workflow today):

- Non-blocking vision analysis scheduling in `chat.message`: `src/index.ts:330`
- Wakeup injection for results: `src/index.ts:419`

Memory automation (implicit workflow today):

- Auto-record call site: `src/index.ts:459`
- Implementation: `src/memory/auto.ts:1`
- Memory injection into system prompt: `src/index.ts:311`

---

## After (definition of done for this task)

- Workflows are a first-class, configurable orchestrator feature:
  - defined in `orchestrator.json` (validated by schema)
  - listable via a tool (`list_workflows`)
  - runnable via a tool (`run_workflow`)
- Vision workflow is defined as a workflow:
  - trigger: incoming message contains images and current agent cannot handle vision
  - behavior: schedule analysis, inject placeholder, emit “completed” event
- Memory becomes an automatic workflow:
  - at the end of each turn, orchestrator sends a summary payload to a **memory subagent**
  - memory subagent enriches and calls a plugin tool to store memory
  - memory workflow emits “done” so the orchestrator can proceed

---

## Expected file tree delta (after Task 07)

This task makes workflows the organizing primitive for “automatic behavior” (vision + memory):

```txt
packages/orchestrator/
  src/
    workflows/
      engine.ts                  # still the core runner (unit tested)
      triggers.ts                # new: trigger evaluation (on image, on turn end)
      builtins/
        vision.ts                # new: vision workflow definition + runner
        memory.ts                # new: memory workflow definition + handshake
    memory/
      tools.ts                   # new/expanded: tools the memory agent calls
  schema/
    orchestrator.schema.json     # add workflow definitions + trigger config
```

## Scope (files you will touch)

- `packages/orchestrator/src/workflows/**` (add trigger model + runtime)
- `packages/orchestrator/src/index.ts` (replace ad-hoc vision/memory automation with workflow triggers)
- `packages/orchestrator/src/memory/**` (tool surface for memory agent to store + acknowledge)
- `packages/orchestrator/schema/orchestrator.schema.json` (workflow config)
- Tests:
  - unit tests for workflow engine (from Task 03)
  - integration tests for trigger behavior (mocked)

---

## Implementation checklist (do in this order)

### A) Define a workflow configuration format

Extend orchestrator schema to support:

- `workflows.enabled`
- `workflows.definitions[]`:
  - `id`, `name`, `description`
  - `steps[]` with `workerId`, `prompt`, `carry`, `timeoutMs`
- `workflows.triggers`:
  - `visionOnImage`
  - `memoryOnTurnEnd`

### B) Implement trigger evaluation

Add a trigger engine that:

- runs inside `chat.message` / message events
- evaluates triggers cheaply
- enqueues workflow runs (async) so the user isn’t blocked

### C) Memory agent workflow (handshake contract)

Define:

1. Orchestrator emits a `memory.task` payload including:
   - sessionId, projectId
   - concise turn summary (bounded chars)
   - extracted “decisions”, “todos”, “entities” (if available)
2. Orchestrator calls the memory worker:
   - if using `backend: "agent"`: `session.prompt` with `agent: "memory"`
   - memory agent must call a tool (example):
     - `orchestrator_memory_put`
     - `orchestrator_memory_link`
3. Memory agent then calls `orchestrator_memory_done({ taskId })` to acknowledge completion.

This ack makes the system observable and debuggable.

### D) Vision workflow

Move the current vision auto-analysis into a workflow definition:

- worker: `vision`
- step prompt: “Describe the image, extract text, return a structured summary…”
- output: inject `[VISION ANALYSIS]` block into the orchestrator session and emit an event for the UI.

---

## Verification (must pass to complete Task 07)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

And because this changes orchestration behavior:

- `bun run test:e2e` (required for Task 07)
