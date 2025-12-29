# Tasks (how to run this plan)

These tasks are designed to be executed **sequentially** (Task 01 → Task 10 → `final-task.md`), with stability preserved at every step.

## Attach this context every time

When executing a task with an LLM/agent, attach:

1. `refactory.md` (shared repo blueprint + rules + wiring)
2. exactly one `tasks/task-XX.md` (the step you are implementing)

The task files reference `refactory.md` for:

- repo standards and invariants
- current wiring and sources of truth
- path mapping (current → target monorepo layout)
- stability risks and what to protect with tests

## Definition of “done”

Every task completes only when:

- lint passes
- typecheck passes
- tests pass
- build passes

Task 01 creates a single gate command (`bun run check`) to enforce this uniformly.

