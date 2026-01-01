# Worker Model Selection (Orchestrator) — Scope

## Why this exists

Worker model selection is currently split across configuration loading, spawn-time hydration, and per-backend behavior. This makes it hard to:

- Use a user’s configured models reliably (including `/connect` providers and `small_model`)
- Change worker models dynamically without stopping/restarting workers
- Expose model selection in a UI-friendly way (ideally from the OpenCode TUI)
- Understand *why* a given model was chosen (and reproduce it)

This document scopes a focused improvement to model selection across the configuration → orchestrator → worker pipeline **without expanding the registered tool surface beyond the existing Task API**.

For step-by-step implementation with verification gates, see `tasks/task-00.md` … `tasks/task-10.md`.

---

## Non-negotiable constraints

- Keep the registered tool surface unchanged: only `task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`.
- No mocks in tests; use dependency injection and fakes.
- Never delete tests.
- Model selection must work from user-configured sources: OpenCode config (`model`, `small_model`), env-detected providers, and `/connect` API catalog providers with keys.
- Vision workers must not silently downgrade to non-vision models.
- Any new user-facing behavior must be observable: `task_list` should show enough detail to debug model selection, and resolution must include a reason string.
- Changes should be minimal and follow existing patterns in `packages/orchestrator`.
- Execution discipline per task: run `bun run lint`, `bun run typecheck`, `bun run test:e2e`, `bun run build`, then commit + push before starting the next task.

---

## Current pipeline (as implemented)

### 1) Configuration sources

- OpenCode loads merged config from:
  - Global: `~/.config/opencode/opencode.json`
  - Project: `./opencode.json` or `.opencode/opencode.json` (per OpenCode rules)
- Orchestrator loads merged config from:
  - Global: `~/.config/opencode/orchestrator.json`
  - Project: `./.opencode/orchestrator.json` (or `./orchestrator.json`)
  - Code: defaults in `packages/orchestrator/src/config/orchestrator.ts`

Profiles are assembled as `builtInProfiles` plus overrides:
- `packages/orchestrator/src/config/profiles.ts`
- merged by `collectProfilesAndSpawn` in `packages/orchestrator/src/config/orchestrator.ts`

### 2) Plugin config injection into OpenCode

At startup, the plugin mutates the OpenCode config:
- Adds/overrides the orchestrator agent (name defaults to `orchestrator`)
- Injects command shortcuts (`orchestrator.models`, `orchestrator.profiles`, …)

Code: `packages/orchestrator/src/index.ts` (`config: async (opencodeConfig: Config) => { ... }`)

### 3) Worker spawn + send loop

Workers have two execution backends:

- **Server backend**: spawns a separate `opencode serve` process
  - Code: `packages/orchestrator/src/workers/backends/server.ts`
  - The worker process config is created via:
    - `mergeOpenCodeConfig(...)` + overrides
    - passed as `OPENCODE_CONFIG_CONTENT` to the worker process
  - Code: `packages/orchestrator/src/workers/spawn/spawn-opencode.ts`

- **Agent backend**: creates a new OpenCode session (or forks a child session)
  - Code: `packages/orchestrator/src/workers/backends/agent.ts`

The orchestrator sends work via `client.session.prompt(...)`:
- Code: `packages/orchestrator/src/workers/send.ts`
- Today this passes `agent` optionally, but **does not pass `model`**, even though the OpenCode API supports per-message model selection.

### 4) Where model selection happens today

#### A) Spawn-time model hydration for server workers

If a profile model is a tag (starts with `node` or `auto`) the orchestrator resolves it at spawn time:

- Code: `packages/orchestrator/src/models/hydrate.ts`
- Data sources:
  - `client.config.get` (OpenCode config, including `model`)
  - `client.provider.list` + `client.config.providers` (provider + model catalog)
  - Code: `packages/orchestrator/src/models/catalog.ts`

The resolved model is then passed to `opencode serve` as the worker process’ default model:
- Code: `packages/orchestrator/src/workers/backends/server.ts` → `spawnOpencodeServe({ config: { model: resolvedProfile.model, ... }})`

#### B) Agent backend currently ignores `profile.model`

Agent/subagent workers do not set a model at spawn time, and prompts do not include a model override.
- Result: agent backend workers effectively inherit the calling session’s active model/agent behavior.

#### C) Worker reuse ignores model identity

Server workers can be reused from a device registry by `workerId` alone:
- Code: `packages/orchestrator/src/core/worker-pool.ts` (`tryReuseFromDeviceRegistry`)
- Result: model changes in profile/config may not take effect if an older worker is reused.

---

## Gaps / pain points

1. **No per-message model override** even though OpenCode supports it (`session.prompt.body.model`).
2. **Agent backend workers can’t reliably run on profile-specified models**.
3. **Worker reuse does not consider model/config drift**, making “dynamic model change” difficult.
4. **Auto-selection excludes some usable providers** (notably “api” catalog providers with credentials), depending on filtering strategy in hydration.
5. **`small_model` is not used**, even though it exists specifically for “fast/cheap” workloads in OpenCode.
6. **Vision defaults are inconsistent**: docs claim tag-based resolution (`node:vision`), while the built-in profile currently uses a concrete model string in code.
7. **Selection is hard to drive from the TUI**: models can be listed (`orchestrator.models`), but not assigned to workers via a first-class flow.
8. **Model resolution reasoning is not standardized** (only a loose `modelResolution` string exists on `WorkerInstance`).

---

## Goals (what “better” means)

### Must-haves

- Keep the registered tool surface as-is: `task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`
- Use user-configured models as the source of truth:
  - Configured providers + env-detected providers + `/connect` credentials
  - Respect `model` and `small_model` from OpenCode config
- Allow **dynamic model changes**:
  - Per task (one-off override)
  - Per worker (runtime update for subsequent tasks)
  - Optional persistence (project/global) only if safe and explicit
- Make model selection **discoverable and selectable from the OpenCode TUI** (at minimum via commands + Task API; ideally via a picker-like UX)
- Improve debuggability:
  - Always record how a model was resolved (tag → chosen model, source provider, fallbacks)

### Nice-to-haves

- Stable “policy-driven” selection (eg. prefer configured providers, prefer cheaper for `fast`, hard-require vision capability for `vision`)
- Better worker reuse semantics (reuse only when compatible)
- Control panel UI parity (select/override models in `apps/control-panel` as well)

---

## Proposed design (high level)

### 1) Define a single model-selection contract

Introduce a unified “model resolution” contract used everywhere (spawn + send), returning:

- `resolvedModel`: canonical `provider/model` string
- `modelRef`: original user input (tag or full ID)
- `policy`: “sticky” vs “dynamic”
- `reason`: human-readable resolution explanation
- `metadata`: capabilities used for selection (vision/toolcall/context/cost)

This should be a pure function where possible, with provider/config fetching injected at the edges.

### 2) Expand tag semantics to leverage OpenCode config

Keep existing tags (`node`, `node:fast`, `node:docs`, `node:vision`) but improve their meaning:

- `node` / `auto`: resolves to OpenCode `model`
- `node:fast` / `auto:fast`: resolves to OpenCode `small_model` if set, else a scored “fast” pick from catalog
- `node:vision` / `auto:vision`: hard-requires image/attachment capability; never silently downgrades
- `node:docs` / `auto:docs`: scored pick optimized for toolcall + context; treat “web” as worker capability, not model capability

### 3) Apply the model at the right layer (spawn vs prompt)

Use **per-message model override** (`session.prompt.body.model`) as the main mechanism for dynamic switching:

- Server backend:
  - Keep a “default model” at process spawn for baseline behavior
  - Allow per-task overrides without respawn
- Agent backend:
  - Always include `model` on prompts when the worker profile dictates it
  - Optionally use `agent` routing when that’s the better abstraction (user-defined agents)

### 4) Add Task API affordances (without new tool IDs)

Extend Task API schemas and views (same tool IDs):

- `task_start(kind="worker")`:
  - optional `model` override (tag or provider/model)
  - optional `modelPolicy` (`"sticky" | "dynamic"`) for that task/worker
  - optional `respawn`/`forceNew` when changing the worker’s default model is desired

- `task_start(kind="op")`:
  - add worker model management ops (eg. `worker.model.set`, `worker.model.reset`)
  - keep existing `memory.*` ops intact

- `task_list`:
  - improve `workers` view to include model + resolution reason
  - add a view exposing tag semantics and current OpenCode defaults (`model`, `small_model`)

### 5) TUI selection path

Minimum viable:
- Use `orchestrator.models` to list models, then provide a command that applies a chosen model to a worker via `task_start(kind="op")`.

Ideal:
- Provide a TUI-forward flow (command-driven) that:
  - shows a filtered model list per worker need (vision/fast/etc.)
  - applies the selection immediately (and optionally persists it)

We should leverage what OpenCode already exposes:
- `/models` model dialog (built-in)
- `client.tui.*` APIs (toasts, dialogs) where practical

### 6) Fix reuse semantics

Make worker reuse model-aware by storing a model fingerprint (resolved model + policy) in the device registry and checking it before reuse.

---

## Out of scope

- Adding new orchestrator-registered tool IDs (beyond the existing Task API)
- Replacing the worker architecture (eg. removing server workers entirely)
- Implementing a full custom TUI widget system unless OpenCode’s APIs make it straightforward
- Changing OpenCode’s provider/model semantics (we integrate, we don’t redefine)

---

## Acceptance criteria

- A worker can run using:
  - an explicit `provider/model` input
  - a tag (`node:*`) resolved from the user’s configured models
  - a per-task override (one call) without respawning
- A running worker’s model can be changed via Task API and reflected in:
  - `task_list({ view: "workers" })` output
  - the worker’s `modelResolution`/reason string
- `node:fast` prefers `small_model` when available
- `node:vision` never selects a non-vision-capable model
- Model resolution behavior is unit-tested with dependency injection (no mocks)
