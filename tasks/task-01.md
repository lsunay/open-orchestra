# Task 01 — Baseline: Document + Lock Model Selection Behavior

## Goal

Capture the current model-selection pipeline and lock in baseline expectations with tests so refactors in later tasks don’t accidentally change behavior.

## Why this task exists

Model selection is currently distributed and partially implicit (server spawn config vs agent prompt routing). Before improving it, we need an explicit baseline and a test harness that:

- Doesn’t require mocks (uses injected fakes)
- Can validate resolver behaviors deterministically
- Makes future “before/after” diffs auditable

## Before (current state)

### Current “tag” behavior vs docs

- Built-in `vision` profile uses a **concrete model ID**, not a tag:
  - `packages/orchestrator/src/config/profiles.ts:14` (vision profile)
  - `packages/orchestrator/src/config/profiles.ts:18` (model = `"zhipuai-coding-plan/glm-4.6v"`)
- Orchestrator docs claim built-ins use tags, including `node:vision`:
  - `docs/configuration.md:365` (table header)
  - `docs/configuration.md:367` (vision row says `node:vision`)

### Provider filtering and resolution behavior

- Tag resolution excludes **all** `source === "api"` providers (even if connected via `/connect`):
  - `packages/orchestrator/src/models/hydrate.ts:36` (comment)
  - `packages/orchestrator/src/models/hydrate.ts:38` (filter `p.source !== "api"`)
- `task_list({ view: "models" })` uses `filterProviders(..., "configured")`, which *does* include `api` providers with `key`:
  - `packages/orchestrator/src/models/catalog.ts:57` (filterProviders)
  - `packages/orchestrator/src/models/catalog.ts:85` (include `api` if `p.key`)
  - `packages/orchestrator/src/command/tasks.ts:574` (models view)
  - `packages/orchestrator/src/command/tasks.ts:582` (filterProviders usage)

### Prompt-level model override exists in OpenCode API, but is unused

- OpenCode supports per-message model override:
  - `packages/orchestrator/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2233` (SessionPromptData)
  - `packages/orchestrator/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2236` (`body.model`)
- Orchestrator does not set this today:
  - `packages/orchestrator/src/workers/send.ts:86` (session.prompt body)
  - `packages/orchestrator/src/workers/send.ts:89` (only `agent` and `parts`)

## After (expected state)

- A “baseline” document exists describing current model resolution behavior and known gaps, pointing at the exact code entry points.
- Unit tests exist covering:
  - `resolveModelRef(...)` fuzzy and exact matching
  - `filterProviders(...)` semantics
  - `hydrateProfileModelsFromOpencode(...)` tag vs explicit model behavior with injected fake `client`

## Implementation steps

1. Add a short baseline doc under repo docs (choose one):
   - Option A (preferred): `docs/model-selection.md`
   - Option B: extend `docs/architecture.md`
2. Add unit tests in `packages/orchestrator/test/unit/`:
   - `packages/orchestrator/test/unit/models-resolve.test.ts` (new)
   - `packages/orchestrator/test/unit/models-hydrate.test.ts` (new)
3. Use dependency injection / fake clients (no mocking framework).

## Notes / constraints

- Do not change runtime behavior in this task beyond testability hooks (if needed).
- If adding test-only helper functions, keep them in `packages/orchestrator/test/helpers/` (or equivalent existing pattern).

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
git add docs/ packages/orchestrator/test/unit/
git commit -m "test(orchestrator): add baseline model-selection coverage"
git push origin main
```

## Completion record (fill in when done)

- Commit: `<sha>`
- After references (update with final line numbers):
  - `docs/model-selection.md:<line>`
  - `packages/orchestrator/test/unit/models-resolve.test.ts:<line>`
  - `packages/orchestrator/test/unit/models-hydrate.test.ts:<line>`
