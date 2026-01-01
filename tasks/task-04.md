# Task 04 — Implement `small_model` Support for `node:fast`

## Goal

Make `node:fast` (and `auto:fast`) resolve to OpenCode’s `small_model` when configured, before falling back to catalog scoring (`pickFastModel`).

## Why this task exists

OpenCode already has a first-class concept of a cheaper/faster model via `small_model`. Using it is the most predictable way to satisfy:

- “dynamic changing of models using users configured models”
- fast/cheap worker behavior without bespoke heuristics

## Before (current state)

- OpenCode config supports `small_model` (per upstream docs; also in OpenCode config schema fetched at `https://opencode.ai/config.json`).
- Orchestrator hydration reads `cfg?.model` as fallback, but never reads `cfg?.small_model`:
  - `packages/orchestrator/src/models/hydrate.ts:51` (fallbackCandidate uses `cfg?.model`)
  - `packages/orchestrator/src/models/hydrate.ts:65` (detect `node:fast`)
  - `packages/orchestrator/src/models/hydrate.ts:71` (fast chooses `pickFastModel(catalog)`)
- The “fast” scoring helper exists:
  - `packages/orchestrator/src/models/catalog.ts:278` (pickFastModel)

## After (expected state)

- For `node:fast`:
  1. If `cfg.small_model` is set and resolvable, use it.
  2. Else use `pickFastModel(catalog)`.
  3. Else fall back to default model (existing fallback logic).
- Tests cover:
  - valid `small_model`
  - invalid `small_model` (falls back safely)

## Implementation steps

1. Update tag resolution logic in `packages/orchestrator/src/models/hydrate.ts`:
   - Enhance `resolveAuto(...)` at `packages/orchestrator/src/models/hydrate.ts:61`
   - Add a `small_model` preference branch for `isFast`
2. Use `resolveModelRef(cfg.small_model, providersAll)` to validate the configured value.
3. Make the returned `reason` explicit (so `task_list({ view: "workers" })` can show it later).
4. Add/extend unit tests for fast resolution.

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
git add packages/orchestrator/src/models/hydrate.ts packages/orchestrator/test/unit/
git commit -m "feat(orchestrator): prefer OpenCode small_model for node:fast"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/models/hydrate.ts:68`
  - `packages/orchestrator/test/unit/models-hydrate.test.ts:40`
