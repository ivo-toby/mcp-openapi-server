---
id: EPIC-example-feature-WAVES
kind: wave_plan
epic: EPIC-example-feature
status: planned
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
---

# Wave Plan: EPIC-example-feature

## Task Inventory

| Task | Ticket | Depends On | Conflict Domains | Status |
|------|--------|------------|------------------|--------|
| TASK-001-example-task | TICKET-001-example-ticket | None | path/or/domain/** | todo |

## Dependency Grid

| Task | Blocks | Blocked By |
|------|--------|------------|
| TASK-001-example-task | None | None |

## Conflict Grid

| Task Pair | Conflict Domains | Risk | Decision |
|-----------|------------------|------|----------|
| TASK-001 / TASK-002 | None | low | Can run together |

## Waves

### WAVE-001

Status: planned

Tasks:

- TASK-001-example-task

Recommended strategy:

- Profile: standard
- Execution mode: parallel
- Review mode: risk_based
- Monitoring mode: adaptive
- Confidence: medium
- Requires user confirmation: yes

Rationale:

- Tasks appear independently executable.
- Parallel execution may reduce wall-clock time.

Why this grouping is safe:

- Dependencies are satisfied.
- Conflict-domain blockers are clear.
- Prerequisites are fresh.
- No task is explicitly blocked.

Activation rule:

- Activate this wave as a batch of concurrently eligible tasks.
- Dispatch every eligible task in the wave; do not imply sequential execution.

Stop condition:

- All active tasks are done, blocked, cancelled, or explicitly closed.
- Wave reconciliation is complete before the next wave starts.

## Known Conflict Risks

- None.

## Manual Adjustments

- None.
