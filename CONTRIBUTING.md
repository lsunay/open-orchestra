# Contributing

Thanks for contributing to Open Orchestra. This repo favors a shallow, predictable layout so new contributors can find things quickly.

## Project Structure

```
bin/               Executable artifacts used at runtime
src/               Plugin logic and runtime modules
  command/         Tool/command interface for OpenCode
  config/          Orchestrator config loading + defaults
  core/            Runtime services (pool, telemetry, runtime)
  memory/          Memory graph + persistence
  models/          Model resolution and catalog helpers
  types/           Shared TypeScript types
  ux/              UI hooks and message transforms
  vision/          Vision analysis helpers
  workers/         Worker lifecycle + prompts
  workflows/       Workflow engine + builtins
schema/            JSON schema for orchestrator config
/docs/             Architecture and usage docs
/test/             Tests (unit + integration)
```

## Development

```bash
bun install
bun run typecheck
bun run build
bun test
```

## Conventions

- Keep common paths at two levels deep (e.g., `src/command/workers.ts`).
- Prefer names that describe what a module is (e.g., `workers.ts`, `workflows.ts`).
- Keep command/tool surface area in `src/command/` and runtime executables in `bin/`.
- Update tests and docs when moving files.

## Pull Requests

- Target `main`.
- Include context on structural changes (what moved + why).
- Ensure `bun test`, `bun run typecheck`, and `bun run build` pass.
