# Wave-Driven Development

`.wdd/` is the durable local source of truth for Wave-Driven Development in
this repository. External trackers, GitHub issues, GitHub Projects, and
OpenSpec proposals are adapters or inputs, not replacements for these files.

## Phase Order

1. Constitution: define setup, branching, model, review, verification, and
   governance rules.
2. Micro-wave or epic start: choose `.wdd/work/` for bounded ticket-sized work,
   or `.wdd/epics/` for larger feature work.
3. Planning: create tickets, executable task files, shared context, conflict
   domains, and waves.
4. Execution: dispatch workers in isolated worktrees and track state in text
   artifacts.
5. Reconciliation: review completed tasks, merge or record patches, route
   feedback, and prepare the next wave.
6. Validation: validate the completed epic branch when applicable.
7. Final handoff: prepare the final PR or local handoff.

WDD itself is text-only. It does not require a CLI, scripts, Node.js, npm, or
generated validators to create or maintain the workflow artifacts.

