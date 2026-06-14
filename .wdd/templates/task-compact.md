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

## Objective

State the exact task outcome.

## Scope

- Included:
- Excluded:

## Context To Read

- `../../shared-context/index.md`
- `path/or/domain`

## Likely Files

- `path/or/domain/**`

## Dependencies And Conflicts

- Dependencies: none.
- Conflict domains: `path/or/domain/**`

## TDD And Validation

- RED:
- GREEN:
- REFACTOR:
- Verify: `project-specific verification command`

## Done

- [ ] Objective is complete.
- [ ] Verification evidence is recorded.
- [ ] Required review is complete or explicitly not required.

## Evidence

- Not run yet.
