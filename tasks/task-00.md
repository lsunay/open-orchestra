# Task 00 — Preflight & Execution Discipline

## Goal

Establish a repeatable “one task = one verified commit” workflow so every subsequent task can be validated independently.

This repository’s process requirement (per owner request):

1. Build
2. Remove errors and warnings
3. Run lint
4. Run typechecks
5. Run all E2E tests
6. Commit
7. Push to `main`

## Why this task exists

Worker model selection changes are cross-cutting (config → resolver → spawn → prompt → UI surfaces). Without a strict preflight and verification loop, it’s easy to regress:

- Model resolution correctness
- Worker reuse semantics
- Agent vs server backend behavior
- Tool surface constraints (Task API only)

## Before (current state)

- There is no `tasks/` directory to drive “step-by-step verification”.
- Model selection is split across spawn-time resolution and per-backend behavior:
  - Spawn-time tag resolution: `packages/orchestrator/src/models/hydrate.ts:21` (function) and `packages/orchestrator/src/models/hydrate.ts:38` (provider filtering)
  - Server worker uses spawn-time model: `packages/orchestrator/src/workers/backends/server.ts:101` and `packages/orchestrator/src/workers/backends/server.ts:105`
  - Prompt sending does not set per-message model: `packages/orchestrator/src/workers/send.ts:52` and `packages/orchestrator/src/workers/send.ts:86`
  - Agent backend does not apply `profile.model`: `packages/orchestrator/src/workers/backends/agent.ts:11` and `packages/orchestrator/src/workers/backends/agent.ts:149`

## After (expected state)

- `tasks/` exists with `task-00.md` through `task-10.md`.
- Each task file contains:
  - A “Before” section referencing specific files + lines
  - A concrete “After” target and a place to record the final references after completion
  - A mandatory verification block (build/lint/typecheck/e2e)
  - A mandatory git block (commit + push to `main`)

## Implementation steps

1. Create `tasks/` and add task files `task-00.md` … `task-10.md`.
2. Ensure the “verification commands” are consistent with repo scripts:
   - Root `package.json` scripts: `package.json:6` (scripts section)
   - Orchestrator package scripts: `packages/orchestrator/package.json:1` (scripts section)
3. Ensure each task’s “Git” section explicitly targets `main`.

## Verification (must pass before proceeding)

Run these from repo root:

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

If any command prints warnings/errors that represent real failures (typecheck/lint/test/build), stop and fix before moving on.

## Git (must do before proceeding)

1. Confirm branch is `main`:

```bash
git branch --show-current
```

2. Commit only the changes for this task:

```bash
git status
git add tasks/ scope.md rules.md
git commit -m "chore(orchestrator): add stepwise model-selection tasks"
```

3. Push to `main`:

```bash
git push origin main
```

## Completion record (fill in when done)

- Commit: `<sha>`
- Verified commands:
  - `bun run lint`: ✅/❌
  - `bun run typecheck`: ✅/❌
  - `bun run test:e2e`: ✅/❌
  - `bun run build`: ✅/❌

