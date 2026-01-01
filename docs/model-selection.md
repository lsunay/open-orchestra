# Model Selection Baseline

This document records the current model selection behavior so later changes can be compared against a known baseline.

## Current flow

### Config and provider sources

- OpenCode config (`model`, `small_model`, provider models/options) is fetched via `client.config.get` and `client.config.providers`.
- Provider catalog is collected from `client.provider.list` plus config providers in `packages/orchestrator/src/models/catalog.ts`.
- `task_list({ view: "models" })` uses `filterProviders(..., "configured")` to present usable providers (includes API catalog providers with keys).

### Spawn-time selection (server backend)

- `hydrateProfileModelsFromOpencode` resolves tag-based profile models (`node:*`, `auto:*`) at spawn time in `packages/orchestrator/src/models/hydrate.ts`.
- Auto-selection uses a catalog built from `providersUsable`, which excludes `source === "api"` providers (except `opencode`).
- Resolved profile models are injected into the server worker process config in `packages/orchestrator/src/workers/backends/server.ts`.

### Prompt-time selection (agent and server backends)

- `packages/orchestrator/src/workers/send.ts` calls `session.prompt` without setting `body.model`.
- Agent/subagent workers do not apply `profile.model` at spawn time, so they inherit the parent session model.
- Server workers default to the model chosen at spawn time, with no per-message override.

## Known gaps (baseline)

- Built-in vision profile uses a concrete model string while docs describe tag-based defaults.
- API catalog providers with credentials are excluded from tag auto-selection.
- `small_model` is not used for fast workloads.
- Worker reuse ignores model identity.
- Model selection reasons are not consistently surfaced.

## Baseline expectations checklist

- [ ] Tag resolution happens at spawn time for server workers (not prompt time).
- [ ] `node:*` auto-selection only considers configured providers (`config`, `custom`, `env`, plus `opencode`), not `api` providers.
- [ ] Explicit `provider/model` references resolve against all providers, including `api`.
- [ ] `node:vision` throws if no vision-capable model is available.
- [ ] `task_list({ view: "models" })` includes API catalog providers with keys via `filterProviders`.
- [ ] Prompts do not set `body.model`, so agent backend inherits the parent model and server backend uses its spawn model.
- [ ] Worker reuse is keyed by `workerId` only, not model or policy.
