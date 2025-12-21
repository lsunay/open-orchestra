# plan-diff.md

## Research Summary (Branches vs current v0.0.2-tests)
I reviewed three remote branches:
- origin/cursor/roocode-orchestrator-implementation-03eb
- origin/cursor/roocode-orchestrator-implementation-693f
- origin/cursor/roocode-orchestrator-implementation-b76e

The current repo already has strong UX tools, spawner behavior, config loader, and models/tools structure. The branches mainly add workflows + boomerang flow, plus varying degrees of refactor and config/schema additions.

## Branch 03eb ("create-orchestrator-tools" + workflow engine)
- Adds a simple workflow engine in src/workflows/engine.ts with list/get/run and Markdown output.
- Adds roocode boomerang sequential workflow with a deterministic plan/implement/review/fix loop.
- Introduces tool registration via src/tools/create-orchestrator-tools.ts and heavily rewires tool exports.
- Adds list_workflows + run_workflow tools using engine.
- Net effect: feature-rich, but large tool re-org that increases surface area and diff size.

## Branch 693f (minimal workflow engine)
- Adds a lightweight workflow engine (EventEmitter) and boomerang chain using sendToWorker.
- Minimal config/schema changes, light touch on tools.
- Lacks security limits and structured workflow outputs.
- Net effect: small, but too simplistic for safety/UX and lacks workflow discovery tools.

## Branch b76e (security + config + workflow engine)
- Adds a structured workflow engine (register/list/run) with security caps.
- Adds roocode boomerang workflow with templated step prompts and limits (max steps/task/carry/timeout).
- Adds workflows + security config sections and schema changes.
- Adds core/system layer that refactors plugin entry and tool registration.
- Net effect: strongest workflow design + limits, but the refactor increases repo complexity.

## Selected Elements for Integration
- Engine + types model: take b76e workflow engine/types (security limits, structured metrics).
- Workflow definition: take b76e roocode boomerang template (step templating + carry limits).
- Tool UX: take 03eb list_workflows/run_workflow tool shapes and Markdown output.
- Avoid large refactors: keep current tool/module layout and plugin entry (no system layer, no big tool factory).

## UX Observations
- Current UX already offers orchestrator.start/demo/dashboard/help; we should extend these with workflows, not replace.
- Existing spawn/config flows are strong but can be simplified with fewer commands and clearer onboarding prompts.

---

# Master Plan (Minimal Surface Area + Full Observability)

## Goals
- Keep the repo small and modular while adding workflows + better UX.
- Achieve total observability without debug spam in the UI.
- Fix model/profile mapping UX so user model selection is never forced.
- Add testing for performance, spawn limits, registry shutdown scoping, and workflow efficacy.

## Directory Restructuring (Minimal Additions)
Add only two small surfaces:
- `src/workflows/` for workflow engine + definitions.
- `src/tools/tools-workflows.ts` for workflow tools (list/run).

Keep all other modules in place. Avoid tool factory refactors and new core layers.

## Scope Reduction Decisions (Explicit)
- No new "system" layer (keep `src/index.ts` as plugin entry).
- No new tool factory; maintain `src/tools/*.ts` modules.
- No refactor of `src/workers/spawner.ts` beyond log gating and small UX messaging.
- No new global singletons beyond `src/tools/state.ts`.
- Keep memory tooling opt-in and off the default command list.

## Final Directory Tree (Proposed)
```
/docs
  /architecture.md
  /guide.md
  /reference.md
/schema
  /orchestrator.schema.json
/src
  /config
    /orchestrator.ts
    /profiles.ts
  /core
    /bridge-server.ts
    /device-registry.ts
    /jobs.ts
    /message-bus.ts
    /profile-lock.ts
    /registry.ts
    /runtime.ts
  /models
    /catalog.ts
    /hydrate.ts
  /tools
    /index.ts
    /tools-workers.ts
    /tools-profiles.ts
    /tools-ux.ts
    /tools-memory.ts
    /tools-diagnostics.ts
    /tools-workflows.ts
    /config-store.ts
    /markdown.ts
    /normalize-model.ts
    /state.ts
  /ux
    /handbook.ts
    /idle-notification.ts
    /pruning.ts
    /repo-docs.ts
  /workers
    /prompt.ts
    /spawner.ts
  /workflows
    /engine.ts
    /index.ts
    /roocode-boomerang.ts
    /types.ts
  /index.ts
  /types/index.ts
/test
  /orchestrator.test.ts
  /workflow.test.ts
  /integration/spawn/auto-spawn-limits.test.ts
  /performance/*.bench.ts
```

## Command Surface (Minimal, Discoverable)
Default commands injected:
- `orchestrator.status`, `orchestrator.models`, `orchestrator.profiles`
- `orchestrator.spawn.<id>` (per profile)
- `orchestrator.start`, `orchestrator.dashboard`, `orchestrator.help`, `orchestrator.demo`
- `orchestrator.workflows`, `orchestrator.boomerang`

Advanced tools available but not advertised:
- `orchestrator.diagnostics`, `orchestrator.device_registry`, `worker_trace`
- `set_profile_model`, `reset_profile_models`, `set_autospawn`, `set_orchestrator_agent`

## Onboarding + First-Run Experience
- First run message: 2-3 next steps only (no walls of text).
- Avoid auto-pinning models on startup.
- `orchestrator.demo` runs only on explicit user command or controlled by `ui.firstRunDemo` flag.
- Demo flow:
  1) Show short handbook summary.
  2) Suggest `orchestrator.models`.
  3) Suggest `set_profile_model` and `orchestrator.start`.
  4) Suggest `orchestrator.boomerang` (optional).

## UX and Observability Plan
1) Debug output gating
- Replace direct `[DEBUG:*]` console logs with a small logger module.
- Default log level: warn/error only.
- Enable debug with `OPENCODE_ORCH_DEBUG=1` or `config.ui.debug=true`.
- Buffer last N log entries in memory; expose via `orchestrator.diagnostics` (on-demand).

2) Onboarding
- Keep `orchestrator.demo` short and actionable: 2-3 commands only.
- Prefer "opt-in setup": only pin models when the user runs `orchestrator.setup`.

3) Model/Profile Mapping Bug (forced model)
- Identify where model pinning happens automatically (likely `autofill_profile_models` in demo/setup path).
- Ensure no auto-pinning runs on startup without explicit user action.
- Ensure worker model resolution uses `auto:*` tags at spawn-time, not global overwrites.
- Add a config toggle to disable any automated model pinning in onboarding.
- Audit `orchestrator.json` for persisted profile overrides; stop rewriting unless user invokes it.
- Add a diagnostic message that explains *why* a profile model was chosen at spawn-time.

## Workflow Integration (Minimal Surface Area)
- Add `src/workflows/engine.ts`, `types.ts`, `roocode-boomerang.ts`, `index.ts`.
- Engine uses b76e-style security limits (max steps/task/carry/timeout).
- Workflow tools: `list_workflows`, `run_workflow` with Markdown output.
- Wire new commands: `orchestrator.workflows`, `orchestrator.boomerang`.
- Keep all existing tool organization; only add a small new module.
- Workflow engine inputs:
  - `workflowId`, `task`, `attachments`, `autoSpawn`
  - `security` defaults from config with per-run overrides
- Workflow output:
  - Structured step metrics + Markdown summary for humans
  - Consistent error shape for UI display

## Config + Schema Changes (Explicit Fields)
Add to `src/types/index.ts` and `schema/orchestrator.schema.json`:
- `ui.debug?: boolean` (debug logging toggle)
- `workflows?: { enabled?: boolean; roocodeBoomerang?: { enabled?: boolean; steps?: []; maxSteps?: number; maxTaskChars?: number; maxCarryChars?: number; perStepTimeoutMs?: number; } }`
- `security?: { workflows?: { maxSteps?: number; maxTaskChars?: number; maxCarryChars?: number; perStepTimeoutMs?: number; } }`

Defaults:
- workflows enabled, but only one built-in workflow exposed.
- security caps set to conservative defaults (maxSteps=4, maxTaskChars=12k, maxCarryChars=24k, timeout=120s).

## Docs Rewrite (Short, Focused)
- `docs/guide.md`: quick start + core commands + "first run" flow.
- `docs/reference.md`: short tool index; keep under 2-3 pages.
- `docs/architecture.md`: one diagram + module boundaries + lifecycle.
- README: add workflows section with one example.
- Add a short "Troubleshooting" section (model resolution, debug logs, worker stuck).

## Diff Workflow Management (Integration Strategy)
- Keep changes localized to the minimal new files and a few touched files:
  - `src/index.ts`, `src/tools/index.ts`, `src/tools/tools-workflows.ts`
  - `src/config/orchestrator.ts`, `src/types/index.ts`, `schema/orchestrator.schema.json`
  - `src/workflows/*`
  - `docs/*` (guide/reference/architecture/README)
- No new "system" layer; no tool factory; no new runtime singletons.
- Do not change existing spawner behavior beyond log gating and UX messaging.

## Testing Plan (Required)
1) Performance
- Add lightweight perf tests (not CI-blocking by default).
- Measure: spawn latency (single + concurrent), workflow step throughput.
- Track with `bun test` + optional `test/performance/*.bench.ts`.
  - Metrics: P50/P95 spawn time, workflow step duration, registry update time.
  - Budget targets documented in test comments (e.g., spawn < 2s on dev box).

2) Spawn Amounts + Limits
- Add tests for concurrent spawn dedupe and `spawnWorkers` behavior.
- Validate `autoSpawn` limits and failure handling.
  - Add/extend `test/integration/spawn/auto-spawn-limits.test.ts`.
  - Ensure max parallel spawns and per-profile dedupe work across sessions.

3) Registry Shutdown Scoping
- Test that when a session is deleted, only workers spawned by that session are shut down.
- Ensure other sessions remain alive (device registry confirms).
- Add a mock registry + session event simulation test.
  - Introduce a per-session worker ownership map (sessionId -> workerIds).
  - Ensure `shutdownAllWorkers` uses this map instead of global shutdown.

4) Workflow Efficacy
- Add deterministic tests using mocked workers to ensure:
  - Steps run in order.
  - Outputs chain correctly.
  - Security caps enforce limits.
- Add a smoke test asserting a workflow can "solve" a simple task (mocked).
  - Use a canned task (e.g., "Rename function x to y") and verify chain output contains required keywords.
  - Ensure `run_workflow` tool returns Markdown summary for UX consistency.

## Quality Standards (Definition of Done)
- No new global side effects on startup (opt-in behaviors only).
- No UI debug spam; diagnostics only on demand.
- All new commands documented and discoverable.
- Tests cover: performance (bench), spawn behavior, registry shutdown scoping, workflow correctness.
- Minimal diff footprint (no refactor of existing core modules).
- UX: every failure path includes "next action" guidance (models, spawn, or config).
- Compatibility: existing tools and commands remain available unchanged.
- Reliability: workflow failures are isolated and do not break registry/spawner.

## Checkpoints
1) Baseline + Audit
- Confirm source of debug spam and model pinning behavior.
- Draft log gating + pinning fix spec.
- Identify and document which config files are being mutated on startup.

2) Minimal Architecture Changes
- Add workflow folder + workflow tools.
- Update types/config/schema for workflows + security.
- Wire workflow engine initialization in `src/index.ts` only.

3) UX Fixes
- Implement log gating + diagnostics buffer.
- Fix model/profile mapping force behavior.
- Update onboarding flow (demo/setup messaging).
- Validate no debug output appears on launch without opt-in.

4) Testing
- Add tests for spawn limits, registry shutdown scoping.
- Add workflow tests (security + chaining + smoke solve).
- Add perf benches (optional by default).
- Run `bun test` and record results.

5) Docs + Cleanup
- Update README + docs.
- Confirm command list is short and clear.
- Add a "Troubleshooting" section for model selection + debug logs.
