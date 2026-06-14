---
id: TASK-001-example-task
kind: task
epic: EPIC-example-feature
ticket: TICKET-001-example-ticket
wave: WAVE-001
slug: example-task
title: Example Task
status: todo
depends_on: []
conflict_domains:
  - path/or/domain/**
assigned_model_class: simple-implementation
review_model_class: review
branch: task/TASK-001-example-task
worker_worktree: null
worktree_status: unassigned
pr: null
current_gate: not_started
branch_freshness: unknown
verification:
  - project-specific verification command
---

# TASK-001-example-task: Example Task

## Status

todo

## Parent Ticket

TICKET-001-example-ticket

## Wave

WAVE-001

## Objective

State the exact task outcome.

## Scope

- Included:
- Excluded:

## Non-Scope

- Work this task must not include.

## Relevant Context

### Local Context

Name files, directories, contracts, and tests the worker should inspect first.

### Shared Context References

- `../../shared-context/index.md`
- `../../shared-context/resources/example.md`

## Likely Files / Areas

- `path/or/domain/**`

## Dependencies

- None.

## Conflict Domains

- `path/or/domain/**`

## Assigned Model Class

simple-implementation

## Branch

task/TASK-001-example-task

## Worker Worktree

None assigned yet. The controller must create or verify an isolated worktree for
this task before dispatching a repository-writing worker, then provide that path
to the worker.

## PR / Patch Reference

None yet.

## RED-GREEN TDD Plan

### RED

State the first failing check or explain why TDD is inapplicable.

### GREEN

State the smallest expected implementation path.

### REFACTOR

State cleanup allowed after green.

## Implementation Notes

- Worker must inspect named files before broad discovery.
- Worker must start in the assigned worktree path provided by the controller.
- Worker must confirm this task file and current orchestration state exist in
  the assigned worktree before editing.
- Worker must not switch branches in the controller checkout.
- Worker must stay within this task scope.
- Worker must not start dependent tasks.

## Durable Memory Notes To Consider

- Record discoveries that affect later tasks in shared context.

## Task-Level Definition of Done

- [ ] Objective is complete.
- [ ] Verification evidence is recorded.
- [ ] No unresolved P1/P2 review findings remain.
- [ ] Shared-context updates, if any, are proposed for controller reconciliation.

## Validation Steps

- `project-specific verification command`

## Verification Evidence

- Not run yet.

## Review Feedback

### P1

- None.

### P2

- None.

### P3

- None.

## Completion Notes

- None yet.
