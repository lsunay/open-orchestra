# Tools (Orchestrator + Workers)

This repo adds orchestration tools to OpenCode. The core goal is to **prompt models to use async tools correctly** (start tasks, await results) while keeping the tool surface area small enough that the orchestrator doesn’t “choose wrong”.

This file is the single, checkable inventory of every tool shipped by this repo, including:

- **Orchestrator plugin tools** (what OpenCode sees as “tools” when the plugin is loaded)
- **Worker bridge tools** (tools available *inside spawned server workers*)

It also documents the **prompt surfaces** that teach models how to use the tools.

## Terminology (don’t mix these up)

- **Tool**: A callable function exposed to a model (e.g. `task_start`).
- **Worker**: A specialized agent profile (vision/docs/coder/architect/explorer/memory).
- **Workflow**: A multi-step sequence that calls workers in order (e.g. RooCode boomerang).
- **Skill**: OpenCode’s “skill” system (filesystem-discovered `SKILL.md`) invoked via the built-in `skill` tool.

## Current trim direction (tool budget)

The orchestrator agent should behave like a minimal async coordinator. The intended default tool budget is **5 tools**:

- `task_start`
- `task_await`
- `task_peek`
- `task_list`
- `task_cancel`

Everything else exists for:

- backwards compatibility (legacy worker API)
- human-invoked UX/config
- internal workflows (memory)
- debugging/observability

## Tool sets and what’s actually registered

### 1) Orchestrator **core tools** (registered by the plugin)

The OpenCode plugin entrypoint (`packages/orchestrator/src/index.ts`) registers the **core tool set**:

- Source of truth: `packages/orchestrator/src/command/index.ts` → `createCoreOrchestratorTools()`
- Count: **32** tool IDs (registered into OpenCode when the plugin loads)

### 2) Orchestrator **plugin extras** (exported, but *not registered by default*)

There is a larger exported tool set used by UI flows/power users:

- Source of truth: `packages/orchestrator/src/command/index.ts` → `createPluginTools()` / `orchestratorTools`
- Count: **20** additional tool IDs (exist in code, but the plugin does not register them today)

If we want these callable by models, we must register them from the plugin entrypoint.

### 3) Worker bridge tools (registered inside server workers)

Spawned server workers load a small “bridge plugin” so they can talk back to the orchestrator runtime:

- Source of truth: `packages/orchestrator/bin/worker-bridge-plugin.mjs`
- Count: **1** tool (`stream_chunk`)

## Prompt surfaces (how models learn to use tools)

These are the places where we *prompt* models about tool usage and async correctness:

- Orchestrator agent system prompt: `packages/orchestrator/prompts/orchestrator.md`
  - Defines the **ASYNC CONTRACT** and the **VISION PROTOCOL**.
- Passthrough system prompt: `packages/orchestrator/src/core/passthrough.ts`
  - Forces the orchestrator to relay messages via `task_start` → `task_await`.
- Worker bootstrap prompt: `packages/orchestrator/src/workers/prompt/worker-prompt.ts`
  - Tells workers to use `stream_chunk` for progress (and still return a final plain-text answer).
- Worker message wrappers: `packages/orchestrator/src/workers/send.ts`
  - Adds `<orchestrator-job>` or `<orchestrator-sync>` blocks to worker prompts.
- Workflow step prompts:
  - Vision: `packages/orchestrator/src/workflows/builtins/vision.ts`
  - Memory: `packages/orchestrator/src/workflows/builtins/memory.ts`
  - Boomerang: `packages/orchestrator/src/workflows/roocode-boomerang.ts`
- Vision placeholder/wakeup injection: `packages/orchestrator/src/workflows/triggers.ts`
  - Injects `[VISION ANALYSIS PENDING]` (must `task_await`) and `[VISION ANALYSIS READY]` (analysis included).

## Inventory: every tool shipped by this repo

## Implementation map (tool → source file)

Orchestrator tool definitions live here (source of truth):

- Task API: `packages/orchestrator/src/command/tasks.ts`
  - `task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`
- Workers: `packages/orchestrator/src/command/workers.ts`
  - `spawn_worker`, `ask_worker`, `ask_worker_async`, `await_worker_job`, `get_worker_job`, `list_worker_jobs`, `delegate_task`, `stop_worker`
  - `list_workers`, `get_worker_info`, `ensure_workers`, `find_worker`, `worker_trace`, `open_worker_session`
- Profiles/models/config: `packages/orchestrator/src/command/profiles.ts`
  - `list_profiles`, `list_models`, `orchestrator_status`
  - `set_profile_model`, `reset_profile_models`, `set_autospawn`, `set_orchestrator_agent`, `autofill_profile_models`
- Workflows: `packages/orchestrator/src/command/workflows.ts`
  - `list_workflows`, `run_workflow`, `continue_workflow`
- Skills: `packages/orchestrator/src/command/skills.ts`
  - `list_skills`, `validate_skills`
- Memory (direct CRUD): `packages/orchestrator/src/command/memory.ts`
  - `memory_put`, `memory_link`, `memory_search`, `memory_recent`
- Memory (workflow-internal): `packages/orchestrator/src/memory/tools.ts`
  - `orchestrator_memory_put`, `orchestrator_memory_link`, `orchestrator_memory_done`
- UX + observability: `packages/orchestrator/src/command/ux.ts`
  - `set_passthrough`, `clear_passthrough`, `enable_docs_passthrough`
  - `orchestrator_output`, `orchestrator_results`, `orchestrator_device_registry`
  - `orchestrator_start`, `orchestrator_demo`, `orchestrator_dashboard`, `orchestrator_help`, `orchestrator_todo`, `orchestrator_keybinds_macos`
- Diagnostics: `packages/orchestrator/src/command/diagnostics.ts`
  - `orchestrator_diagnostics`

Worker bridge tool definitions live here:

- Worker bridge: `packages/orchestrator/bin/worker-bridge-plugin.mjs`
  - `stream_chunk`

### Orchestrator core tools (32) — registered into OpenCode

These tools are returned by the plugin in `packages/orchestrator/src/index.ts`.

#### Task API (recommended; orchestrator default allowlist)

##### `task_start`

- **Description**: Start a background task (worker or workflow). Always returns a taskId; use task_await to get the result.
- **Why**: One canonical entrypoint for all async work (workers + workflows) so models don’t need to choose between multiple “start” tools.
- **How it works**: Creates a `WorkerJob` in `packages/orchestrator/src/core/jobs.ts`, then dispatches to:
  - a worker via `sendToWorker` (and records `responseText`/`error`), or
  - a workflow via `runWorkflowWithContext` / `continueWorkflowWithContext` (and records a report with run/step metadata).
- **Key args**: `kind` (`auto|worker|workflow`), `task`, optional `workerId`, optional `workflowId`, optional `continueRunId`, `attachments`, `timeoutMs`, `autoSpawn`.
- **Returns**: JSON string: `{ taskId, kind, workerId|workflowId, status:"running", next:"task_await" }`.
- **Prompting**:
  - Orchestrator prompt mandates “start tasks, then await results” (`packages/orchestrator/prompts/orchestrator.md`).
  - Passthrough mode forces `task_start` → `task_await` (`packages/orchestrator/src/core/passthrough.ts`).
- **Used by**: Orchestrator agent + command shortcuts (`packages/orchestrator/src/index.ts` command templates).
- **Trim note**: Keep.

##### `task_await`

- **Description**: Wait for one (or many) task(s) to finish and return the final job record(s).
- **Why**: Makes “awaiting” explicit and consistent; prevents the common error of answering before async work finishes.
- **How it works**: Blocks on `workerJobs.await()` in `packages/orchestrator/src/core/jobs.ts` until the job is terminal.
- **Key args**: `taskId` or `taskIds[]`, optional `timeoutMs`.
- **Returns**: JSON string of the final `WorkerJob` record(s) (includes `responseText` or `error`).
- **Prompting**:
  - Vision placeholders explicitly instruct `task_await({ taskId })` (`packages/orchestrator/src/workflows/triggers.ts`).
- **Trim note**: Keep.

##### `task_peek`

- **Description**: Get the current status/result of one (or many) task(s) without waiting.
- **Why**: Non-blocking inspection when the model/user needs to check progress without stalling.
- **How it works**: Reads `workerJobs.get()` from `packages/orchestrator/src/core/jobs.ts`.
- **Key args**: `taskId` or `taskIds[]`.
- **Returns**: JSON string of current job record(s), or `{ id, status:"unknown" }` if missing.
- **Trim note**: Keep.

##### `task_list`

- **Description**: List tasks (default) or other orchestrator resources via view=workers|profiles|models|workflows|status|output.
- **Why**: Replace a wide set of “list_*” and “status/output” tools with one browsing surface; makes trimming possible.
- **How it works**:
  - `view:"tasks"` reads the in-memory job registry.
  - `view:"workers"` reads `workerPool.toJSON()`.
  - `view:"profiles"` lists configured profiles.
  - `view:"models"` reads the OpenCode providers/models catalog (requires OpenCode client).
  - `view:"workflows"` lists registered workflows.
  - `view:"status"` combines workers + recent tasks.
  - `view:"output"` combines recent tasks + orchestrator log buffer.
- **Key args**: `view`, optional `limit`, optional `format`, plus view-specific filters (`query`, `providers`, `after`, ...).
- **Returns**: Markdown tables by default, or JSON when `format:"json"`.
- **Prompting**: Used by injected command shortcuts (`packages/orchestrator/src/index.ts`) instead of many separate tools.
- **Trim note**: Keep; prefer this over legacy list/status tools.

##### `task_cancel`

- **Description**: Cancel a running task (best-effort; may not stop underlying worker execution).
- **Why**: Gives the orchestrator a safe “stop waiting” escape hatch without needing to kill workers.
- **How it works**: Marks a `WorkerJob` as `canceled` in `packages/orchestrator/src/core/jobs.ts` (does not preempt a running worker process).
- **Key args**: `taskId` or `taskIds[]`, optional `reason`.
- **Returns**: Plain text confirmation.
- **Trim note**: Keep.

#### Legacy worker API (backwards compatibility)

These tools predate the Task API. They remain registered to avoid breaking older prompts/docs, but are not the preferred model-facing interface.

##### `spawn_worker`

- **Description**: Spawn a new worker with a specific profile. Built-in profiles: vision, docs, coder, architect, explorer. You can also provide custom configuration to override defaults.
- **Why**: Manual pre-warming and explicit worker lifecycle control.
- **How it works**: Resolves a profile and calls `spawnWorker` (`packages/orchestrator/src/workers/spawner.ts`).
- **Trim note**: Keep (manual), but not required for typical `task_start(autoSpawn=true)` flows.

##### `ask_worker`

- **Description**: Send a message to a specialized worker and get a response. Use this to delegate tasks to workers with specific capabilities…
- **Why**: Original synchronous worker API.
- **How it works**: Calls `sendToWorker` and waits for completion (`packages/orchestrator/src/workers/spawner.ts`).
- **Trim note**: Legacy; prefer `task_start(kind:"worker")` + `task_await`.

##### `ask_worker_async`

- **Description**: LEGACY: Start a worker task asynchronously. Prefer task_start + task_await / task_peek for a simpler async API.
- **Why**: Original async worker API (job registry) before Task API existed.
- **How it works**: Creates a job, dispatches `sendToWorker` in the background, records job result/error.
- **Trim note**: Legacy; prefer Task API.

##### `await_worker_job`

- **Description**: LEGACY: Wait for an async worker job to finish and return its final record. Prefer task_await.
- **Why**: Original await primitive for `ask_worker_async`.
- **Trim note**: Legacy; prefer Task API.

##### `get_worker_job`

- **Description**: LEGACY: Get the status/result of a worker job started with ask_worker_async. Prefer task_peek.
- **Why**: Original peek primitive for `ask_worker_async`.
- **Trim note**: Legacy; prefer Task API.

##### `list_worker_jobs`

- **Description**: List recent worker jobs (async + sync results).
- **Why**: Legacy job browsing UI.
- **Trim note**: Redundant with `task_list(view:"tasks")`.

##### `delegate_task`

- **Description**: Auto-route a task to the best worker (optionally auto-spawn), run it, and return the response.
- **Why**: Original “routing” API.
- **Trim note**: Largely replaced by `task_start(kind:"auto")`.

##### `stop_worker`

- **Description**: Stop and unregister a worker
- **Why**: Explicit worker lifecycle control and cleanup.
- **How it works**: Calls `stopWorker` (`packages/orchestrator/src/workers/spawner.ts`).
- **Trim note**: Keep (this is not the same as canceling a task).

#### Discovery + routing helpers

##### `list_profiles`

- **Description**: List all available worker profiles that can be spawned (built-in + any custom profiles loaded from orchestrator.json)
- **Trim note**: Redundant with `task_list(view:"profiles")`.

##### `list_workers`

- **Description**: List all available workers in the orchestrator registry, or get detailed info for a specific worker
- **Trim note**: Redundant with `task_list(view:"workers")`.

##### `list_models`

- **Description**: List models available in your current OpenCode configuration (via the SDK). Use this to pick valid provider/model IDs for profiles.
- **Trim note**: Redundant with `task_list(view:"models")`.

#### Workflows (legacy surface; Task API can run workflows)

##### `list_workflows`

- **Description**: List available orchestrator workflows (discovery + summary).
- **Trim note**: Redundant with `task_list(view:"workflows")`.

##### `run_workflow`

- **Description**: Run a named orchestrator workflow (e.g., roocode-boomerang) with security limits.
- **Trim note**: Redundant with `task_start(kind:"workflow")` + `task_await`, but kept for compatibility.

##### `continue_workflow`

- **Description**: Continue a paused workflow run by runId.
- **Trim note**: Redundant with `task_start(kind:"workflow", continueRunId: ...)` + `task_await`, but kept for compatibility.

#### Skills discovery/validation (OpenCode skills)

##### `list_skills`

- **Description**: List discoverable OpenCode skills (filesystem discovery + basic validation).
- **Why**: Debug/inspect what skills exist and whether `skill` is enabled/denied under current policy.
- **Trim note**: Keep (useful for setup/debug; not a hot-path orchestrator tool).

##### `validate_skills`

- **Description**: Validate required skills exist and are not denied by permission settings.
- **Why**: Preflight checks for workflows/profiles that declare `requiredSkills`.
- **Trim note**: Keep (prevents mid-run surprises).

#### Memory workflow tools (internal; used by the memory workflow)

These are intended for the memory worker’s workflow prompt (not general use).

##### `orchestrator_memory_put`

- **Description**: Store a durable memory entry for the memory workflow (Neo4j required).
- **Used by prompt**: `packages/orchestrator/src/workflows/builtins/memory.ts`
- **Trim note**: Keep (workflow-internal).

##### `orchestrator_memory_link`

- **Description**: Link two memory entries for the memory workflow (Neo4j required).
- **Used by prompt**: `packages/orchestrator/src/workflows/builtins/memory.ts`
- **Trim note**: Keep (workflow-internal).

##### `orchestrator_memory_done`

- **Description**: Acknowledge completion of a memory workflow task.
- **Used by prompt**: `packages/orchestrator/src/workflows/builtins/memory.ts`
- **Trim note**: Keep (workflow-internal).

#### Observability (debug + UX)

##### `orchestrator_output`

- **Description**: Unified view of orchestrator activity: recent jobs and internal logs (including vision router logs).
- **Trim note**: Redundant with `task_list(view:"output")`.

##### `orchestrator_results`

- **Description**: Show the most recent final output/report for each running worker (what they did and any issues).
- **Trim note**: Keep (high signal debugging; not fully covered by Task API yet).

##### `orchestrator_device_registry`

- **Description**: List all orchestrator-tracked OpenCode worker sessions across this device (file-backed registry).
- **Trim note**: Keep (debug + recovery).

##### `orchestrator_diagnostics`

- **Description**: Show process/session counts and memory usage for orchestrator + workers (detects recursive spawns, MCP duplication, and runaway resource usage).
- **Trim note**: Keep (debug).

##### `orchestrator_status`

- **Description**: Show the effective orchestrator configuration (merged global + project) and worker→model mapping
- **Trim note**: Candidate for deprecation once `task_list(view:"status")` covers everything users need.

#### Passthrough controls (session-scoped)

##### `set_passthrough`

- **Description**: Enable passthrough mode for the current session: relay user messages to a target worker until disabled.
- **Prompting**: Injects a system prompt (`packages/orchestrator/src/core/passthrough.ts`) that forces `task_start` → `task_await`.
- **Trim note**: Keep (powerful UX mode).

##### `clear_passthrough`

- **Description**: Disable passthrough mode for the current session (if enabled).
- **Trim note**: Keep.

##### `enable_docs_passthrough`

- **Description**: Enable 'docs passthrough' mode: the orchestrator relays future user messages to the docs worker until you say 'exit passthrough' (or 'exit docs mode').
- **Trim note**: Keep (convenience wrapper around `set_passthrough` with default `workerId:"docs"`).

### Orchestrator plugin extras (20) — exported, not registered by default

These tool definitions exist in `packages/orchestrator/src/command/index.ts` under `createPluginTools()`. They are useful for interactive UX, but the plugin does not currently register them.

If we decide to expose them to models, register them from `packages/orchestrator/src/index.ts`.

#### UX helpers

- `orchestrator_start`: Start the orchestrator UX: ensure docs worker is running and responsive, seed it with local plugin docs, and enable docs passthrough.
- `orchestrator_demo`: Run the first-run demo: show quickstart docs, optionally spawn docs worker, and optionally show trace.
- `orchestrator_dashboard`: Show a compact dashboard of running workers: models, ports, status, activity, and warnings.
- `orchestrator_help`: Show help for using the orchestrator plugin (workers, profiles, delegation)
- `orchestrator_todo`: Orchestrator-flavored view of the current session todo list (adds labels + visuals). This is a read-only wrapper around the native todo system.
- `orchestrator_keybinds_macos`: Fix macOS keybind conflicts… (writes to `~/.config/opencode/opencode.json`).
- `worker_trace`: Show recent activity from a worker by reading its session messages (includes tool calls and step boundaries).
- `open_worker_session`: Open the sessions list so you can switch into a worker session (agent/subagent). Adds a prompt hint for the next best command.

#### Config tools (manual by design)

- `set_profile_model`: Persistently set which model a worker profile uses (writes to orchestrator.json). This is the main way to map workers→models.
- `reset_profile_models`: Reset saved profile→model overrides so workers go back to default `node:*` selection (writes to orchestrator.json).
- `set_autospawn`: Configure which workers auto-spawn on startup (writes to orchestrator.json)
- `set_orchestrator_agent`: Configure the injected orchestrator agent (name/model/mode) in orchestrator.json
- `autofill_profile_models`: Pin worker profile models to concrete provider/model IDs based on your OpenCode config (useful for deterministic setups).

#### Memory tools (direct user CRUD; distinct from memory workflow tools)

- `memory_put`: Upsert a memory entry into Neo4j…
- `memory_link`: Create a relationship between two memory entries (by key).
- `memory_search`: Search memory entries (full-text-ish) in Neo4j.
- `memory_recent`: List recent memory entries.

#### Extra worker helpers

- `ensure_workers`: Ensure a set of workers are running (spawns any missing ones)
- `find_worker`: Find the most suitable worker for a given task based on capabilities
- `get_worker_info`: Get detailed information about a specific worker…

### Worker bridge tools (server workers)

These tools exist only inside spawned server worker processes (not the orchestrator agent).

#### `stream_chunk`

- **Description**: Stream a chunk of output in real-time to the orchestrator…
- **Why**: Enables partial progress updates without requiring the worker to finish its full response first.
- **How it works**: The worker calls `stream_chunk`, which POSTs to the orchestrator bridge (`/v1/stream/chunk`) via `packages/orchestrator/bin/worker-bridge-plugin.mjs`.
- **Prompting**:
  - Workers are instructed to use it in `packages/orchestrator/src/workers/prompt/worker-prompt.ts`.
  - The orchestrator still expects a final plain-text answer (streaming is additive).

## Trim checklist (what we can remove next)

If the goal is “5 tools for the orchestrator agent”, that’s already the default allowlist. If the goal is “5 tools total registered by the plugin”, these are the main candidates to deprecate and then remove (after a compatibility window):

- Legacy job API: `ask_worker_async`, `await_worker_job`, `get_worker_job`, `list_worker_jobs`
- Legacy routing: `delegate_task`, `find_worker`
- Redundant list/status tools now covered by `task_list`: `list_workers`, `list_profiles`, `list_models`, `list_workflows`, `orchestrator_output`, `orchestrator_status`
- Potentially redundant workflow tools: `run_workflow`, `continue_workflow` (now covered by `task_start(kind:"workflow")` with `continueRunId`)

The “hard to remove” tools are the ones that change system state or provide essential recovery:

- `stop_worker`, `orchestrator_device_registry`, `orchestrator_diagnostics`
- passthrough controls (`set_passthrough`, `clear_passthrough`, `enable_docs_passthrough`)
- memory workflow tools (`orchestrator_memory_*`)
