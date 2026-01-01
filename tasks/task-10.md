# Task 10 — TUI-Friendly Model Selection Flow

## Goal

Make worker model selection usable from the OpenCode TUI without expanding the orchestrator tool surface beyond the Task API.

## Why this task exists

Users should not need to edit JSON by hand to change worker models. The orchestrator already injects command shortcuts and can show model catalogs; we need a “TUI-first” path to apply a chosen model to a worker.

## Before (current state)

- Orchestrator provides a models list command:
  - `packages/orchestrator/src/index.ts:409` (command injection: `${prefix}models`)
  - `packages/orchestrator/src/command/tasks.ts:574` (models view)
- There is no worker model set command or guided flow.
- OpenCode TUI supports opening its model dialog:
  - `packages/orchestrator/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:3184` (TuiOpenModelsData)

## After (expected state)

Minimum viable TUI flow (command-driven, no new tool IDs):

1. User runs `orchestrator.models` to see available `provider/model` IDs.
2. User runs a new command (implemented via Task API) to set a worker’s model, eg:
   - `orchestrator.worker-model docs openai/gpt-5`
   - which expands to `task_start({ kind: "op", op: "worker.model.set", ... })`
3. User runs `orchestrator.workers` to confirm the worker’s effective model + reason string.

## Implementation steps

1. Add a new injected command (string-template) in `packages/orchestrator/src/index.ts`:
   - Follow existing patterns near `packages/orchestrator/src/index.ts:395`
2. The command should call `task_start` with the op introduced in Task 08.
3. Ensure `task_list({ view: "workers" })` shows enough info to confirm the selection.
4. Update documentation:
   - Add a short “How to change worker model from TUI” section in `docs/configuration.md` (or a dedicated doc).

## Verification (must pass before proceeding)

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

Do not proceed until all commands pass and any task-introduced warnings/errors are eliminated.

## Git (must do before proceeding)

```bash
git add packages/orchestrator/src/index.ts docs/
git commit -m "feat(orchestrator): add TUI-friendly worker model selection commands"
git push origin main
```

## Completion record (fill in when done)

- Commit: `<sha>`
- After references (update with final line numbers):
  - `packages/orchestrator/src/index.ts:<line>`
  - `docs/configuration.md:<line>`
