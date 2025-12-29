# Task 03 — Testing + CI hardening: tier tests, make “fast” deterministic, and run the right checks

## Required context (attach)

Attach `refactory.md` with this task. This task directly addresses:

- CI mismatch: `.github/workflows/ci.yml:46` (references missing tests)
- The “Risk register” items #1 (worker spawning stability) and #3 (UI event mismatch) by ensuring tests protect the right seams
- The “Ports, endpoints, and implicit contracts” table (so we don’t accidentally create flaky network tests)

## Dependencies

- Task 01 (required): we need a stable `lint/typecheck/test/build` gate.
- Task 02 (recommended): tiering is easier once tests live under `packages/orchestrator/test/`, but you can do tiering pre-move.

## Standards (non‑negotiable for this task)

- Tests must increase confidence, not flakiness.
- CI must be a trustworthy signal (green = safe, red = actionable).
- Heavy tests (LLM/vision/Docker) must be explicitly opt-in unless they are proven stable and fast.

---

## Before (what we have today)

- Test suite mixes:
  - deterministic tests (`bridge-server`)
  - model-dependent E2E tests (spawn OpenCode servers/workers)
  - optional Docker/Neo4j tests
  - stress/perf scripts
- There is no formal “test tier” policy and no split between “PR gate” vs “nightly”.
- Some “unit-like” logic is only tested via expensive worker spawning (ex: `test/workflows.test.ts`).

---

## After (definition of done for this task)

- Tests are organized into tiers with explicit scripts:

  - `bun run test:unit` (fast, deterministic, no OpenCode server, no model)
  - `bun run test:integration` (local servers allowed, still deterministic; no LLM)
  - `bun run test:e2e` (OpenCode server + model required)
  - `bun run test:optional` (Docker/Neo4j)
  - `bun run test:stress` and `bun run bench` (non-gating)

- `bun run test` (default) runs **unit + integration** and is the PR gate.
- CI runs:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test` (unit + integration)
  - `bun run build`
- CI additionally runs `bun run test:e2e` on:
  - a scheduled workflow (nightly), or
  - a manual dispatch, or
  - only on changes under `packages/orchestrator/src/workers/**` and similar high-risk paths (optional optimization).

---

## Expected file tree delta (after Task 03)

The test suite becomes navigable and “fast by default”:

```txt
packages/orchestrator/test/
  unit/
    workflows-engine.test.ts      # pure unit tests (no OpenCode server)
    ...
  integration/
    bridge-server.test.ts         # local HTTP only
  e2e/
    e2e.test.ts                   # model/OpenCode required
    e2e-multiagent.test.ts
    vision-routing.test.ts
  optional/
    memory-auto.test.ts           # Docker/Neo4j
  perf/
  stress/
```

## Current state (exact references)

- CI test job references missing files at `.github/workflows/ci.yml:46`.
- Current plugin tests (repo root):
  - deterministic integration: `test/integration/bridge-server.test.ts:1`
  - model/OpenCode E2E: `test/e2e.test.ts:1`, `test/e2e-multiagent.test.ts:1`, `test/vision-routing.test.ts:1`, `test/workflows.test.ts:1`
  - optional Docker: `test/memory-auto.test.ts:1`
  - non-gating: `test/performance/*`, `test/stress/*`
- Current workflow engine is pure and can be unit tested without workers: `src/workflows/engine.ts:1`.

---

## Scope (files you will touch)

- Workspace root `package.json` scripts (test tier scripts)
- `packages/orchestrator/test/` (move/rename tests into tiered folders)
- `.github/workflows/ci.yml` (add tiering + optional nightly workflow)
- New docs: `docs/testing.md` (or extend if created in Task 01)

---

## Deep test review: what should become unit vs e2e

### Candidate unit tests (no LLM)

Convert these to pure unit tests by mocking worker dependencies:

- `packages/orchestrator/src/workflows/engine.ts`
  - unit test `runWorkflow()` with fake `resolveWorker` and fake `sendToWorker`
  - verify carry behavior, limits, step stopping on error

- `packages/orchestrator/src/workers/prompt.ts`
  - unit test `extractTextFromPromptResponse()` across response shapes

- `packages/orchestrator/src/config/orchestrator.ts`
  - unit test `parseOrchestratorConfigFile()` with invalid inputs
  - unit test profile merge behavior (built-in + override)

### Candidate integration tests (local HTTP only)

- `packages/orchestrator/test/integration/bridge-server.test.ts`

### Candidate E2E tests (LLM/model required)

Keep these as E2E and make them deterministic and bounded:

- `packages/orchestrator/test/e2e/e2e.test.ts`
- `packages/orchestrator/test/e2e/e2e-multiagent.test.ts`
- `packages/orchestrator/test/e2e/vision-routing.test.ts`

### Optional tests (Docker/Neo4j)

- `packages/orchestrator/test/optional/memory-auto.test.ts`
  - keep skipped by default; only run when Docker is present.

---

## Implementation checklist (do in this order)

### A) Restructure the tests by tier

Move (example mapping; adjust to the post-Task-02 layout):

- `packages/orchestrator/test/integration/bridge-server.test.ts` stays integration.
- Move model-dependent tests to `packages/orchestrator/test/e2e/`.
- Move Neo4j test to `packages/orchestrator/test/optional/`.
- Move perf/stress to `packages/orchestrator/test/perf/` and `packages/orchestrator/test/stress/` (or keep current directories but exclude from default `bun run test`).

### B) Add test scripts

In workspace root `package.json` add:

- `test:unit`
- `test:integration`
- `test:e2e`
- `test:optional`
- `test` = `test:unit && test:integration`

And in `packages/orchestrator/package.json`, you can keep:

- `test` as `bun test` for the package, but the root decides which folders to include.

### C) Convert workflow test to a true unit test

Replace `packages/orchestrator/test/workflows.test.ts` (currently uses real spawned workers) with:

- `packages/orchestrator/test/unit/workflows-engine.test.ts`
  - fake `sendToWorker` returns deterministic results
  - verify carry + ordering + timeout propagation

This is a major “stability win”: it makes workflows testable without a model.

### D) CI changes

1. Update PR CI (`.github/workflows/ci.yml`) to run:
   - `bun run check` (which runs `lint/typecheck/test/build`)
2. Add a separate workflow file (recommended): `.github/workflows/nightly-e2e.yml`:
   - scheduled daily
   - runs `bun run test:e2e`

### E) Document the tiering contract

Update `docs/testing.md` with:

- which scripts exist
- what CI runs
- how to run E2E locally (including env like `OPENCODE_ORCH_E2E_MODEL`)

---

## Verification (must pass to complete Task 03)

From repo root:

1. `bun install`
2. `bun run check`

Additionally (recommended for Task 03 completion):

- `bun run test:e2e` (at least once locally to validate the tier split didn’t silently drop coverage)
