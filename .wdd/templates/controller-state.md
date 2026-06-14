---
id: EPIC-example-feature-CONTROLLER
kind: controller_state
epic: EPIC-example-feature
active_wave: WAVE-001
status: in_progress
updated_at: YYYY-MM-DD
---

# Controller State: EPIC-example-feature

## Controller Rule

The controller manages waves, workers, reviewers, PRs or patches, feedback,
verification evidence, stale-branch checks, merges or merge-ready decisions,
shared-context reconciliation, and wave reconciliation. The controller does not
implement task code. Before any worker starts, the controller creates or
verifies the epic branch and syncs activation artifact changes to it. Before
dispatching repository-writing workers, the controller creates or verifies one
isolated worktree per task from that synced epic state and tells each worker its
assigned path. Workers must not switch branches in the controller checkout.

## Active Wave

Wave: WAVE-001

Activation: batch dispatch of concurrently eligible tasks.

## Active Wave Strategy

Profile: standard

Review mode: risk_based

Monitoring mode: adaptive

Execution mode: parallel

Strategy confirmation: required

## Monitoring

Mode: manual

Cadence: adaptive

Status: inactive

Last check: None

Next check due: None

Scheduler reference: None

Fallback prompt:

```text
Run subagent-pr-orchestration for EPIC-example-feature WAVE-001. Read orchestration.json and controller-state.md, verify the epic branch contains current activation artifact state before assigned worker worktrees branch from it, inspect every active worker and reviewer reference, update task gates, and stop when all active tasks are merged, blocked, cancelled, or ready for wdd-reconcile-wave.
```

Stop condition: all active-wave tasks are merged, blocked, cancelled, or ready
for `wdd-reconcile-wave`.

## Active Task Gates

| Task | Ticket | Branch | Worktree | PR/Patch | Gate | Worker | Reviewer |
|------|--------|--------|----------|----------|------|--------|----------|
| TASK-001-example-task | TICKET-001-example-ticket | task/TASK-001-example-task | None | None | not_started | None | None |

## Worker Worktrees

| Task | Worktree Path | Branch | Status | Required Action |
|------|---------------|--------|--------|-----------------|
| TASK-001-example-task | None | task/TASK-001-example-task | unassigned | Create or verify before dispatch |

## Gate Definitions

- not_started: task has not been dispatched.
- no_pr: implementation has not produced a PR or equivalent patch.
- needs_review: PR or patch exists and review is not complete.
- reviewing: review is active.
- needs_fixes: unresolved P1/P2 feedback exists.
- merge_ready: verification, branch freshness, and P1/P2 gates are clear.
- merged: task is merged into the epic branch or accepted according to policy.
- blocked: controller cannot progress without user or external input.
- cancelled: task was intentionally abandoned or replaced.

## Branch Freshness

| Task | Epic Branch | Task Branch | Freshness | Required Action |
|------|-------------|-------------|-----------|-----------------|
| TASK-001-example-task | epic/example-feature | task/TASK-001-example-task | unknown | Check before merge |

## Open P1/P2 Feedback

- None.

## Verification Status

| Task | Verification | Result | Evidence |
|------|--------------|--------|----------|
| TASK-001-example-task | project-specific verification command | not_run | None |

## Shared Context Reconciliation

- No pending shared-context updates.

## Event Log

- YYYY-MM-DD: WAVE-001 activated.

## Next Action

- Sync activation artifacts to the epic branch, create or verify isolated task
  worktrees from that state, then dispatch eligible tasks or resume active
  gates.
