# Task 05 — Centralize Model Resolution Into a Single Contract

## Goal

Create a single model resolution “contract” (function + types) that is used by:

- spawn-time selection (server backend)
- prompt-time selection (server + agent backend)
- Task API overrides (later tasks)

This contract must produce a stable “reason” string for debuggability.

## Why this task exists

Today, model selection is spread across:

- `resolveModelRef(...)` (string-to-model resolution)
  - `packages/orchestrator/src/models/catalog.ts:91`
- tag hydration (`hydrateProfileModelsFromOpencode`)
  - `packages/orchestrator/src/models/hydrate.ts:21`
- backend-specific behavior (`server.ts` vs `agent.ts`)

Centralization reduces drift and enables consistent “dynamic model switching”.

## Before (current state)

- Tag resolution returns `{ model, reason }` only inside `hydrate.ts`:
  - `packages/orchestrator/src/models/hydrate.ts:61` (resolveAuto returns reason)
- Worker send does not accept a model override:
  - `packages/orchestrator/src/workers/send.ts:52` (sendWorkerPrompt input)
  - `packages/orchestrator/src/workers/send.ts:89` (prompt body)
- Worker instances only record a loose `modelResolution` string:
  - `packages/orchestrator/src/types/index.ts:89` (modelResolution)
  - `packages/orchestrator/src/workers/backends/server.ts:72` (modelResolution derivation)

## After (expected state)

- A new resolver module exists (example path):
  - `packages/orchestrator/src/models/resolve.ts`
- It exports a function like:
  - `resolveWorkerModel({ profile, overrideModelRef, opencodeConfig, providers, policy })`
- It returns:
  - `resolvedModel` (canonical `provider/model`)
  - `modelRef` (original ref/tag)
  - `reason` (human readable)
  - `capabilities` (optional, if needed for validation)

## Implementation steps

1. Add types in a models module (do not leak into unrelated areas):
   - New `WorkerModelResolution` type
2. Extract/compose existing logic:
   - Use `resolveModelRef` for explicit model refs
   - Use tag logic for `node:*` with the improved provider filtering + `small_model` handling
3. Update `hydrateProfileModelsFromOpencode` to use the new resolver, but keep its public signature stable for now.
4. Add tests for the resolver contract (pure function where possible; fake client otherwise).

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
git add packages/orchestrator/src/models/ packages/orchestrator/test/unit/
git commit -m "refactor(orchestrator): centralize worker model resolution"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/models/resolve.ts:41`
  - `packages/orchestrator/src/models/hydrate.ts:42`
  - `packages/orchestrator/test/unit/models-resolve-worker.test.ts:1`
