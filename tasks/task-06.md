# Task 06 — Orchestrator modularity: remove dead code, eliminate hidden globals, and split “god modules”

## Required context (attach)

Attach `refactory.md` with this task. This task is the “reduce cognitive load without changing behavior” cut:

- `refactory.md` → “Risk register” #1 (spawn stability) + #2 (hidden global state)
- `refactory.md` → “The key wiring today” (which modules are in the critical path)

## Dependencies

- Task 03 (recommended): refactors are safest with a deterministic test gate.
- Task 05 (recommended): if we introduce worker backends, do this modularization after the abstraction exists so we don’t split twice.

## Standards (non‑negotiable for this task)

- Refactor without behavior change (unless explicitly covered by tests).
- Reduce coupling:
  - fewer singletons
  - fewer “setX() then read from anywhere” patterns
- Each module should have one job and a stable interface.

---

## Before (what we have today)

- Large, multi-responsibility modules:
  - `src/workers/spawner.ts` mixes spawn lifecycle, prompt composition, attachments, response parsing, polling.
  - `src/index.ts` coordinates config injection, commands, vision routing, memory, pruning, notifications.
  - `src/core/worker-pool.ts` is dense and central to everything.
- Hidden mutable global state via `src/command/state.ts` setters.
- Unused code increases cognitive load:
  - `src/command/main.ts` appears unused
  - `src/core/net-utils.ts`, `src/core/system-optimizer.ts`, `src/core/file-monitor.ts` appear unused

---

## Current state (exact references)

Hidden mutable globals (refactor target):

- Global setters/state live here: `src/command/state.ts:11`
- Plugin writes to that state on init: `src/index.ts:48`

God modules (split target):

- `src/workers/spawner.ts` exported entrypoints:
  - spawn: `src/workers/spawner.ts:318`
  - stop: `src/workers/spawner.ts:657`
  - send: `src/workers/spawner.ts:690`
  - bulk spawn: `src/workers/spawner.ts:922`
- Worker pool central orchestration + dedupe: `src/core/worker-pool.ts:187` and `src/core/worker-pool.ts:215`

Dead code candidates (verify via ripgrep before deleting):

- `src/command/main.ts`
- `src/core/net-utils.ts`
- `src/core/system-optimizer.ts`
- `src/core/file-monitor.ts`

---

## After (definition of done for this task)

- Dead code is removed (or quarantined under `experimental/` with clear “not used” labeling).
- `OrchestratorContext` is an explicit object passed to tool factories and worker functions; `setClient()` style globals are either removed or reduced to thin compatibility adapters.
- `spawner.ts` is split into small modules with clear boundaries:
  - `spawn/`
    - `spawn-opencode.ts`
    - `readiness.ts`
  - `prompt/`
    - `worker-prompt.ts`
    - `attachments.ts`
    - `extract.ts`
  - `send.ts`
- Tests are updated to ensure behavior parity.

---

## Expected file tree delta (after Task 06)

This task should turn the current “god modules + hidden globals” into explicit modules with clear boundaries:

```txt
packages/orchestrator/
  src/
    context/
      orchestrator-context.ts    # explicit runtime context (replaces hidden globals)
    command/
      state.ts                   # reduced to adapters (eventually removed)
    workers/
      spawn/
        spawn-opencode.ts        # process spawn + env + readiness
        readiness.ts
      prompt/
        attachments.ts           # attachment normalization
        worker-prompt.ts         # prompt composition
        extract.ts               # response extraction/polling
      send.ts
      spawner.ts                 # thin facade over the split modules
    experimental/                # only if we quarantine dead code (otherwise delete)
```

## Scope (files you will touch)

- `packages/orchestrator/src/command/state.ts` (introduce `OrchestratorContext`)
- `packages/orchestrator/src/command/*.ts` (update to accept context)
- `packages/orchestrator/src/workers/**` (split modules)
- Remove or quarantine:
  - `packages/orchestrator/src/command/main.ts`
  - `packages/orchestrator/src/core/net-utils.ts`
  - `packages/orchestrator/src/core/system-optimizer.ts`
  - `packages/orchestrator/src/core/file-monitor.ts`

---

## Implementation checklist (do in this order)

### A) Prove dead code is dead

1. Use `rg` to confirm no imports reference the modules above.
2. If truly unused:
   - delete them, or
   - move them to `packages/orchestrator/src/experimental/` and ensure nothing imports them.

### B) Introduce `OrchestratorContext`

1. Create `packages/orchestrator/src/context/orchestrator-context.ts` exporting:
   - the OpenCode client
   - directory/worktree/projectId
   - orchestrator config snapshot
   - runtime handles (workerPool, bridge server, etc.)
2. Change tool creation to accept `OrchestratorContext` rather than reading module-level state.
3. Keep existing `setClient()` exports temporarily as wrappers that mutate a *single* context instance (compat layer), but move callers to explicit injection.

### C) Split spawner with mechanical refactors

Move code without changing logic:

- Extract attachment normalization
- Extract prompt creation
- Extract response parsing
- Extract spawn lifecycle

Ensure public functions remain compatible:

- `spawnWorker`
- `sendToWorker`
- `spawnWorkers`
- `stopWorker`

### D) Add “module boundary” docs

Add `docs/architecture.md` updates (or a new `docs/modules.md`) explaining:

- what each submodule does
- what it must not do
- which module owns which abstraction

---

## Verification (must pass to complete Task 06)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

Additionally, because this is a refactor:

- `bun run test:e2e` (recommended to ensure spawned-worker behavior is unchanged)
