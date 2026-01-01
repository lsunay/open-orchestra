# Worker Model Selection (Orchestrator) — Rules + 10 Tasks

## Project rules (non-negotiable)

1. Keep the registered tool surface unchanged: only `task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`.
2. No mocks in tests. Use dependency injection and fakes.
3. Never delete tests.
4. Model selection must work from user-configured sources:
   - OpenCode config (`model`, `small_model`, provider models/options)
   - env-detected providers
   - `/connect` credentials (API catalog providers with keys)
5. Vision workers must not silently downgrade to non-vision models.
6. Changes should be minimal and follow existing patterns in `packages/orchestrator`.
7. Any new user-facing behavior must be observable:
   - `task_list` should show enough information to debug model selection
   - model resolution should provide a reason string
8. Execution discipline (required per task):
   - Run `bun run lint`, `bun run typecheck`, `bun run test:e2e`, `bun run build`
   - Fix any failures before continuing
   - Commit and push to `main` before starting the next task

---

## Task files

- `tasks/task-00.md` is the preflight + “one task = one verified commit” discipline.
- `tasks/task-01.md` … `tasks/task-10.md` implement the 10 tasks below (1:1).

## 10 implementation tasks

### 1) Map the pipeline + lock a baseline

- Goal: Produce a precise internal map of model selection entry points and current behaviors.
- Deliverables:
  - A short architecture note (in repo docs) describing current model selection flow and known gaps.
  - A “baseline expectations” checklist used to verify future behavior doesn’t regress.
- Acceptance:
  - Clearly identifies spawn-time vs prompt-time selection and server vs agent backend differences.

### 2) Align built-in profiles with documented tag behavior

- Goal: Remove hardcoded model choices from built-in profiles where tags are intended.
- Deliverables:
  - Built-in worker profiles use tags consistently (especially the vision profile).
  - Docs are reconciled with code (no contradictions).
- Acceptance:
  - `task_list({ view: "profiles" })` reflects tag-based defaults for built-ins.

### 3) Make auto-selection consider “usable” providers correctly

- Goal: Ensure tag resolution can pick from providers that are actually usable, including API catalog providers that have credentials.
- Deliverables:
  - Tag resolution uses the same “configured/usable” semantics as model listing (`filterProviders` behavior).
  - Unit tests cover provider source cases (`config`, `custom`, `env`, `api+key`, `api-no-key`).
- Acceptance:
  - A connected API catalog provider can be selected by `node:*` tags when appropriate.

### 4) Add `small_model` support (fast path)

- Goal: Make `node:fast` resolve to OpenCode’s `small_model` when present.
- Deliverables:
  - Resolver uses `cfg.small_model` as the first choice for `fast` workloads.
  - Falls back to scored selection if `small_model` is not set or invalid.
- Acceptance:
  - With `small_model` configured, fast workers use it without requiring profile changes.

### 5) Centralize model resolution (single resolver + reason)

- Goal: Stop scattering model logic across spawn-only hydration and ad-hoc helpers.
- Deliverables:
  - A shared resolver module returning `{ resolvedModel, reason, policy, metadata }`.
  - Unit tests for tags, explicit models, and fallback behavior.
- Acceptance:
  - All codepaths produce a consistent, user-visible reason string.

### 6) Enable per-message model overrides (dynamic switching)

- Goal: Use OpenCode’s `session.prompt.body.model` to apply model choice at send time.
- Deliverables:
  - Worker sends include an optional model override derived from the resolved model.
  - Agent backend workers respect `profile.model` via prompt-level model overrides.
- Acceptance:
  - A worker’s model can be changed without respawning (for subsequent tasks) when policy is dynamic.

### 7) Extend Task API to support model overrides (no new tool IDs)

- Goal: Make model selection controllable via Task API.
- Deliverables:
  - `task_start(kind="worker")` supports optional `model` (tag or provider/model) and `modelPolicy`.
  - `task_list` adds/extends views so users can discover models, tags, defaults, and current worker settings.
- Acceptance:
  - Users can run: `task_start({ kind: "worker", workerId: "docs", model: "node:fast", task: "..." })`.

### 8) Add worker model management ops (set/reset) via `task_start(kind="op")`

- Goal: Support persistent (session-scoped) worker model changes without expanding tool IDs.
- Deliverables:
  - New ops such as:
    - `worker.model.set` (workerId + model + policy + optional respawn)
    - `worker.model.reset` (restore configured default)
  - Clear errors + suggestions when a model cannot be resolved.
- Acceptance:
  - After `worker.model.set`, subsequent tasks use the new model and `task_list` reflects it.

### 9) Fix reuse semantics (model-aware reuse + forceNew)

- Goal: Avoid accidentally reusing workers spawned with incompatible models/config.
- Deliverables:
  - Device registry stores enough to validate reuse compatibility (model fingerprint + policy).
  - Spawning supports `forceNew` to bypass reuse when requested.
- Acceptance:
  - Changing a worker’s default model does not silently keep an older reused process unless explicitly allowed.

### 10) TUI and UI integration

- Goal: Make model selection usable from the OpenCode TUI (and optionally the control panel).
- Deliverables:
  - New orchestrator command shortcuts that guide selection and apply it (eg. `orchestrator.models`, `orchestrator.worker-model-set`).
  - “Happy path” documented: list → select → apply → verify (all from TUI).
  - Optional: add worker model controls to `apps/control-panel` if it already manages workers.
- Acceptance:
  - A user can change a worker’s model from the TUI without editing JSON by hand (command-driven flow).
