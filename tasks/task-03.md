# Task 03 — Fix “Usable Providers” Semantics for Tag Resolution

## Goal

Make tag-based model selection (`node:*` / `auto:*`) consider the same “usable provider” semantics as model listing: include configured providers, env providers, and API-catalog providers that have credentials (`key`).

## Why this task exists

Today there’s a mismatch:

- `task_list({ view: "models" })` lists usable `api` providers with credentials
- `node:*` tag resolution ignores all `api` providers, even if connected

This breaks “dynamic model selection using user configured models”.

## Before (current state)

- Tag resolution excludes all API-catalog providers:
  - `packages/orchestrator/src/models/hydrate.ts:38` (`p.source !== "api"`)
- The correct filtering logic already exists:
  - `packages/orchestrator/src/models/catalog.ts:57` (filterProviders)
  - `packages/orchestrator/src/models/catalog.ts:85` (`api` + `key`)
- Models view uses that filtering logic:
  - `packages/orchestrator/src/command/tasks.ts:582` (filterProviders call)

## After (expected state)

- Tag resolution uses `filterProviders(providersAll, "configured")` (or equivalent) so `api` providers with `key` can be selected.
- Explicit model references still search across *all* providers (user intent).

## Implementation steps

1. Replace tag-resolution provider filtering in `hydrateProfileModelsFromOpencode`:
   - Edit `packages/orchestrator/src/models/hydrate.ts:35`–`packages/orchestrator/src/models/hydrate.ts:40`
   - Use `filterProviders(...)` from `packages/orchestrator/src/models/catalog.ts:57`
2. Add/extend unit tests verifying:
   - `api` provider without `key` is excluded from tag resolution
   - `api` provider with `key` is included
   - explicit `provider/model` continues to resolve against all providers
3. Ensure any changes remain compatible with the fallback model logic:
   - `packages/orchestrator/src/models/hydrate.ts:51` (fallbackCandidate)
   - `packages/orchestrator/src/models/hydrate.ts:56` (resolve fallback)

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
git commit -m "fix(orchestrator): include connected api providers for node:* tags"
git push origin main
```

## Completion record (fill in when done)

- Commit: `<sha>`
- After references (update with final line numbers):
  - `packages/orchestrator/src/models/hydrate.ts:<line>`
  - `packages/orchestrator/test/unit/models-hydrate.test.ts:<line>`
