## Context

Issue `#62` asks for a way to add custom tools to `OpenAPIServer`. There is already an active broad proposal for custom tools, resources, and prompts, but that scope is large and not needed to deliver the main user value right now.

## Goals / Non-Goals

- Goals:
  - Add a small, safe extension point for extra custom tools
  - Preserve current OpenAPI-generated tool behavior
  - Keep the first implementation config-driven
- Non-Goals:
  - Runtime `registerTool()` APIs
  - Extra custom resources or prompts
  - Converting OpenAPI output into a standalone SDK tool array API

## Decisions

- Decision: use `extraTools` on `OpenAPIMCPServerConfig` instead of a runtime registration API.
  - Why: it fits the existing config-driven server construction model and avoids lifecycle issues around registering tools after handlers are installed.
- Decision: store custom tool definitions separately from OpenAPI-generated tools and merge at the server layer.
  - Why: `ToolsManager` is currently centered on OpenAPI parsing and filtering; keeping custom dispatch in `OpenAPIServer` reduces churn.
- Decision: fail fast on duplicate tool IDs or names.
  - Why: silent shadowing would be hard to debug and unsafe for clients.

## Risks / Trade-offs

- Config-only support is less flexible than `registerTool()`.
  - Mitigation: keep the internal model clean so a runtime API can be added later if needed.
- Custom tool handlers need a clear return contract.
  - Mitigation: require MCP-style tool results and cover it with tests and docs.

## Migration Plan

1. Add typed definitions and config support.
2. Add server-level dispatch for extra tools.
3. Keep existing OpenAPI tool execution unchanged.
4. Document the narrow API and defer broader custom primitive work.

## Open Questions

- None for the first scoped pass.
