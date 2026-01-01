# Task 08 — Task API Ops: Worker Model Set/Reset (Session-Scoped)

## Goal

Allow “set worker model” and “reset worker model” operations via `task_start(kind="op")` without registering any new tools.

## Why this task exists

Per-task overrides are useful, but users also want to:

- Set a worker model once and have subsequent tasks reuse it (“sticky”)
- Reset back to the configured default

This must work within the existing Task API surface.

## Before (current state)

- Task ops only support memory operations:
  - `packages/orchestrator/src/command/tasks.ts:34` (TaskOpKind)
  - `packages/orchestrator/src/command/tasks.ts:395`–`packages/orchestrator/src/command/tasks.ts:406` (op execution)

## After (expected state)

- New ops exist (names final TBD, examples):
  - `worker.model.set`
  - `worker.model.reset`
- Each op:
  - validates workerId exists
  - resolves model tags or explicit models via resolver
  - updates worker runtime state so subsequent `task_start(kind="worker")` uses the updated model
  - optionally respawns server worker if policy requires a new default model at process level

## Implementation steps

1. Extend `TaskOpKind` enum:
   - Edit `packages/orchestrator/src/command/tasks.ts:34`
2. Add a payload type for worker model ops (separate from memory payload):
   - Add a new `worker` object to `task_start` args schema (parallel to `memory`)
3. Implement op handlers:
   - Use workerPool to find running workers and adjust their effective model config
   - Emit an orchestrator event for observability (optional but recommended)
4. Add tests:
   - set → subsequent send uses new model
   - reset → subsequent send uses default model

## Verification (must pass before proceeding)

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

Do not proceed until all commands pass and any task-introduced warnings/errors are eliminated.

## Git (must do before proceeding)

```bash
git add packages/orchestrator/src/command/tasks.ts packages/orchestrator/src/core/ packages/orchestrator/test/unit/
git commit -m "feat(orchestrator): add worker model set/reset ops via task_start"
git push origin main
```

## Completion record (fill in when done)

- Commit: `<sha>`
- After references (update with final line numbers):
  - `packages/orchestrator/src/command/tasks.ts:<line>`
  - `packages/orchestrator/src/core/worker-pool.ts:<line>`
