# Task 09 — App production UX: Warm Paper design system + show the whole system (workers/workflows/memory/config/chat)

## Required context (attach)

Attach `refactory.md` with this task. This task is where the system becomes understandable to humans:

- `refactory.md` → “The key wiring today” and “Ports, endpoints, and implicit contracts” (what the UI must visualize)
- `refactory.md` → “SDK TUI (how we should simplify UX)” (TUI is still the primary UX; app must match it)
- `refactory.md` → “Glossary + sources of truth” (UI labels must match OpenCode terms)

## Dependencies

- Task 02 (recommended): paths referenced here assume `apps/control-panel/` (formerly `app/`).
- Task 08 (recommended): the UI needs a stable event feed for workers/workflows/memory.

## Standards (non‑negotiable for this task)

- The control panel is the user’s “mental model UI”.
- Every screen must map to one underlying concept:
  - workers
  - workflows
  - memory
  - prompts
  - orchestrator config
- Branding must be consistent, minimal, and accessible (light + dark).

---

## Before (what we have today)

- The app has a worker dashboard and chat, but the data plane is unclear (events + skills API + OpenCode API).
- “Skills” naming leaks into UI even when representing agents/profiles.
- The visual system is not yet the requested branded “Warm Paper” system.

---

## Current state (exact references)

Where the current UI integration lives today (pre-workspace move):

- OpenCode event subscription: `app/src/context/opencode.tsx:84`
- Orchestra-event parsing expectations: `app/src/context/opencode-helpers.ts:119`
- Skills/agents API base default: `app/src/lib/opencode-base.ts:43`
- Current app styling entry: `app/src/index.css:1`

If Task 02 is complete, translate these to `apps/control-panel/...` using `refactory.md` path mapping.

---

## After (definition of done for this task)

- The app implements the Warm Paper Design System (light + dark) and uses Geist fonts:

  **Light**
  - background: `hsl(40, 30%, 97%)`
  - cards: `hsl(40, 25%, 95%)`
  - text: `hsl(30, 15%, 15%)`
  - borders: `hsl(35, 15%, 85%)`

  **Dark**
  - base: `hsl(30, 5%, 10.5%)` (`#1b1b1b`)
  - surfaces: `hsl(30, 5%, 12%)` (`#1e1e1e`)
  - text: `hsl(40, 20%, 92%)`
  - borders: `hsl(30, 5%, 20%)`

- App pages show:
  - Workers: list, details, streams, last result
  - Workflows: list, run, active runs, history
  - Memory: last writes, summaries, search results
  - Config: read-only view + safe editor w validation
  - Prompts: view current orchestrator + worker prompt sources
  - Chat: send messages through OpenCode server (and optionally select agent)

- Terminology is corrected:
  - UI “skills” → “agents” (or “worker profiles”) depending on what it really is.

---

## Expected file tree delta (after Task 09)

This task is mostly UI code + design tokens:

```txt
apps/control-panel/
  src/
    index.css                     # Warm Paper tokens + dark mode
    components/                   # updated to use new tokens/typography
    pages/                        # simplified IA: dashboard/workflows/memory/config/prompts/chat
    context/                      # consumes orchestrator event stream + OpenCode APIs
```

## Scope (files you will touch)

- `apps/control-panel/src/index.css` (CSS variables + dark mode)
- `apps/control-panel/tailwind.config.ts` (theme tokens, `bg-background`, `text-foreground`, etc.)
- `apps/control-panel/src/components/**` and `apps/control-panel/src/pages/**`
- `apps/control-panel/src/types/*` (rename `skill` types if they represent agents)
- `apps/control-panel/src/context/**` (data sources, event stream wiring)
- `apps/control-panel/src/context/__tests__/*` (update tests to match naming)

---

## Implementation checklist (do in this order)

### A) Implement Warm Paper tokens

1. Add CSS variables in `apps/control-panel/src/index.css`:
   - `--background`, `--card`, `--foreground`, `--muted`, `--border`, `--ring`, etc.
2. Map Tailwind theme to these vars.
3. Add dark mode via:
   - `class="dark"` or `data-theme="dark"` (pick one)
   - persist preference (localStorage)

### B) Geist typography

1. Add Geist Sans + Geist Mono:
   - either via npm package (preferred for offline)
   - or via bundled font files
2. Set base font stacks:
   - `font-sans` uses Geist Sans
   - `font-mono` uses Geist Mono

### C) Simplify the IA (information architecture)

Navigation should be:

- Dashboard (workers + active workflows)
- Workflows
- Memory
- Config
- Prompts
- Chat
- Settings (last)

Each page should explain “what this is” in one sentence (small text-muted-foreground).

### D) Make “messaging from the app” first-class

Use OpenCode SDK client calls already in the app:

- create session
- send prompt parts (text + attachments)
- optionally set `agent` for a message

### E) Update tests

Update `apps/control-panel/src/context/__tests__/skills-context.test.tsx` to match renamed concepts and endpoints.

---

## Verification (must pass to complete Task 09)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

Manual UX checks:

- Run the app and confirm:
  - light/dark modes match the Warm Paper spec
  - key workflows are visible and understandable
  - chat can send a message and show responses
