# Change: Add support for custom MCP primitives (tools, resources, prompts)

## Status Update (Post PR #69)

✅ **Prompts & Resources**: Already implemented in PR #69 via `PromptsManager` and `ResourcesManager`
❌ **Custom Tools**: Not yet implemented - **this is the primary focus**
❌ **Programmatic APIs**: Managers exist but not exposed publicly

## Why

Users want to combine OpenAPI-generated tools with custom tools, resources, and prompts in a single OpenAPIServer instance. This enables:
- **Providing custom utility tools** alongside API endpoints (e.g., data transformation, validation) ← **Primary goal**
- **Exposing templated workflows** as prompts that compose multiple API calls ← Already possible via config
- **Serving dynamic resources** that complement API data (e.g., documentation, schemas) ← Already possible via config

Currently:
- ✅ Prompts and Resources can be loaded from config files (`--prompts`, `--resources` flags)
- ❌ Custom tools cannot be added (only OpenAPI-generated tools supported)
- ❌ No programmatic APIs to register prompts/resources/tools after server initialization

## What Changes

This change completes custom primitive support by:

1. **Custom Tools** (NEW):
   - Programmatic API: `server.registerTool(name, definition, handler)`
   - Configuration API: `extraTools` in config
   - Full MCP Tool interface support with schemas and handlers
   - Seamless integration with OpenAPI-generated tools

2. **Programmatic Prompt API** (expose existing PromptsManager):
   - Programmatic API: `server.registerPrompt(prompt)`
   - Delegates to existing `promptsManager.addPrompt()`
   - Config-based registration already works via `prompts` field

3. **Programmatic Resource API** (expose existing ResourcesManager):
   - Programmatic API: `server.registerResource(resource)`
   - Delegates to existing `resourcesManager.addResource()`
   - Config-based registration already works via `resources` field

**BREAKING**: None - this is a purely additive change

## Impact

### Affected Specs
- Creates new capability: `custom-primitives`

### Affected Code
- `src/server.ts` - Add `customTools` Map + `registerTool/Prompt/Resource()` methods
- `src/config.ts` - Add `extraTools` config field
- New file: `src/types/custom-primitives.ts` - `CustomToolDefinition` type
- `src/prompts-manager.ts` - No changes (reuse as-is ✅)
- `src/resources-manager.ts` - No changes (reuse as-is ✅)
- Tests: Add test coverage for custom tools + programmatic APIs

### Dependencies
- ✅ MCP SDK schemas already available (used by existing prompts/resources)
- ✅ PromptsManager and ResourcesManager already implemented (PR #69)

### Migration
No migration needed - existing code continues to work unchanged.

**What users can now do:**
```typescript
// NEW: Register custom tools
server.registerTool('add', {
  description: 'Add two numbers',
  inputSchema: { type: 'object', properties: { a: {}, b: {} } }
}, async ({ a, b }) => ({
  content: [{ type: 'text', text: String(a + b) }]
}))

// NEW: Programmatic prompt registration (config already worked)
server.registerPrompt({
  name: 'workflow',
  description: 'Multi-step workflow',
  template: 'Execute: {{steps}}'
})

// NEW: Programmatic resource registration (config already worked)
server.registerResource({
  uri: 'file://docs/api.md',
  name: 'API Documentation',
  contentProvider: async () => await fs.readFile('docs/api.md', 'utf-8')
})
```
