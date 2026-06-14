## Context

The existing filtering model narrows endpoint-based tools in `ToolsManager` for `toolsMode: "all"` and treats `includeTools` as the highest-precedence allow-list. Dynamic mode is different: it exposes meta-tools that inspect and invoke operations directly from the loaded OpenAPI document.

## Goals / Non-Goals

- Goal: provide a case-insensitive OpenAPI tag deny-list for the MCP tool surface.
- Goal: avoid surprising fail-open behavior when `excludeTags` is combined with `includeTools`, explicit mode, or dynamic mode.
- Goal: keep the feature small and consistent with existing filter patterns.
- Non-goal: implement authorization. Excluded endpoints must still be protected by the upstream API.

## Decisions

- Decision: `excludeTags` wins over `includeTools`. Explicitly including an excluded endpoint should not surface it.
- Decision: explicit mode still uses `includeTools` to define the candidate set, then applies `excludeTags` as a final deny filter.
- Decision: dynamic mode passes excluded tags into `ApiClient`, which filters endpoint listing/schema responses and rejects invocation of excluded operations.
- Alternative considered: reject `excludeTags` in dynamic and explicit modes. This is simpler but less useful because dynamic mode is where large specs benefit most from tag pruning.

## Risks / Trade-offs

- Risk: Users may confuse tag filtering with security authorization. Mitigation: document it as MCP tool-surface filtering only.
- Risk: Untagged dangerous endpoints cannot be excluded by tag. Mitigation: document that exclusion depends on correct OpenAPI tagging.
- Trade-off: Dynamic mode needs a small amount of operation-tag lookup in `ApiClient`, but that keeps behavior consistent across modes.

## Migration Plan

Existing configurations continue to behave the same unless `excludeTags` or `--exclude-tag` is set.
