# Change: Add extra custom tools support

## Why

Library users want to expose a few hand-written MCP tools alongside OpenAPI-generated tools without running multiple servers or reaching into private internals. The current server supports custom prompts and resources through config, but it still lacks a clean extension point for custom tools.

## What Changes

- Add an `extraTools` configuration option for registering custom MCP tools alongside OpenAPI-generated tools
- Add a typed custom tool handler contract for config-based tool execution
- Merge extra tools into `tools/list` and dispatch them from `tools/call`
- Reject ID or name collisions between custom tools and OpenAPI-generated tools
- Document the config-based API with library usage examples

## Impact

- Affected specs: `extra-tools`
- Affected code: `src/config.ts`, `src/server.ts`, `src/tools-manager.ts`, new tool type definitions, tests, `README.md`
