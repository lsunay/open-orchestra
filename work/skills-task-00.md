# Task 00 — Skills System Deep Research (Deterministic Map + Gaps)

This document is the deterministic output of `tasks/00-skills-system-research.md`.
It is the single, checkable snapshot that Tasks 01–03 depend on.

## Verified contract: OpenCode Agent Skills (SKILL.md)

Source: `/.tmp/research/opencode-skills.mdx`

- Discovery roots:
  - Project: `.opencode/skill/<name>/SKILL.md`
  - Global: `~/.config/opencode/skill/<name>/SKILL.md`
  - Project (Claude): `.claude/skills/<name>/SKILL.md`
  - Global (Claude): `~/.claude/skills/<name>/SKILL.md`
- Walk-up behavior: project-local discovery walks up from cwd to the git worktree root and merges matches along the way.
- Frontmatter fields recognized: `name`, `description`, `license`, `compatibility`, `metadata`.
- Name validation (OpenCode contract):
  - 1–64 chars, lowercase alphanumeric + single hyphen separators.
  - Must match directory name.
  - Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Description length: 1–1024 chars.
- Tool usage:
  - `<available_skills>` is listed in the `skill` tool description.
  - Skill load is via `skill({ name })`.

Implication: Skill discovery and validation should mirror this contract for deterministic tests.

## Repo-local system map (what code actually does today)

### Orchestrator plugin lifecycle + agent defaults

- Entry: `packages/orchestrator/src/index.ts`.
- Worker processes are guarded by `OPENCODE_ORCHESTRATOR_WORKER=1` and skip orchestrator initialization.
- The orchestrator agent is injected into OpenCode config with `tools.skill: false` by default.
  - This means the orchestrator agent never sees `<available_skills>` unless explicitly overridden.

### Workers + skill visibility

- Server workers:
  - Spawned via `packages/orchestrator/src/workers/backends/server.ts`.
  - Use `packages/orchestrator/src/workers/spawn/spawn-opencode.ts`.
  - Always set `OPENCODE_ORCHESTRATOR_WORKER=1` (no orchestrator hooks in that process).
  - Load `packages/orchestrator/bin/worker-bridge-plugin.mjs` (only `stream_chunk` tool today).
- Agent/subagent workers:
  - Run in-process via `packages/orchestrator/src/workers/backends/agent.ts`.
  - Orchestrator plugin hooks are available in these sessions.

### Worker prompts + skill usage

- Worker bootstrap prompt (`packages/orchestrator/src/workers/prompt/worker-prompt.ts`) does not mention `skill()`.
- Orchestrator workflows do not call `skill()` anywhere in the repo (search: `rg "skill\\(" packages/orchestrator/src`).

### Skill observability hooks available

OpenCode plugin hooks (from `packages/orchestrator/node_modules/@opencode-ai/plugin/dist/index.d.ts`):

- `tool.execute.before` (tool, sessionID, callID + args)
- `tool.execute.after` (tool, sessionID, callID + output/metadata)
- `permission.ask` (Permission → allow/ask/deny)

These hooks are usable only where the orchestrator plugin is loaded (in-process sessions).

### Control panel + desktop wiring

- Control panel uses a dedicated base URL for “skills API”:
  - `apps/control-panel/src/lib/opencode-base.ts` resolves `skillsBase`.
  - `apps/control-panel/src/context/agents.tsx` calls `/api/skills` + `/api/skills/events`.
  - UI labels these as agent profiles, not OpenCode skills.
- Desktop sidecar injects `window.__OPENCODE__.skillsBase` and sets:
  - `OPENCODE_SKILLS_PORT` / `OPENCODE_SKILLS_API_PORT`
  - Source: `apps/desktop/src-tauri/src/lib.rs`

The “skills API” is treated as a separate service from the OpenCode server and the orchestrator events stream.

## Gaps + contradictions (verified)

1) Skills API contract is undefined in this repo.
   - No `/api/skills` server implementation exists in `packages/` or `apps/`.
   - UI and docs reference it (see `docs/guide.md` and `docs/troubleshooting.md`), but no local provider is present.

2) Server workers are unobservable by the orchestrator plugin.
   - `OPENCODE_ORCHESTRATOR_WORKER=1` prevents hook instrumentation in server processes.
   - The worker-bridge plugin does not emit tool events today.

3) Event stream lacks skill-specific events.
   - `docs/events.md` has no `orchestra.skill.*` contract.
   - No permission or skill-load events are emitted from orchestrator code.

## Proposed observability contract (Task 02 input)

Use `orchestra.*` event envelope (`docs/events.md`) and emit skill-specific events.

### Event: `orchestra.skill.requested`

Emit on `tool.execute.before` when `tool === "skill"`.

Required fields (data payload):
- `sessionId`
- `callId`
- `skillName` (from tool args)
- `worker`: `{ id, kind }` (from worker ownership tracking)
- `workflow`: `{ runId?, stepId? }` (if available)
- `source`: `"in-process" | "server"`
- `timestamp`

### Event: `orchestra.skill.completed`

Emit on `tool.execute.after` when `tool === "skill"`.

Required fields:
- `sessionId`
- `callId`
- `skillName`
- `worker`: `{ id, kind }`
- `status`: `"success" | "error"`
- `durationMs`
- `outputBytes` (no raw content; only size + hash if needed)
- `metadata` (sanitized subset, no skill body)

### Event: `orchestra.skill.permission`

Emit on `permission.ask` for `permission.type === "skill"` when available.

Required fields:
- `sessionId`
- `permissionId`
- `callId?`
- `status`: `"allow" | "ask" | "deny"`
- `pattern` (resolved pattern if provided)
- `skillName?` (from permission metadata or correlation with callId)
- `worker`: `{ id, kind }`

Note: If `skillName` is unavailable at permission time, correlate later via `callId`.

## Decision: server-worker observability (Task 02 direction)

Chosen approach: **forward tool/permission events from server workers**.

Plan:
1) Extend `packages/orchestrator/bin/worker-bridge-plugin.mjs` to implement `tool.execute.*` and `permission.ask`.
2) Add a bridge endpoint to receive forwarded tool/permission events.
3) Emit `orchestra.skill.*` events from the orchestrator bridge so server workers match in-process parity.

Fallback: workflows that require skill determinism should prefer `agent`/`subagent` workers until forwarding is implemented.

## Decision: control panel “skills API” compatibility plan

Facts:
- The current UI expects a separate `/api/skills` CRUD API.
- No implementation exists in this repo.
- OpenCode main API exposes `GET /agent` (list only) via SDK types, but not CRUD.

Decision:
1) Treat the existing “skills API” as **agent profile management**, not OpenCode Agent Skills.
2) Implement or adopt a first-class **Agents API** (CRUD + events) in a service we control.
3) Preserve `/api/skills` as a compatibility alias during migration.

Target state:
- Control panel consumes the new Agents API (orchestrator/sidecar).
- `skillsBase` remains optional for remote scenarios, but no longer blocks the UI if absent.

## Artifacts + references

- OpenCode skills contract: `/.tmp/research/opencode-skills.mdx`
- Orchestrator plugin entry: `packages/orchestrator/src/index.ts`
- Worker spawner guard: `packages/orchestrator/src/workers/spawn/spawn-opencode.ts`
- Worker bridge plugin: `packages/orchestrator/bin/worker-bridge-plugin.mjs`
- Control panel skills/agents API client: `apps/control-panel/src/context/agents.tsx`
- Desktop wiring: `apps/desktop/src-tauri/src/lib.rs`
- Event contract: `docs/events.md`

## Task 01 readiness checklist (from this research)

- Skill name validation rules + description limits are now explicit.
- Discovery roots and walk-up behavior are specified for tests.
- Event contract and server-worker forwarding decision is locked for integration/E2E plans.
