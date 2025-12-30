# Workflow-First Orchestrator + Subagent Sessions — Execution Plan

## Why we’re doing this

Today, “workers” are primarily an orchestrator-plugin concept (mostly `opencode serve` processes), while the OpenCode TUI natively understands **agents** and **sessions**. This mismatch makes it hard for users to:

- Run deterministic, step-by-step multi-worker workflows without losing the main thread.
- Inspect/interrupt/repair a “child” worker mid-flight (especially for long running code/architecture steps).
- Cultivate a dedicated docs context that can be revisited and refined without polluting the main conversation.

We will:

1) Make worker “identity” configurable as **agent**, **subagent (child session)**, or **server**.
2) Keep the system **workflow-first** (deterministic orchestration as the default).
3) Add “on-the-spot” UX shortcuts (commands + keybinds) to switch views, inspect traces, and intervene.

We are intentionally choosing the **child-session subagent approach** over “server + proxy session mirroring” because it is simpler and leverages existing OpenCode UI primitives without adding an event-forwarding/transcript-mirroring subsystem.

## Non-goals (for this sequence)

- Building custom TUI panes or bespoke UI components (OpenCode SDK TUI API doesn’t support that).
- Implementing “server worker + linked proxy transcript” as the primary UX (keep in reserve for later).
- Rewriting the workflow engine; we extend it with deterministic “gates” and UX hooks.

## Target user workflows

### Deterministic build loop (default)

- User runs a workflow (e.g. “plan → implement → review → fix”).
- Orchestrator runs steps in background/foreground per config.
- User only intervenes when:
  - a step fails
  - a warning is raised
  - the user explicitly pauses

### Docs cultivation (interactive)

- `docs` runs as a **subagent** (child session).
- User can jump into that child session, refine context and understanding, then return.
- Main thread consumes docs outputs via explicit “summarize for parent / answer question for parent” prompts.

## Architecture (after)

```mermaid
flowchart TD
  subgraph OC[OpenCode Server + TUI]
    PARENT[Parent Session]
    CHILD[Child Session(s)\n(subagents)]
  end

  subgraph ORCH[Orchestrator Plugin]
    CFG[orchestrator.json\nprofiles + workflow UX policy]
    WF[Workflow Engine\n(step gates + intervene policy)]
    WP[Worker Pool\n(kind + run mode + status)]
    UX[TUI UX Hooks\n(toasts, prompt hints,\nopen sessions)]
  end

  subgraph WORKERS[Workers]
    SA[Subagent Worker\n(agent backend + child session)]
    AG[Agent Worker\n(agent backend + independent session)]
    SV[Server Worker\nopencode serve + bridge tools]
  end

  PARENT -->|runs| WF
  WF -->|dispatch step| WP
  WP -->|spawn/send| SA
  WP -->|spawn/send| AG
  WP -->|spawn/send| SV
  UX -->|toasts / prompt hints| PARENT
  SA -->|is a child session| CHILD
```

## Implementation strategy (3 tasks)

- **Task 01:** Config + schema + types: introduce `kind` + execution mode + UX policy; keep backwards compatibility with `backend`.
- **Task 02:** Subagent runtime: implement child-session workers (via `session.fork`) and add targeted UX shortcuts for switching/inspection.
- **Task 03:** Workflow-first determinism: define and implement “step-gated” execution + intervene policy + standardized wakeups/shortcuts across all workers.

## Definition of done (overall)

### Behavior

- Users can configure each worker profile as `kind: "server" | "agent" | "subagent"`.
- Subagents can be run in **foreground** (interactive) or **background** (deterministic) mode.
- Workflows support deterministic, step-by-step execution with a configurable intervene policy:
  - `never`, `on-warning`, `on-error`, `always`
- Users have reliable shortcuts to:
  - open session list and switch to a worker/subagent session
  - open trace for a worker
  - view dashboard/results/output for quick diagnosis

### Compatibility + stability

- Existing `backend: "server" | "agent"` configs remain valid and behave the same unless `kind`/new fields are set.
- Server workers remain isolated and do not recursively load the orchestrator plugin (existing guard stays).
- No debug logging corrupts the TUI output (existing “no console spam” discipline is maintained).

### Documentation

- `docs/` updated with the “workers vs agents vs skills” terminology and the new worker kinds/modes.
- `schema/orchestrator.schema.json` updated so configs validate.

### Tests

- Unit tests cover:
  - config parsing + backward compatibility
  - spawn routing decisions (server vs agent vs subagent)
  - workflow gating behavior (pause/continue)
- Integration tests cover:
  - child-session creation path (mocked OpenCode client)
  - intervene policy behavior under failure/warning conditions

## Quality control

### Standards to follow

- `docs/standards.md` is binding: stability-first, single source of truth, align to OpenCode contracts.
- “Skill” is never used as a synonym for profile/worker.
- Additive changes first; preserve rollback paths (feature flags / backwards-compatible defaults).

### Local verification (per task branch)

Run:

- `bun run lint`
- `bun run typecheck`
- `bun run test:plugin`
- `bun run build:plugin`

## Rollout + migration

- Ship Task 01 with backwards-compatible defaults (no behavior changes unless new fields are used).
- Ship Task 02 enabling `docs` as `subagent` behind config only.
- Ship Task 03 enabling deterministic workflow gating by default only if explicitly configured; otherwise keep current behavior and provide an opt-in.

## Progress

- Task 01: Done (config + schema + types).
- Task 02: Done (subagent runtime + UX shortcuts).
- Task 03: Done (step gating + intervene policy + continue workflow).
