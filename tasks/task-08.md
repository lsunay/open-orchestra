# Task 08 — Observability & UX plumbing: define an event contract and wire plugin ↔ app ↔ desktop (plus TUI affordances)

## Required context (attach)

Attach `refactory.md` with this task. This task closes the biggest “product gap”:

- the plugin has real runtime state (workers, workflows, memory)
- the app/desktop must show that same truth via a single event contract

Key anchors:
- Bridge SSE exists today but is narrow + token-protected: `src/core/bridge-server.ts:47`
- App expects `orchestra.event` from OpenCode `/event`: `app/src/context/opencode.tsx:96` + `app/src/context/opencode-helpers.ts:119`
- Desktop assumes a separate skills API on 4097: `desktop/src-tauri/src/lib.rs:26`

## Dependencies

- Task 02 (recommended): wiring is simpler once everything is in a workspace and app/desktop paths are stable.
- Task 07 (recommended): workflows/memory events are much easier once they’re explicit primitives.

## Standards (non‑negotiable for this task)

- The system must be observable without reading code:
  - workers, workflows, memory writes, errors
- The UX must be explainable:
  - TUI toasts and commands are consistent
  - app shows the same truth as the plugin runtime
- Event schema must be versioned and tested.

---

## Before (what we have today)

- The app subscribes to OpenCode `/event` stream and expects `orchestra.event` payloads.
- The plugin does not clearly emit `orchestra.event`.
- A separate bridge SSE server exists (`src/core/bridge-server.ts`) but is scoped to stream chunks and requires a token for read access.
- Desktop config/plumbing has outdated assumptions about plugin file locations.

---

## Current state (exact references)

- Bridge server endpoints:
  - `POST /v1/stream/chunk`: `src/core/bridge-server.ts:55`
  - `GET /v1/stream`: `src/core/bridge-server.ts:87`
- App OpenCode event stream subscription: `app/src/context/opencode.tsx:84`
- App “orchestra.event” parsing expectations: `app/src/context/opencode-helpers.ts:119`
- Desktop skills port + env wiring: `desktop/src-tauri/src/lib.rs:26`

---

## After (definition of done for this task)

- There is exactly one documented source of “orchestrator events” for the app:
  - either:
    - **Option A:** the plugin emits `orchestra.event` into OpenCode events (if OpenCode supports custom event publish), or
    - **Option B (recommended):** the plugin exposes an orchestrator SSE endpoint (extend the existing bridge server) and the app subscribes to it.

Pick ONE and delete the other path.

- The event schema is documented and versioned:
  - `docs/events.md`
  - includes event types such as:
    - `orchestra.worker.status`
    - `orchestra.worker.stream`
    - `orchestra.workflow.started`
    - `orchestra.workflow.step`
    - `orchestra.workflow.completed`
    - `orchestra.memory.written`
    - `orchestra.error`

- TUI affordances are consistent:
  - use `tui.showToast` for key lifecycle events
  - optional: `tui.openSessions`, `tui.openModels`, `tui.openHelp` as onboarding helpers

---

## Expected file tree delta (after Task 08)

This task is primarily “contract + wiring” work:

```txt
docs/
  events.md                       # versioned orchestrator event schema (source of truth)
packages/orchestrator/
  src/
    core/
      bridge-server.ts            # extended to emit orchestrator events (or replaced)
    ux/
      event-publisher.ts          # optional: small adapter for emitting events/toasts
apps/control-panel/
  src/
    context/
      opencode.tsx                # keep OpenCode `/event` subscription
      orchestrator-events.ts      # new: subscribe to orchestrator event stream
```

## Scope (files you will touch)

- Event schema docs: `docs/events.md`
- Plugin event emission / server:
  - `packages/orchestrator/src/core/bridge-server.ts` (extend beyond chunks)
  - `packages/orchestrator/src/core/worker-pool.ts` (emit status events)
  - `packages/orchestrator/src/workflows/**` (emit workflow events)
  - `packages/orchestrator/src/memory/**` (emit memory events)
- App:
  - `apps/control-panel/src/context/opencode.tsx` (subscribe to orchestrator event source)
  - `apps/control-panel/src/context/opencode-helpers.ts` (parse event payloads)
- Desktop:
  - ensure `window.__OPENCODE__` includes orchestrator event endpoint if needed

---

## Implementation checklist (do in this order)

### A) Decide the transport

**Recommended:** extend the existing bridge server to expose:

- `GET /v1/events` (SSE, no auth OR read-only token)
- `POST /v1/events` (optional; internal use)

And keep:

- `POST /v1/stream/chunk` (write token required)
- `GET /v1/stream` (consider allowing read without token; keep write protected)

### B) Implement a minimal event emitter

Add an in-memory broadcaster that emits typed events:

- When a worker status changes (starting/ready/busy/error/stopped)
- When a workflow starts/steps/completes
- When memory writes happen

### C) Wire the app to the orchestrator event stream

In the app:

- keep OpenCode `/event` subscription for sessions/messages
- add a second SSE subscription to orchestrator events:
  - update UI state (workers, streams, workflow runs) from that feed

### D) Confirm desktop wiring

Desktop should set:

- `window.__OPENCODE__.baseUrl` (OpenCode server)
- `window.__OPENCODE__.skillsPort` or replace with orchestrator event endpoint if the skills API is retired
- optionally `window.__OPENCODE__.orchestratorEventsUrl`

---

## Verification (must pass to complete Task 08)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

And a manual UX check:

- Run desktop and confirm:
  - workers show status changes
  - streaming shows up in the UI
  - workflow runs show up
