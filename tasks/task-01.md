# Task 01 — Define standards + add a single “check” gate (lint/type/test/build) + audit tests

## Required context (attach)

Attach `refactory.md` with this task. This task is the first “trust foundation” for everything that follows:

- Repo standards: `refactory.md` → “Production standards (enforced)”
- CI mismatch today: `refactory.md` → “CI reality check (today)”
- Current wiring overview: `refactory.md` → “The key wiring today (what plugs into what)”

## Dependencies

- None (Task 01 is the starting gate).

## Standards (non‑negotiable for this repo)

These standards apply to *every* task in this folder. If a change violates these, the task is not “done” even if CI is green.

### 1) Stability-first engineering

- No behavior changes without tests.
- Prefer additive + compatibility layers over “big bang” rewrites.
- Every refactor must have a rollback path (usually: keep old code behind a flag until the next task proves parity).

### 2) One source of truth per concept

- **OpenCode config** lives in `opencode.json` / `~/.config/opencode/opencode.json`.
- **OpenCode agents** live in `.opencode/agent/*.md` (or JSON in `opencode.json`).
- **OpenCode skills** live in `.opencode/skill/<name>/SKILL.md` and are loaded via the built‑in `skill` tool.
- **Orchestrator plugin config** lives in `orchestrator.json` / `.opencode/orchestrator.json` (plugin-owned schema).
- “Skills” must not be used as a synonym for “agent profiles” in our naming.

### 3) Align to OpenCode’s documented contracts

We build on the standards in:

- Plugins: `https://opencode.ai/docs/plugins/`
- Agents: `https://opencode.ai/docs/agents/`
- Skills: `https://opencode.ai/docs/skills/`
- Permissions: `https://opencode.ai/docs/permissions/`
- SDK TUI APIs: `https://opencode.ai/docs/sdk/#tui`

Hard rules pulled from the docs (must remain true):

- **Skills frontmatter:** OpenCode recognizes only `name`, `description`, `license`, `compatibility`, `metadata`. Unknown fields are ignored.
- **Agents:** can be configured via markdown with frontmatter fields like `description`, `mode`, `model`, `temperature`, `tools`, `permission`.
- **SDK TUI:** supports `tui.appendPrompt`, `tui.openHelp`, `tui.openSessions`, `tui.openThemes`, `tui.openModels`, `tui.submitPrompt`, `tui.clearPrompt`, `tui.executeCommand`, `tui.showToast`.

### 4) Minimalism with explicit boundaries

- Every new “layer” must prove it reduces total complexity (LOC + concepts).
- Prefer *deleting* code over adding indirection.
- If we introduce a server/port/API, it must have a crisp contract, auth story, and tests.

### 5) Production checks are mandatory and uniform

Every task completes only when the following pass locally and in CI:

1. `lint`
2. `typecheck`
3. `test`
4. `build`

This task establishes a single command that runs all four.

---

## Before (what we have today)

- No repo-wide `lint` command (TypeScript compiles, but style/footguns aren’t gated).
- CI test job references non-existent tests (`test/orchestrator.test.ts`, `test/profile-lock.test.ts`, `test/registry-ownership.test.ts`) — the workflow is currently not a trustworthy signal.
- Multiple “products” exist in one repo (plugin + `app/` + `desktop/` + `orchestra/`), but there is no single “quality gate” command across them.
- Tests are a mix of:
  - pure unit-ish tests,
  - local HTTP integration tests,
  - LLM/E2E tests spawning OpenCode servers and workers,
  - perf/stress scripts.
  There is no documented test tiering or CI policy.

---

## After (definition of done for this task)

- The repo has a single top-level command: `bun run check`.
- `bun run check` runs:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
  - `bun run build`
- CI runs `bun run check` (and only references tests that actually exist).
- Test tiers are explicitly documented, and the current test suite is audited (below) so later tasks can safely reshape it.

---

## Current state (exact references)

These are the concrete anchors for what we are fixing in Task 01:

- Root plugin scripts are currently here: `package.json:23`
- CI references missing tests here: `.github/workflows/ci.yml:46`
- Real plugin tests present today:
  - `test/e2e.test.ts:1`
  - `test/e2e-multiagent.test.ts:1`
  - `test/vision-routing.test.ts:1`
  - `test/workflows.test.ts:1`
  - `test/integration/bridge-server.test.ts:1`
  - `test/memory-auto.test.ts:1` (optional: Docker/Neo4j)
  - `test/performance/*` and `test/stress/*` (non-gating)

---

## After snapshot (what it should look like)

### New/updated commands (root)

After Task 01, a *human and CI* can run exactly one thing:

- `bun run check`

And this must expand to:

| Script | Purpose |
|---|---|
| `lint` | static lint (fast, deterministic) |
| `typecheck` | TypeScript typecheck (plugin + app + desktop) |
| `test` | default test gate (plugin + app; desktop optional) |
| `build` | build artifacts (plugin + app + desktop) |
| `check` | `lint` → `typecheck` → `test` → `build` |

### New files

- `biome.json` (or equivalent lint config)
- `docs/standards.md`
- `docs/testing.md`

### Expected file tree delta (after Task 01)

```txt
.
├─ biome.json
├─ docs/
│  ├─ standards.md
│  └─ testing.md
└─ package.json                  # adds lint/typecheck/test/build/check scripts
```

---

## Scope (files you will touch)

- Root `package.json` (add `lint`/`check`/`typecheck` orchestration scripts)
- New linter config at repo root (recommended: `biome.json`)
- `.github/workflows/ci.yml` (fix test selection, run `bun run check`)
- New docs:
  - `docs/standards.md` (single source of repo standards)
  - `docs/testing.md` (tiers, what CI runs, how to run locally)

Notes:
- This task should not change runtime behavior of the orchestrator. It may require small mechanical fixes if linting finds obvious issues.

---

## Implementation checklist (do in this order)

### A) Add a linter that is fast + low-drama

Recommendation: use **Biome** (single binary, lint + format, minimal JS toolchain pain).

1. Add dev dependency at repo root: `@biomejs/biome`
2. Add `biome.json` at the repo root with:
   - conservative rules initially (avoid “rewrite the world”)
   - ignore: `node_modules/`, `dist/`, `.tmp/`, `coverage/`
3. Add scripts to root `package.json`:

   - `lint`: `biome lint .`
   - `format`: `biome format . --write`
   - `format:check`: `biome format .`

Important: do **not** require formatting for “lint” yet unless you’re willing to reformat the world in Task 01.

### B) Define the single “quality gate” command

Add scripts to root `package.json`:

- `typecheck`: runs TypeScript checks for:
  - plugin package (current root) via `tsc --noEmit`
  - `app/` via `cd app && bun run typecheck`
  - `desktop/` via `cd desktop && bun run typecheck`
- `test`: runs:
  - plugin tests via `bun test`
  - `app/` tests via `cd app && bun run test`
  - (desktop has no tests today; keep it typechecked + buildable)
- `build`: runs:
  - plugin build via `bun run build`
  - `app/` build via `cd app && bun run build`
  - `desktop/` build via `cd desktop && bun run build`
- `check`: runs all four in order.

This is intentionally “brute force” today. Task 02 will make this elegant via a real workspace. Right now we just need a truthful gate.

### C) Fix CI to reflect reality

Update `.github/workflows/ci.yml`:

- Replace the bespoke unit-test list with `bun run test` (or with paths that actually exist).
- Add a `Lint` step: `bun run lint`
- Optionally collapse build+test into a single job calling `bun run check`
  - keep separate jobs only if you need parallelism / artifact caching later.

### D) Write standards + testing docs

Create:

- `docs/standards.md`: the standards at the top of this task, plus repo naming rules.
- `docs/testing.md`: how to run tests locally, how CI runs them, and the “tiering” contract.

Link both from `README.md` in a “Development” section.

---

## Deep review of current tests (audit)

This is the current test inventory (as of this task) and what each test implies about stability risk.

### Plugin tests (`test/` at repo root)

**Local HTTP integration (no model required)**

- `test/integration/bridge-server.test.ts`
  - Verifies `src/core/bridge-server.ts`:
    - POST `/v1/stream/chunk` accepts payloads with auth
    - GET `/v1/stream` is `text/event-stream`
  - Risk: low (deterministic).

**LLM / OpenCode server E2E**

- `test/e2e.test.ts`
  - Spawns a real OpenCode server via `createOpencode`
  - Prompts “Reply with exactly: pong”
  - Exercises:
    - `src/config/opencode.ts` merge logic
    - `src/workers/prompt.ts` response extraction
  - Risk: medium (depends on model availability + server startup).

- `test/e2e-multiagent.test.ts`
  - Spawns multiple worker OpenCode server processes via `src/workers/spawner.ts`
  - Exercises:
    - `src/core/worker-pool.ts` registry + ownership
    - `src/core/runtime.ts` shutdown
    - async job path via `src/core/jobs.ts` and `src/command/workers.ts`
    - attachments (file + image) path through worker prompt pipeline
  - Risk: high (slow + model dependent + process orchestration).
  - Note: there is already a “lenient” expectation in async job output (good sign that tests track reality).

- `test/vision-routing.test.ts`
  - Spawns OpenCode server and a vision worker, sends:
    - a real image file
    - a base64 image part
  - Exercises:
    - `src/ux/vision-router.ts`
    - `src/workers/spawner.ts` attachment normalization
  - Risk: high (vision model/tooling variance).

- `test/workflows.test.ts`
  - Registers a workflow and runs it through real spawned workers
  - Exercises:
    - `src/workflows/engine.ts` runtime behavior
    - worker spawning + sendToWorker
  - Risk: medium-high (LLM dependent) even though the engine itself can be unit tested without workers.

**Optional / environment-dependent**

- `test/memory-auto.test.ts`
  - Spins up Neo4j in Docker if not configured
  - Exercises:
    - `src/memory/*` (auto record, injection, trimming, search)
  - Risk: high + slow; should remain opt-in (not on default CI path).

**Benchmarks / stress (not CI)**

- `test/performance/*.bench.ts`
- `test/stress/*.stress.ts`
  - Useful for regression detection but must not gate PRs by default.

### App tests (`app/`)

- `app/src/context/__tests__/skills-context.test.tsx`
  - Validates CRUD of “skills” via HTTP client layer.
  - This is a canary that the “skills API” contract is currently a major coupling point.

---

## Verification (must pass to complete Task 01)

Run from repo root:

1. Install deps (for now, separately):
   - `bun install`
   - `cd app && bun install`
   - `cd desktop && bun install`
2. Run the full gate:
   - `bun run check`

CI must be updated so that the GitHub Actions run also passes.
