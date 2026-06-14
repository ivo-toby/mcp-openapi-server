---
id: WDD-CONSTITUTION
kind: constitution
version: 1.0.0
status: active
ratified: YYYY-MM-DD
last_amended: YYYY-MM-DD
---

# Project Constitution

## Project Scope

- Owned areas:
- Out-of-scope areas:
- External systems treated as adapters:

## Setup Configuration

- Storage mode: local-markdown
- Target branch: main
- Epic branch convention: epic/[epic-slug]
- Task branch convention: task/[task-id]-[task-slug]
- Task PRs required: yes
- Local patches allowed when PRs are unavailable: yes
- WDD profile default: standard
- Allowed profiles: micro, lite, standard, full
- Review mode default: risk_based
- Monitoring default: adaptive

## Model Usage

Record user-configured model aliases. Do not hardcode provider model names
unless the user chose them.

```json
{
  "models": {
    "planning": "configured-model-key",
    "implementationSimple": "configured-model-key",
    "implementationComplex": "configured-model-key",
    "review": "configured-model-key",
    "feedbackFix": "configured-model-key",
    "epicValidation": "configured-model-key",
    "prDescription": "configured-model-key"
  }
}
```

## WDD Profile Defaults

- Default profile: standard
- Allowed profiles: micro, lite, standard, full
- Default review mode: risk_based
- Default monitoring mode: adaptive
- Use `micro` for bounded ticket-sized work under `.wdd/work/`.
- Use `lite`, `standard`, or `full` for epics according to risk and ceremony
  needs.

## Branching Policy

- The controller creates or verifies the epic branch from the target branch
  before any worker starts.
- The controller syncs activation artifact changes to the epic branch before
  task branches or task worktrees are created.
- Task branches branch from the epic branch.
- The controller creates or verifies one isolated worktree per
  repository-writing task from the synced epic branch before dispatch.
- Workers start in their assigned task worktree and must not switch branches in
  the controller checkout.
- Task PRs target the epic branch.
- Task work must not merge directly to the target branch.
- The controller checks branch freshness before merging or marking merge-ready.
- The final epic PR targets the original target branch.

## Review Policy

- P1 findings block merge.
- P2 findings block merge by default.
- P3 findings do not block merge by default.
- Review comments are written to PRs when available, otherwise to task files or
  local review notes.
- Feedback fixes may use the original worker or a fresh worker, whichever is
  safer.

## Verification Policy

- Tasks follow RED/GREEN TDD unless explicitly test-inapplicable.
- Repository-native checks may be referenced when available.
- The WDD framework itself does not require a CLI, scripts, Node.js, npm, or
  generated validators.
- `git diff --check` is allowed as an optional whitespace sanity check.

## Agent Roles

- Controller: plans, activates waves, creates or verifies epic branches and
  task worktrees, dispatches workers, starts reviewers, routes feedback, merges
  or marks merge-ready, updates orchestration state, and reconciles waves.
- Worker: executes exactly one task file at a time and does not merge its own
  PR. The worker starts in the assigned task worktree and must not switch
  branches in the controller checkout.
- Reviewer: reviews one task PR or patch and classifies findings as P1, P2, or
  P3.
- Feedback-fix worker: addresses routed feedback without broadening scope.
- Epic validator: validates the completed epic branch after all waves.
- Human reviewer: reviews the final epic PR into the target branch.

## Planning Rules

- Epics must have concrete deliverables and a testable definition of done before
  planning.
- Tickets group related tasks.
- Tasks are independently executable worker units.
- Waves schedule tasks, not tickets.
- `orchestration.json` must include `schemaVersion: 1`.

## Task Rules

- Task files are the implementation briefs.
- Task files move through `todo/`, `in-progress/`, `review/`, `done/`,
  `blocked/`, and `cancelled/`.
- Workers inspect named files and shared context before broad discovery.
- Workers stay within scope and do not start dependent tasks.
- Workers write durable shared-context memory when discoveries matter to later
  work.

## Wave Rules

- A wave is activated as a batch of concurrently eligible tasks.
- A task is eligible only when dependencies are resolved, conflict-domain
  blockers are clear, prerequisites are fresh, and status is not blocked.
- Do not start the next wave before reconciliation.
- Prefer safe parallelism over maximum parallelism when conflict risk is unclear.

## Shared Context Rules

- `shared-context/index.md` is an index, not a dump.
- Resource files should be focused and scannable.
- Workers may propose shared-context updates in task branches.
- The controller reconciles shared-context changes into the epic branch.

## Governance

- Amend this constitution before changing the workflow contract.
- Version changes use semantic versioning:
  - MAJOR: role, artifact, or gate changes that break existing epics.
  - MINOR: new required sections, checks, or gates.
  - PATCH: clarifications that do not change behavior.
