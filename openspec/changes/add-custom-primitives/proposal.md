# Change: Add support for custom MCP primitives (tools, resources, prompts)

## Why

Users want to combine OpenAPI-generated tools with custom tools, resources, and prompts in a single OpenAPIServer instance. This enables:
- Exposing templated workflows as prompts that compose multiple API calls
- Providing custom utility tools alongside API endpoints (e.g., data transformation, validation)
- Serving dynamic resources that complement API data (e.g., documentation, schemas)

Currently, OpenAPIServer only supports tools generated from OpenAPI specs, requiring users to run separate MCP servers for custom functionality.

## What Changes

This change adds three complementary extension mechanisms to OpenAPIServer:

1. **Custom Tools**: Register additional tools beyond those generated from OpenAPI specs
   - Programmatic API: `server.registerTool(name, definition, handler)`
   - Configuration API: `extraTools` in config
   - Full MCP Tool interface support with schemas and handlers

2. **Custom Resources**: Expose additional resources through the MCP resources protocol
   - Programmatic API: `server.registerResource(uri, definition, handler)`
   - Configuration API: `extraResources` in config
   - Support for text and blob resource types

3. **Custom Prompts**: Define templated workflows as MCP prompts
   - Programmatic API: `server.registerPrompt(name, definition, handler)`
   - Configuration API: `extraPrompts` in config
   - Support for prompt arguments and message generation

**BREAKING**: None - this is a purely additive change

## Impact

### Affected Specs
- Creates new capability: `custom-primitives`

### Affected Code
- `src/server.ts` - Add registration methods and handlers
- `src/config.ts` - Add config options for extra primitives
- New file: `src/types/custom-primitives.ts` - Type definitions
- Tests: Add comprehensive test coverage for all three primitive types

### Dependencies
- Requires MCP SDK schemas: `ListResourcesRequestSchema`, `ReadResourceRequestSchema`, `ListPromptsRequestSchema`, `GetPromptRequestSchema`
- All schemas are already available in current SDK version

### Migration
No migration needed - existing code continues to work unchanged.
