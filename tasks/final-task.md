# Final Task — Production readiness review: coherence, minimalism, observability, and a shrinking codebase

This is the “make it real” step. It is only complete when the system fits together as one coherent product and can be explained to a new developer in <10 minutes.

---

## Standards (what “production ready” means here)

### A) Coherent architecture

- There is a single, explicit diagram in `docs/architecture.md` that matches reality.
- “Workers”, “agents”, “skills”, “profiles”, “workflows”, “memory” each have:
  - one owner
  - one config file format
  - one runtime representation

### B) Minimalism with a line-count budget

The target is **8k LOC** (aspirational but enforced as a direction):

- Define a LOC budget per workspace package/app.
- Add a CI check that prints LOC deltas per PR (does not fail initially, but becomes a gate once the system stabilizes).
- Delete unused code paths and duplicate layers aggressively.

### C) Observability

- The user can answer:
  - “What workers exist?”
  - “What are they doing?”
  - “What workflows ran?”
  - “What memory was written?”
  - “What failed?”
  …without reading logs or code.

### D) Stability

- PR gate is green:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
  - `bun run build`
- Nightly gate is green:
  - `bun run test:e2e`

---

## Final verification checklist (must all pass)

### 1) Full check

From repo root:

- `bun install`
- `bun run check`

### 2) Full E2E (nightly parity)

- `bun run test:e2e`

### 3) Manual “user story” walkthrough

Start from a clean machine state (or fresh XDG dirs) and validate:

1. Install dependencies and start:
   - `bun run dev`
2. In the TUI:
   - confirm orchestrator agent exists
   - run `orchestrator.help` (or equivalent)
   - spawn workers / run a workflow
3. In the control panel:
   - observe workers and workflow run
   - view memory writes
   - view prompts and config
   - send a chat message and see response
4. In desktop:
   - confirm it boots without manual env tweaks
   - confirm it shows logs and surface failures clearly

### 4) “Explain it in 10 minutes” doc

Update `README.md` with:

- What this repo is (one sentence)
- The mental model (workers, workflows, memory)
- The 3 commands:
  - `bun run dev` (developer)
  - `bun run build` (release build)
  - `opencode` + plugin install instructions (user)

### 5) Security + hygiene

- No secrets or runtime DBs committed.
- `.opencode/` is treated as runtime state and/or examples only.
- Permissions are documented and safe by default (`ask` where appropriate).

---

## Deliverable for the final task

Produce a short, production-oriented document:

- `docs/production.md`

It should contain:

- supported platforms
- required environment (Bun, OpenCode CLI)
- troubleshooting matrix
- release steps

