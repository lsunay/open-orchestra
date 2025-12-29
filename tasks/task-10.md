# Task 10 — Desktop + dev onboarding: one command to start, consistent wiring, and shippable packaging

## Required context (attach)

Attach `refactory.md` with this task. Desktop is the “product shell” that must wire everything cleanly:

- `refactory.md` → Desktop runtime wiring + plugin discovery mismatch (`desktop/src-tauri/src/lib.rs:112`)
- `refactory.md` → Ports table (4096 OpenCode, 4097 skills API, bridge SSE)
- `refactory.md` → Target monorepo tree (desktop expects stable `packages/orchestrator/dist/index.js`)

## Dependencies

- Task 02 (recommended): desktop wiring changes assume `apps/desktop/` and `packages/orchestrator/`.
- Task 08 (recommended): desktop should expose orchestrator event endpoint (if that’s the chosen contract).
- Task 09 (recommended): desktop should load the branded control panel build.

## Standards (non‑negotiable for this task)

- Desktop is a *product*, not a dev-only wrapper:
  - it must start reliably
  - it must be configurable
  - it must surface failures clearly
- Developer onboarding must be “one command” and documented.

---

## Before (what we have today)

- Desktop searches for plugin in `orchestra/dist/index.js` (outdated relative to current structure).
- Ports and base URLs are partially configurable, but the developer flow is not documented end-to-end.
- The control panel and desktop are not clearly presented as the primary user UX.

---

## Current state (exact references)

- Desktop plugin discovery logic (currently searches `orchestra/dist/index.js`): `desktop/src-tauri/src/lib.rs:112`
- Desktop uses `DEFAULT_SKILLS_PORT = 4097`: `desktop/src-tauri/src/lib.rs:26`
- App resolves skills API base to `http://localhost:4097` by default: `app/src/lib/opencode-base.ts:43`

If Task 02 is complete, translate `desktop/...` → `apps/desktop/...` using `refactory.md` path mapping.

---

## After (definition of done for this task)

- Desktop can:
  - start the OpenCode sidecar
  - load the orchestrator plugin from the workspace build output
  - pass base URLs to the web UI (`window.__OPENCODE__`)
  - show logs + errors clearly
- Developer onboarding is simple:

  - `bun run dev` starts:
    - orchestrator plugin in watch mode (if applicable)
    - OpenCode server (sidecar or local)
    - control panel app
    - desktop app (optional)

- Docs include:
  - “Quickstart (dev)”
  - “Quickstart (user)”
  - “How to connect the app to a remote OpenCode instance”

---

## Expected file tree delta (after Task 10)

This task mostly changes wiring + scripts:

```txt
apps/desktop/
  src-tauri/src/lib.rs            # plugin discovery + sidecar wiring
apps/control-panel/
  dist/                           # release build used by desktop (when packaged)
package.json                      # root dev scripts (one-command onboarding)
docs/
  quickstart.md
  guide.md
  troubleshooting.md
```

## Scope (files you will touch)

- `apps/desktop/src-tauri/src/lib.rs` (plugin path resolution, wiring)
- `apps/desktop/scripts/*` (predev, env injection)
- `apps/control-panel` build output + url wiring
- Root scripts: `package.json` (one-command dev)
- Docs:
  - `docs/quickstart.md`
  - `docs/guide.md`
  - `docs/troubleshooting.md`

---

## Implementation checklist (do in this order)

### A) Desktop: fix plugin discovery

Update `find_orchestrator_plugin_path()` to search:

- `packages/orchestrator/dist/index.js` (primary)
- `packages/orchestrator/src/index.ts` (dev fallback)

Stop using `examples/orchestra/` as the plugin source.

### B) Desktop: wire URLs clearly

Desktop should set:

- `window.__OPENCODE__.baseUrl` (OpenCode server)
- `window.__OPENCODE__.skillsPort` (only if still used)
- `window.__OPENCODE__.skillsBase` (optional)
- `window.__OPENCODE__.orchestratorEventsUrl` (if Task 08 introduces it)

### C) One-command dev

Add a root `dev` script that:

- builds/watch the plugin package
- starts the control panel dev server
- starts desktop dev (optional)

Provide a `dev:min` script for headless plugin-only development.

### D) Packaging + release readiness

Ensure the desktop build is reproducible:

- `bun run build` at root should produce a release-ready desktop artifact.
- Add a minimal release checklist to docs.

---

## Verification (must pass to complete Task 10)

From repo root:

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

Manual checks:

- `bun run dev` brings up the system without manual edits.
- Desktop can connect to the OpenCode sidecar and the control panel renders a live dashboard.
