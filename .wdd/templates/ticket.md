---
id: TICKET-001-example-ticket
kind: ticket
epic: EPIC-example-feature
slug: example-ticket
title: Example Ticket
status: planned
task_count: 1
depends_on: []
conflict_domains:
  - path/or/domain/**
adapter_links:
  github_issue: null
---

# Example Ticket

## Summary

Describe the coherent slice of the epic this ticket groups.

## Objective

State the ticket-level outcome.

## Scope

- Included:
- Excluded:

## Non-Scope

- Work this ticket must not include.

## Shared Context References

- `../shared-context/index.md`
- `../shared-context/resources/example.md`

## Task Inventory

| Task | Status | Wave | Summary |
|------|--------|------|---------|
| TASK-001-example-task | todo | WAVE-001 | Example task summary |

## Dependencies

- Depends on:
- Blocks:

## Conflict Domains

- `path/or/domain/**`

## Validation Expectations

- Ticket is complete when all child tasks are done or explicitly cancelled.

## Review Focus

- Reviewers should inspect:

## Completion Criteria

- [ ] All child tasks have resolved review and verification gates.
- [ ] Shared context updates were reconciled.
- [ ] Ticket status matches child task state.
