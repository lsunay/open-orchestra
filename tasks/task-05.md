# Task 05 — Workers: unify “skills ↔ profiles ↔ agents” and make worker execution configurable

## Required context (attach)

Attach `refactory.md` with this task. This task is the concrete implementation of the “no more layers” rule:

- `refactory.md` → “Glossary + sources of truth” (skills vs agents vs worker profiles)
- `refactory.md` → “Worker → OpenCode mapping” (how our worker standard compiles down)
- `refactory.md` → “The key wiring today (what plugs into what)” (server-spawn workers today)
- `refactory.md` → “Risk register” #1 (worker spawning stability) and #3 (UI event mismatch)

## Dependencies

- Task 02 (recommended): paths referenced here assume the monorepo layout.
- Task 03 (recommended): tests must protect worker execution while we add a second backend.
- Task 04 (recommended): prompts/permissions clarity makes agent-backed workers less ambiguous.

## Standards (non‑negotiable for this task)

- “Worker” must map to a clear OpenCode primitive:
  - **preferred:** OpenCode **agent/subagent** (`session.prompt` with `agent`)
  - optional fallback: spawned OpenCode server processes (legacy path)
- Orchestrator configuration must not depend on undocumented SKILL.md fields.
- UI terminology must reflect reality: if we’re editing OpenCode agents, we call them agents.

---

## Before (what we have today)

- Workers are primarily implemented as spawned OpenCode servers (`src/workers/spawner.ts`), tracked by `worker-pool`.
- There are “skills” in multiple places, with overlapping meaning:
  - UI “skills” (actually agent/profile-like configs)
  - `.opencode/skill/*/SKILL.md` (OpenCode skills, but extra frontmatter is ignored)
  - `.opencode/agent/subagents/*/SKILL.md` (nonstandard location/format vs OpenCode agents docs)
- The UI expects `orchestra.event` for worker/subagent streaming, but the plugin does not clearly emit it.

---

## Current state (exact references)

Server-spawn worker implementation:

- Worker spawn entrypoint: `src/workers/spawner.ts:318`
- Worker send entrypoint: `src/workers/spawner.ts:690`
- Worker processes are protected from recursive spawning by env var:
  - orchestrator guard: `src/index.ts:36`
  - worker env injection: `src/workers/spawner.ts:201`

UI expects “orchestra.event” in OpenCode `/event` stream:

- event handling call site: `app/src/context/opencode.tsx:96`
- orchestra parsing: `app/src/context/opencode-helpers.ts:119`

---

## After (definition of done for this task)

- Workers can run in **one of two backends** (configurable per worker):

  1. `backend: "agent"` (default) — uses OpenCode agents/subagents in-process:
     - calls `client.session.prompt({ body: { agent: "<workerId>", parts: [...] } })`
  2. `backend: "server"` (legacy) — uses the existing spawned-server approach.

- Worker definitions become:
  - **Agent config** (OpenCode standard): `.opencode/agent/<workerId>.md` (mode: `subagent`)
  - **Optional skill packs** (OpenCode skill standard): `.opencode/skill/<name>/SKILL.md`
- The orchestrator config references workers by `workerId` and chooses a backend.
- The UI and docs stop using the term “skill” for agent configs.

---

## Expected file tree delta (after Task 05)

This task introduces a clear “worker backend” seam without breaking the existing server-spawn path:

```txt
packages/orchestrator/
  src/
    workers/
      backends/
        agent.ts                 # new: OpenCode agent/subagent backend
        server.ts                # new: wraps existing spawn+send implementation
      spawner.ts                 # becomes a thin dispatcher
    config/
      orchestrator.ts            # new config: per-worker backend selection
  schema/
    orchestrator.schema.json     # validates backend config
examples/orchestra/
  .opencode/
    agent/
      vision.md                  # OpenCode agent format (markdown), not SKILL.md
      memory.md
      ...
```

## Scope (files you will touch)

- Orchestrator worker runtime:
  - `packages/orchestrator/src/workers/spawner.ts` (split into backends)
  - `packages/orchestrator/src/workers/backends/agent.ts` (new)
  - `packages/orchestrator/src/workers/backends/server.ts` (new; wraps existing behavior)
  - `packages/orchestrator/src/types/**` (worker config types)
- Config:
  - `packages/orchestrator/src/config/orchestrator.ts` (add backend selection)
  - `packages/orchestrator/schema/orchestrator.schema.json` (document + validate backend config)
- Example OpenCode agent files:
  - `examples/orchestra/.opencode/agent/vision.md` etc (or `packages/orchestrator/examples/agent/*.md`)
- UI terminology (later tasks will expand UI): rename “skills” types/routes to “agents” where appropriate.

---

## OpenCode contract you will use (critical detail)

The OpenCode SDK supports selecting an agent for a prompt:

- `SessionPromptData.body.agent?: string` exists in the SDK types (see `@opencode-ai/sdk` generated types).

This is the keystone for removing spawned worker servers over time.

---

## Implementation checklist (do in this order)

### A) Define the worker execution model

1. Add a `WorkerBackend` union type:

   - `"agent"` — in-process OpenCode agent
   - `"server"` — spawned OpenCode server process

2. Extend worker profile/config to include:

   - `backend?: "agent" | "server"` (default: `"agent"`)
   - any backend-specific settings (timeouts, reuse policy)

### B) Implement `backend: "agent"`

Create `packages/orchestrator/src/workers/backends/agent.ts`:

- Inputs:
  - `workerId`
  - `message` + `attachments`
  - `directory` + `sessionId` (parent session)
- Behavior:
  - calls `ctx.client.session.prompt` with `body.agent = workerId`
  - returns extracted text output
- Streaming:
  - first: support non-streaming responses (stable baseline)
  - later tasks: integrate streaming via events (Task 08)

### C) Wrap the existing spawned-server code as `backend: "server"`

Create `packages/orchestrator/src/workers/backends/server.ts`:

- Move the existing spawn + send logic here with minimal changes.
- `spawner.ts` becomes a dispatcher that chooses backend.

### D) Migrate built-in workers gradually

1. Keep current default behavior behind a config flag:
   - initially default all workers to `backend: "server"` to preserve stability
2. Add a per-worker opt-in to `backend: "agent"` and update tests to cover both.
3. After parity is proven, flip defaults (later task).

### E) Normalize the file formats for worker definitions

Stop using `.opencode/agent/subagents/<name>/SKILL.md`.

Instead create `.opencode/agent/<name>.md` files like:

```markdown
---
description: Vision analysis worker
mode: subagent
model: opencode/gpt-5-nano
tools:
  webfetch: false
  edit: false
  bash: false
---

You are the vision worker. Focus on describing images and extracting text.
```

This aligns with `https://opencode.ai/docs/agents/`.

---

## Verification (must pass to complete Task 05)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

And run targeted E2E (recommended because this task touches worker execution):

- `bun run test:e2e` (at least the worker spawning test and one agent-backend smoke test)
