# Task 04 — Prompts + permissions: make the “mental model” explicit and enforceable (OpenCode-aligned)

## Required context (attach)

Attach `refactory.md` with this task. This task implements:

- `refactory.md` → “OpenCode alignment (naming + formats)” (skills vs agents vs permissions)
- `refactory.md` → “SDK TUI (how we should simplify UX)” (use the documented TUI API)
- `refactory.md` → “Glossary + sources of truth” (remove “skill ≈ profile” ambiguity)

## Dependencies

- Task 02 (recommended): this task is easiest after the workspace move because it introduces `packages/orchestrator/prompts/**`.
- Task 03 (recommended): prompt refactors are safest once tests are tiered and deterministic.

## Standards (non‑negotiable for this task)

- Prompt text must not be scattered in giant TS files; prompts are content, not code.
- Permissions must be explicit and inspectable (no “mystery tool access”).
- Naming must match OpenCode docs:
  - agents are agents
  - skills are skills
  - worker profiles are orchestrator-owned config

---

## Before (what we have today)

- Worker prompts live in `src/config/profiles.ts` as large string literals.
- Orchestrator prompt lives in `prompts/orchestrator.ts` as a template string.
- Permissions/tool access are split across:
  - worker profile `tools` booleans
  - orchestrator assumptions (“never use MCP tools directly”)
  - OpenCode global `permission` config (outside this repo)
- The UI uses a “skills” concept that actually resembles agents/profiles.

---

## Current state (exact references)

Where prompts currently live:

- Orchestrator agent prompt is a TS template string: `prompts/orchestrator.ts:8`
- Worker prompts are embedded in built-in profiles as TS string literals: `src/config/profiles.ts:10`

Where permissions/tools are currently expressed:

- Worker tool restrictions live in profiles: `src/config/profiles.ts:30` (example: docs has `tools.write=false`)
- Orchestrator “tool surface” is listed in the prompt text (manual contract): `prompts/orchestrator.ts:15`
- Orchestrator uses TUI toasts in runtime + tools:
  - `src/index.ts:65`
  - `src/command/ux.ts:51`

---

## After (definition of done for this task)

- Prompts are stored as files and loaded by reference:
  - `packages/orchestrator/prompts/orchestrator.md` (or `.txt`)
  - `packages/orchestrator/prompts/workers/<id>.md`
- Worker profiles store:
  - identity + capability metadata (id, name, supportsVision, etc.)
  - but do **not** embed large prompt blobs inline
- Permissions are documented and mapped to OpenCode primitives:
  - OpenCode `permission.*` (global and per-agent overrides)
  - OpenCode `tools.*` booleans per agent
- A single doc explains:
  - which prompt applies where
  - which tools are allowed for each worker/agent
  - how the orchestrator uses SDK TUI methods to guide users

---

## Expected file tree delta (after Task 04)

This task should make prompts *visible as content* and remove large inline prompt strings:

```txt
packages/orchestrator/
  prompts/
    orchestrator.md              # moved from prompts/orchestrator.ts
    workers/
      vision.md
      docs.md
      coder.md
      architect.md
      explorer.md
      memory.md
  src/
    prompts/
      load.ts                    # prompt file loader + cache
    config/
      profiles.ts                # now references prompt files, not inline strings
```

## Scope (files you will touch)

- `packages/orchestrator/prompts/**` (new prompt files)
- `packages/orchestrator/src/config/profiles.ts` (remove embedded prompt strings; replace with file refs)
- `packages/orchestrator/src/index.ts` (ensure orchestrator agent prompt references file-based prompt)
- Docs:
  - `docs/prompts.md`
  - `docs/permissions.md` (or extend existing config docs)

---

## OpenCode contracts you must align to (copy/paste reference)

### Permissions (OpenCode)

From OpenCode docs, permissions are configured in `opencode.json`:

```json
{
  "permission": {
    "edit": "allow",
    "bash": "ask",
    "skill": "ask",
    "webfetch": "deny",
    "doom_loop": "ask",
    "external_directory": "ask"
  }
}
```

Agents can override permissions and tool enablement via frontmatter:

```yaml
---
tools:
  skill: false
permission:
  skill:
    "internal-*": "deny"
    "*": "allow"
---
```

### SDK TUI (OpenCode)

The SDK provides TUI controls:

- `tui.openHelp()`
- `tui.openSessions()`
- `tui.openThemes()`
- `tui.openModels()`
- `tui.appendPrompt({ body: { text } })`
- `tui.showToast({ body: { message, variant } })`
- `tui.executeCommand({ body: { command } })`

---

## Implementation checklist (do in this order)

### A) Move prompt content into files

1. Create `packages/orchestrator/prompts/orchestrator.md` and move the content from the current orchestrator prompt.
2. Create `packages/orchestrator/prompts/workers/vision.md`, `docs.md`, `coder.md`, `architect.md`, `explorer.md`, `memory.md`.
3. Create a tiny loader utility:
   - `packages/orchestrator/src/prompts/load.ts`
   - reads prompt files relative to the package directory
   - caches results (avoid FS reads on every message)

### B) Reduce `profiles.ts` to metadata + references

Refactor `packages/orchestrator/src/config/profiles.ts` so each profile has:

- `id`, `name`, `purpose`, `whenToUse`
- capability flags
- tool policy (minimal)
- `promptFile: "workers/<id>.md"` (or similar)

### C) Enforce permissions at the “edges”

1. Document expected OpenCode permissions required for safe operation:
   - orchestrator agent should not have `bash`/`edit` by default unless user chooses
   - coder worker may have `edit`/`bash` (user-controlled)
2. Make the orchestrator’s injected agent config explicit in `packages/orchestrator/src/index.ts`:
   - set `tools` booleans for the orchestrator agent
   - optionally set `permission` overrides

### D) Use the TUI to reduce confusion (UX rule)

Update `orchestrator_start` and onboarding tools so they:

- call `client.tui.openHelp()` after first install (optional)
- call `client.tui.openModels()` when no valid model is configured
- use `client.tui.showToast()` for:
  - worker spawned
  - worker failed
  - workflow completed

These interactions should be small, consistent, and documented in `docs/prompts.md`.

---

## Verification (must pass to complete Task 04)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

And run a manual smoke check:

- Start OpenCode with the plugin and verify the orchestrator agent prompt still works and workers still spawn as before.
