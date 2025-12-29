# Task 02 — Convert to a real workspace (monorepo) + make repo boundaries explicit + remove tracked runtime artifacts

## Required context (attach)

Attach `refactory.md` with this task. This task specifically implements:

- `refactory.md` → “Target repo map (production monorepo)” + “Path mapping (current → target)”
- `refactory.md` → “Risk register” items #4 (tracked runtime artifacts) and #5 (version skew)
- `refactory.md` → Desktop discovery mismatch: `desktop/src-tauri/src/lib.rs:124`

## Dependencies

- Task 01 (recommended) so the move is continuously validated by `lint/typecheck/test/build`.

## Standards (non‑negotiable for this task)

- Preserve behavior: the orchestrator plugin must load and tests must remain green.
- No “half monorepo”: after this task, installs/builds/tests are run from one root with one lockfile.
- One source of truth: we stop tracking runtime artifacts (DBs, attachments, coverage outputs) in git.

---

## Before (what we have today)

- Root package is a publishable plugin (`opencode-orchestrator`), but `desktop/` depends on `@opencode-ai/app` via `workspace:*` even though there is no workspace.
- Package manager split-brain:
  - root uses Bun (`bun.lock`)
  - `app/` has both `bun.lock` and `package-lock.json`
- Tracked runtime artifacts exist:
  - `.opencode/user.db*` is committed
  - `.opencode/attachments/*` and `.opencode/vision/jobs.jsonl` are committed
  - `orchestra/coverage/lcov.info` is committed
- Desktop plugin path detection looks for `orchestra/dist/index.js` (does not match current plugin output at `dist/index.js`).

---

## Current state (exact references)

Workspace/version skew:

- Plugin package + scripts: `package.json:1`
- App deps/scripts (includes `@opencode-ai/sdk` `^1.0.203`): `app/package.json:1`
- Desktop deps/scripts (has `@opencode-ai/app: workspace:*`): `desktop/package.json:1`

Desktop plugin discovery bug:

- `find_orchestrator_plugin_path()` searches for `orchestra/dist/index.js`: `desktop/src-tauri/src/lib.rs:112`

Tracked runtime artifacts (must be removed from git and ignored going forward):

- `.opencode/user.db`, `.opencode/user.db-shm`, `.opencode/user.db-wal`
- `.opencode/attachments/`
- `.opencode/vision/jobs.jsonl`
- `orchestra/coverage/lcov.info`

---

## After (definition of done for this task)

- The repo is a **true** workspace with a single install at root:
  - `bun install` at repo root installs everything.
  - One lockfile: `bun.lock` at repo root.
- The repo layout is explicit and minimal:

  ```txt
  apps/
    control-panel/          # (formerly app/)
    desktop/                # (formerly desktop/)
  packages/
    orchestrator/           # the publishable plugin
  examples/
    orchestra/              # example OpenCode project configs (sanitized)
  tasks/
  docs/
  ```

- No runtime artifacts are tracked in git:
  - `.opencode/user.db*`, `.opencode/attachments/`, `.opencode/vision/` are ignored and removed from git history *going forward*.
  - `examples/orchestra/coverage/` is ignored and not tracked.
- `bun run check` still exists and passes (now elegant, workspace-aware).

---

## Scope (files you will touch)

### Moves / renames (use `git mv` to preserve history)

- `src/` → `packages/orchestrator/src/`
- `bin/` → `packages/orchestrator/bin/`
- `schema/` → `packages/orchestrator/schema/`
- `test/` → `packages/orchestrator/test/`
- `prompts/` → `packages/orchestrator/prompts/`
- `docs/` → keep at root **or** split into:
  - `packages/orchestrator/docs/` (plugin docs)
  - `docs/` (workspace docs)
  Pick one and stick to it.
- `app/` → `apps/control-panel/`
- `desktop/` → `apps/desktop/`
- `orchestra/` → `examples/orchestra/` (but only keep config/examples, not `dist/`, `node_modules/`, `coverage/`)

### Configuration + scripts

- Root `package.json` (becomes workspace root, `private: true`)
- `packages/orchestrator/package.json` (becomes the publishable plugin package)
- `apps/control-panel/package.json` and `apps/desktop/package.json` (update paths)
- `.github/workflows/ci.yml` (paths, scripts)
- `.gitignore` (workspace-level ignores)
- Any hardcoded paths in `apps/desktop/src-tauri/src/lib.rs`

---

## Implementation checklist (do in this order)

### A) Create the workspace root

1. Create root `package.json` as a **private** workspace root:
   - `private: true`
   - `workspaces: ["apps/*", "packages/*"]`
   - scripts:
     - `lint`, `typecheck`, `test`, `build`, `check` (workspace-aware)

2. Move the current publishable plugin into `packages/orchestrator/` and keep it publishable:
   - `packages/orchestrator/package.json` gets:
     - the current name/version/exports/files/scripts
     - `@opencode-ai/sdk`, `@opencode-ai/plugin` deps

3. Ensure `packages/orchestrator` still builds:
   - keep `dist/` output inside `packages/orchestrator/dist/`
   - update exports accordingly

### B) Move apps under `apps/`

1. `app/` → `apps/control-panel/`
2. `desktop/` → `apps/desktop/`
3. Fix `workspace:*` dependencies so they resolve inside the workspace:
   - `apps/desktop` should depend on `apps/control-panel` via `workspace:*`

### C) Unify dependency management

1. Delete `apps/control-panel/package-lock.json` (and remove it from git).
2. Ensure `bun install` from the root produces a single `bun.lock` and installs dependencies for all workspaces.

### D) Fix `.opencode` and `examples/` hygiene

1. Add workspace `.gitignore` rules (root `.gitignore`) to ignore:
   - `.opencode/user.db*`
   - `.opencode/attachments/`
   - `.opencode/vision/`
   - `examples/**/node_modules/`
   - `examples/**/dist/`
   - `examples/**/coverage/`
2. Remove tracked runtime artifacts from git (do not keep them in the repo):
   - `git rm --cached .opencode/user.db .opencode/user.db-shm .opencode/user.db-wal`
   - `git rm --cached -r .opencode/attachments .opencode/vision`
   - `git rm --cached examples/orchestra/coverage/lcov.info` (or the moved equivalent)
3. Keep only *example configs* under `examples/orchestra/.opencode/`:
   - if those configs are meant as documentation, ensure they are compliant with OpenCode docs (Tasks 04–07 will clean semantics).

### E) Fix desktop plugin path resolution

Update `apps/desktop/src-tauri/src/lib.rs`:

- `find_orchestrator_plugin_path()` must search for the plugin dist in the new location:
  - `packages/orchestrator/dist/index.js`
  - (and optionally `packages/orchestrator/src/index.ts` for dev)
- Stop looking for `orchestra/dist/index.js` unless `examples/orchestra/` intentionally contains the plugin (it should not).

---

## Verification (must pass to complete Task 02)

From repo root:

1. `bun install`
2. `bun run check`

And smoke-run the desktop sidecar path resolution locally:

- `cd apps/desktop && bun run dev`
  - verify it can locate and load the plugin without `OPENCODE_DESKTOP_PLUGIN_PATH`.
