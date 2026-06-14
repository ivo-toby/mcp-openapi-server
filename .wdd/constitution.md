---
id: WDD-CONSTITUTION
kind: constitution
version: 1.0.0
status: active
ratified: 2026-06-14
last_amended: 2026-06-14
---

# Project Constitution

## Project Scope

- Owned areas: TypeScript MCP server source under `src/`, CLI and package entry
  points under `bin/` and `build.js`, tests under `test/`, examples, docs,
  OpenSpec artifacts, and WDD artifacts.
- Out-of-scope areas: external API behavior, user secrets, npm publishing
  credentials, unrelated active branches, and implementation of unapproved
  OpenSpec proposals.
- External systems treated as adapters: OpenAPI specifications and upstream
  REST APIs, MCP clients and transports, npm, GitHub, OpenSpec, and optional
  GitHub Projects sync.

## Setup Configuration

- Storage mode: local-markdown.
- Target branch: `main`.
- Epic branch convention: `codex/epic/[epic-slug]`.
- Task branch convention: `codex/task/[task-id]-[task-slug]`.
- Task PRs required: yes for repository-writing tasks when GitHub is available.
- Local patches allowed when PRs are unavailable: yes.
- WDD profile default: standard.
- Allowed profiles: micro, lite, standard, full.
- Review mode default: risk_based.
- Monitoring default: adaptive.
- Worktree policy: controller and workers MUST use isolated worktrees for
  repository-writing work. Project-local worktree directories MUST be ignored
  before use; global worktree directories outside the repository are allowed.
- OpenSpec policy: new capabilities, breaking changes, architecture shifts, and
  security or performance work MUST go through an approved OpenSpec change
  before implementation starts.

## Model Usage

Model keys are workflow aliases, not provider model names. They can be amended
when the user chooses specific models.

```json
{
  "models": {
    "epicDefinition": "codex-default",
    "planning": "codex-default",
    "implementationSimple": "codex-default",
    "implementationComplex": "codex-default",
    "review": "codex-default",
    "feedbackFix": "codex-default",
    "epicValidation": "codex-default",
    "prDescription": "codex-default"
  }
}
```

## WDD Profile Defaults

- Default profile: standard.
- Allowed profiles: micro, lite, standard, full.
- Default review mode: risk_based.
- Default monitoring mode: adaptive.
- Use `micro` for bounded ticket-sized work under `.wdd/work/`.
- Use `lite` when a small epic needs artifact discipline but little
  parallelism.
- Use `standard` for large feature work with multiple tasks or conflict
  domains.
- Use `full` for high-risk work involving broad architecture, releases,
  security, persistence, or many concurrent workers.

## Branching Policy

- The controller MUST create or verify the epic branch from the target branch
  before any worker starts.
- The controller MUST sync activation artifact changes to the epic branch before
  task branches or task worktrees are created.
- Task branches MUST branch from the epic branch.
- The controller MUST create or verify one isolated worktree per
  repository-writing task from the synced epic branch before dispatch.
- Workers MUST start in their assigned task worktree and MUST NOT switch
  branches in the controller checkout.
- Task PRs MUST target the epic branch.
- Task work MUST NOT merge directly to `main`.
- The controller MUST check branch freshness before merging or marking a task
  merge-ready.
- The final epic PR MUST target `main`.
- OpenSpec proposal branches and WDD epic branches MAY coexist, but the
  controller MUST check active OpenSpec changes for conflicts before planning a
  large feature.

## Review Policy

- P1 findings block merge.
- P2 findings block merge.
- P3 findings do not block merge.
- P3 findings SHOULD become follow-up tasks when they represent real product,
  maintainability, or test debt.
- Review comments go to PRs when available, otherwise to task files or local
  review notes under the relevant WDD artifact.
- Feedback fixes may use the original worker or a fresh worker, whichever is
  safer. Prefer the original worker for local context; prefer a fresh worker
  when the original approach is uncertain or the feedback is high risk.
- Reviewers MUST focus on bugs, behavioral regressions, missing tests, security
  concerns, API contract drift, and WDD contract violations before style issues.

## Verification Policy

- Tasks SHOULD follow RED/GREEN TDD unless explicitly test-inapplicable.
- Repository-native checks are:
  - `npm run build`
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run format:check`
  - `git diff --check`
- Fresh worktrees MUST run `npm run build` before `npm test` when CLI execution
  tests depend on generated `dist/cli.js`.
- Focused verification SHOULD use Vitest filters such as
  `npm test -- --run test/api-client.test.ts` when a full test run is not
  proportional to the change.
- OpenSpec changes MUST be validated with
  `openspec validate [change-id] --strict` before approval or implementation
  handoff.
- Baseline evidence on 2026-06-14 for initial WDD setup:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm test` passed after build: 17 test files and 399 tests.
  - `npm run lint` failed before WDD edits in
    `src/transport/StreamableHttpServerTransport.ts` and
    `src/utils/http-methods.ts` with 7 errors and 3 warnings.
  - `npm run format:check` failed before WDD edits in `src/content-loader.ts`,
    `src/prompt-types.ts`, `src/prompts-manager.ts`,
    `src/resource-types.ts`, and `src/resources-manager.ts`.
- If a task does not touch the known lint- or format-failing files, the worker
  MAY record the pre-existing failure instead of fixing unrelated code. If a
  task touches those files or is a lint/format hardening task, it MUST resolve
  the relevant failures.
- Dependency audit output is not a default merge gate, but dependency, release,
  or security work MUST triage `npm audit` findings.

## Agent Roles

- Controller: plans, activates waves, creates or verifies epic branches and
  task worktrees, dispatches workers, starts reviewers, routes feedback, merges
  or marks merge-ready, updates orchestration state, and reconciles waves.
- Worker: executes exactly one task file at a time and does not merge its own
  PR. The worker starts in the assigned task worktree and MUST NOT switch
  branches in the controller checkout.
- Reviewer: reviews one task PR or patch and classifies findings as P1, P2, or
  P3.
- Feedback-fix worker: addresses routed feedback without broadening scope.
- Epic validator: validates the completed epic branch after all waves.
- Human reviewer: reviews the final epic PR into the target branch.

## Planning Rules

- Epics MUST have concrete deliverables and a testable definition of done before
  planning.
- New capabilities, breaking changes, architecture shifts, and security or
  performance work MUST start by reading `openspec/AGENTS.md`,
  `openspec/project.md`, active OpenSpec changes, and relevant specs.
- This repository currently has OpenSpec change directories but no populated
  `openspec/specs/` tree; planners MUST inspect active changes for conflicts
  before creating a new proposal.
- Tickets group related tasks.
- Tasks are independently executable worker units.
- Waves schedule tasks, not tickets.
- `orchestration.json` MUST include `schemaVersion: 1`.
- Plans SHOULD keep API contract, CLI behavior, transport behavior, OpenAPI
  parsing, authentication, generated tool naming, and test fixture changes in
  distinct conflict domains when practical.

## Task Rules

- Task files are the implementation briefs.
- Task files move through `todo/`, `in-progress/`, `review/`, `done/`,
  `blocked/`, and `cancelled/`.
- Workers MUST inspect named files, relevant tests, active OpenSpec changes, and
  shared context before broad discovery.
- Workers MUST stay within scope and MUST NOT start dependent tasks.
- Workers MUST preserve user changes and unrelated dirty work.
- Workers MUST not run ad hoc `node -e` test scripts for this repository; they
  should write TypeScript tests or use the Vitest runner.
- Workers write durable shared-context memory when discoveries matter to later
  work, and follow the repository Postgram rules for session and durable
  development memory.

## Wave Rules

- A wave is activated as a batch of concurrently eligible tasks.
- A task is eligible only when dependencies are resolved, conflict-domain
  blockers are clear, prerequisites are fresh, and status is not blocked.
- The controller MUST NOT start the next wave before reconciliation.
- Prefer safe parallelism over maximum parallelism when conflict risk is
  unclear.
- Tasks that touch shared contracts such as config, CLI flags, tool IDs,
  filtering semantics, auth, transport, or generated MCP schemas SHOULD be
  separated unless the plan explicitly coordinates their merge order.

## Shared Context Rules

- `shared-context/index.md` is an index, not a dump.
- Resource files SHOULD be focused and scannable.
- Workers MAY propose shared-context updates in task branches.
- The controller reconciles shared-context changes into the epic branch.
- WDD artifacts are the durable local source of truth. External trackers are
  adapters and MUST NOT replace the local Markdown state.
- Postgram memory MAY be used for resumability and stable development facts
  according to the repository instructions, but code and WDD source of truth
  remain in the repository.

## Governance

- Amend this constitution before changing the workflow contract.
- Version changes use semantic versioning:
  - MAJOR: role, artifact, or gate changes that break existing epics.
  - MINOR: new required sections, checks, or gates.
  - PATCH: clarifications that do not change behavior.
- Constitution amendments MUST update `last_amended`.
- Initial setup open questions:
  - Confirm whether `codex-default` should be replaced with specific model
    aliases per WDD role.
  - Confirm whether GitHub Projects should be enabled as an adapter in addition
    to local Markdown for the upcoming large feature.
