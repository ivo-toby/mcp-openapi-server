# Design: Custom MCP Primitives

## Status Update (Post PR #69)

**⚠️ This design has been partially implemented:**
- ✅ **Prompts**: `PromptsManager` fully implemented with template rendering
- ✅ **Resources**: `ResourcesManager` fully implemented with static/dynamic content
- ✅ **Integration**: Both managers integrated into `OpenAPIServer` with MCP handlers
- ❌ **Custom Tools**: Not yet implemented - this is the primary focus
- ❌ **Programmatic APIs**: Managers exist but not exposed publicly

**This design is now scoped to:**
1. Add custom tools registration (primary goal)
2. Expose existing PromptsManager/ResourcesManager via public methods
3. Add `extraTools` configuration option

## Context

The OpenAPIServer currently generates tools exclusively from OpenAPI specifications. Users need to:
1. Combine API-generated tools with custom utility tools (data transformation, validation)
2. Expose templated workflows as prompts that orchestrate multiple API calls ✅ *Already possible via config*
3. Provide dynamic resources (documentation, schemas) alongside API data ✅ *Already possible via config*

The MCP protocol supports three primitive types: **tools**, **resources**, and **prompts**.

**Current State:**
- ✅ Prompts: Implemented via `PromptsManager` (config-based only)
- ✅ Resources: Implemented via `ResourcesManager` (config-based only)
- ❌ Custom Tools: Not implemented

### Constraints
- Must maintain backward compatibility - existing code continues to work
- Must follow MCP protocol specifications exactly
- Must integrate cleanly with existing OpenAPI tool generation
- Must support both programmatic and configuration-based registration

### Stakeholders
- Library users who want to extend functionality beyond OpenAPI specs
- Applications that need workflow automation via prompts
- Developers building composite MCP servers

## Goals / Non-Goals

### Goals
- ✅ **Enable registration of custom resources** - Done in PR #69 via config
- ✅ **Enable registration of custom prompts** - Done in PR #69 via config
- ❌ **Enable registration of custom tools** - Primary goal of this change
- ❌ **Provide programmatic APIs** - Expose existing managers + add tool registration
- ✅ **Maintain type safety** - Existing managers are type-safe
- ✅ **Update capabilities dynamically** - Already implemented

### New Goals (This Change)
1. **Custom Tools Registration**: Add `registerTool()` method to OpenAPIServer
2. **Programmatic Prompt/Resource APIs**: Add `registerPrompt()` and `registerResource()` methods
3. **Configuration Support**: Add `extraTools` config option (prompts/resources already support config)
4. **Seamless Integration**: Custom tools should work alongside OpenAPI-generated tools

### Non-Goals
- Not changing OpenAPI tool generation logic
- Not changing existing PromptsManager or ResourcesManager implementations
- Not implementing auto-discovery of custom primitives
- Not adding runtime validation beyond MCP protocol requirements
- Not implementing primitive lifecycle management (hot reload, versioning)

## Decisions

### Decision 1: Two Registration Patterns

**Choice**: Support both programmatic registration methods and configuration-based registration

**Rationale**:
- Programmatic API (`registerTool()`, etc.) provides flexibility for dynamic registration
- Configuration API (`extraTools`, etc.) enables declarative setup for static primitives
- Both patterns are common in server frameworks and serve different use cases

**Alternatives Considered**:
- **Only programmatic**: Would require imperative setup code for all primitives
- **Only configuration**: Would prevent dynamic registration based on runtime conditions
- **Separate server classes**: Would fragment the API and complicate documentation

### Decision 2: Storage in Maps with String Keys

**Choice**: Store custom primitives in `Map<string, Definition>` objects:
- Tools: `Map<string, CustomToolDefinition>` keyed by tool name
- Resources: `Map<string, CustomResourceDefinition>` keyed by URI
- Prompts: `Map<string, CustomPromptDefinition>` keyed by prompt name

**Rationale**:
- Efficient lookup during MCP request handling
- Consistent with OpenAPI tools storage pattern (toolsManager uses Maps)
- Natural duplicate detection via Map keys
- Easy iteration for list operations

**Alternatives Considered**:
- **Arrays**: Would require O(n) lookups and manual duplicate checking
- **Class-based registry**: Would add complexity without clear benefits

### Decision 3: Handler Function Signatures

**Choice**: Use async functions with explicit parameter and return types:

```typescript
// CUSTOM TOOLS (new in this change)
type CustomToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}>

// PROMPTS (already implemented - using existing pattern)
// PromptsManager uses template-based rendering, not custom handlers
// Templates use {{argName}} syntax

// RESOURCES (already implemented - using existing pattern)
// ResourcesManager uses contentProvider: () => Promise<string | {blob: string}>
```

**Rationale**:
- Async by default matches MCP request/response pattern
- Explicit return types ensure type safety
- Simple parameter passing - handlers don't need MCP protocol knowledge
- Error handling via exceptions (caught by server)
- **Reuse existing patterns** from PromptsManager/ResourcesManager

**Alternatives Considered**:
- **Sync handlers**: Would block event loop for long operations
- **Callback-based**: Would complicate error handling and stack traces
- **MCP-aware handlers**: Would leak protocol details into user code

### Decision 4: Capabilities Management

**Choice**: Dynamically update capabilities based on registered primitives:
- If `customResources.size > 0`: include `capabilities.resources = { list: true }`
- If `customPrompts.size > 0`: include `capabilities.prompts = { list: true }`
- Always include `capabilities.tools = { list: true, execute: true }`

**Rationale**:
- Accurate capability declaration helps clients optimize requests
- Conditional capabilities reduce protocol overhead when features unused
- Follows MCP best practices for capability negotiation

**Alternatives Considered**:
- **Always declare all capabilities**: Would be misleading when features unused
- **Static capabilities from config**: Would prevent dynamic registration
- **Lazy capability updates**: Would violate MCP initialization contract

### Decision 5: Duplicate Handling

**Choice**: Throw errors on duplicate registration attempts:
- Tool name conflict: `Error: Tool with name '${name}' already exists`
- Resource URI conflict: `Error: Resource with URI '${uri}' already exists`
- Prompt name conflict: `Error: Prompt with name '${name}' already exists`

**Rationale**:
- Fail-fast prevents silent bugs from shadowing
- Clear error messages aid debugging
- Consistent with principle of explicit over implicit

**Alternatives Considered**:
- **Silent override**: Would hide bugs and make behavior unpredictable
- **Namespace prefixing**: Would complicate API and leak implementation details
- **Last-write-wins**: Would make registration order significant

### Decision 6: Integration with Existing Tools

**Choice**: Merge custom tools with OpenAPI tools during `tools/list` and `tools/call`:
- `tools/list`: Return `[...openApiTools, ...customTools]`
- `tools/call`: Check OpenAPI tools first, then custom tools

**Rationale**:
- Seamless experience for MCP clients - all tools are equal
- Preserves existing OpenAPI tool precedence
- Simple implementation with clear lookup order

**Alternatives Considered**:
- **Separate namespaces**: Would complicate client usage
- **Custom tools only mode**: Would prevent combining with OpenAPI tools

## Architecture

### Component Structure (Updated After PR #69)

```
OpenAPIServer
├─ toolsManager: ToolsManager (existing - OpenAPI tools)
├─ promptsManager?: PromptsManager (existing ✅ - from PR #69)
├─ resourcesManager?: ResourcesManager (existing ✅ - from PR #69)
├─ customTools: Map<string, CustomToolDefinition> (NEW ❌)
│
├─ PUBLIC METHODS (NEW):
│  ├─ registerTool(name, definition, handler) → add to customTools
│  ├─ registerPrompt(prompt) → delegate to promptsManager.addPrompt()
│  └─ registerResource(resource) → delegate to resourcesManager.addResource()
│
└─ initializeHandlers()
   ├─ ListToolsRequestSchema → [...openApiTools, ...customTools] (UPDATED)
   ├─ CallToolRequestSchema → check OpenAPI tools, then customTools (UPDATED)
   ├─ ListPromptsRequestSchema → promptsManager.getAllPrompts() (existing ✅)
   ├─ GetPromptRequestSchema → promptsManager.getPrompt() (existing ✅)
   ├─ ListResourcesRequestSchema → resourcesManager.getAllResources() (existing ✅)
   └─ ReadResourceRequestSchema → resourcesManager.readResource() (existing ✅)
```

**Key Changes:**
- ✅ Prompts/Resources managers already exist - just expose via public methods
- ❌ Custom tools storage and registration is NEW
- Tool execution updated to check both OpenAPI + custom tools

### Data Flow

**Custom Tool Execution**:
1. Client sends `tools/call` request
2. Server checks OpenAPI tools (existing logic)
3. If not found, check `customTools` map
4. Execute handler with `args`
5. Wrap result in MCP response format

**Resource Read** (already implemented ✅):
1. Client sends `resources/read` request
2. `registerResource()` → `resourcesManager.addResource()`
3. Server handler calls `resourcesManager.readResource(uri)`
4. ResourcesManager executes contentProvider or returns static content
5. Return TextResourceContents or BlobResourceContents

**Prompt Get** (already implemented ✅):
1. Client sends `prompts/get` request
2. `registerPrompt()` → `promptsManager.addPrompt()`
3. Server handler calls `promptsManager.getPrompt(name, args)`
4. PromptsManager validates args and renders template with `{{argName}}` syntax
5. Return PromptMessage array

## Risks / Trade-offs

### Risk: Handler Execution Time
- **Risk**: Long-running custom handlers block server event loop
- **Mitigation**: Document best practices for async operations and timeouts
- **Acceptance**: Users responsible for handler performance

### Risk: Memory Growth
- **Risk**: Large number of registered primitives increases memory usage
- **Mitigation**: Store only definition + handler reference, not data
- **Acceptance**: Expected - custom functionality has cost

### Risk: Type Safety Gaps
- **Risk**: Handler return types may not match declared schemas
- **Mitigation**: TypeScript provides compile-time checks; runtime errors caught
- **Acceptance**: Runtime validation would add significant complexity

### Trade-off: Configuration vs Code
- **Pro**: Configuration enables declarative setup
- **Con**: Configuration can't express complex logic
- **Decision**: Support both - users choose appropriate pattern

### Trade-off: Namespace Pollution
- **Pro**: Flat namespace is simple
- **Con**: Name conflicts possible between OpenAPI and custom tools
- **Decision**: Explicit error on conflict - users choose unique names

## Migration Plan

### Phase 1: Implementation (this change)
1. Add type definitions
2. Implement registration methods
3. Add MCP protocol handlers
4. Write comprehensive tests
5. Document API and examples

### Phase 2: Adoption (post-implementation)
1. Users opt-in by calling registration methods or providing config
2. No changes required for existing users
3. Examples demonstrate integration patterns

### Rollback
If critical issues found:
1. Registration methods become no-ops (log warning)
2. Configuration fields ignored
3. Existing OpenAPI-only functionality unaffected

## Implementation Notes

### File Organization (Updated)
```
src/
├─ types/
│  └─ custom-primitives.ts          # New: CustomToolDefinition type
├─ server.ts                         # Modified: Add customTools Map + registration methods
├─ config.ts                         # Modified: Add extraTools field
├─ prompts-manager.ts                # Existing ✅ (no changes)
├─ resources-manager.ts              # Existing ✅ (no changes)
└─ index.ts                          # Modified: Export CustomToolDefinition
```

### Key Implementation Details

1. **Initialize Managers Early** (to allow later registration):
```typescript
constructor(config: OpenAPIMCPServerConfig) {
  // Always initialize managers (even if config empty) to allow registerPrompt/Resource()
  this.promptsManager = new PromptsManager({ prompts: config.prompts || [] })
  this.resourcesManager = new ResourcesManager({ resources: config.resources || [] })
  this.customTools = new Map()  // NEW

  // Load extraTools from config if provided
  if (config.extraTools) {
    for (const tool of config.extraTools) {
      this.customTools.set(tool.name, tool)
    }
  }
}
```

2. **Registration Methods** (delegate to existing managers + new customTools):
```typescript
// NEW - custom tools
registerTool(name: string, definition: CustomToolDefinition, handler: CustomToolHandler): void {
  if (this.customTools.has(name)) {
    throw new Error(`Tool with name '${name}' already exists`)
  }
  this.customTools.set(name, { ...definition, handler })
}

// NEW - expose existing PromptsManager
registerPrompt(prompt: PromptDefinition): void {
  this.promptsManager.addPrompt(prompt)
}

// NEW - expose existing ResourcesManager
registerResource(resource: ResourceDefinition): void {
  this.resourcesManager.addResource(resource)
}
```

3. **Update Tool Handlers**:
```typescript
// tools/list - merge OpenAPI + custom tools
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
  const openApiTools = this.toolsManager.getAllTools()
  const customTools = Array.from(this.customTools.values()).map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }))
  return { tools: [...openApiTools, ...customTools] }
})

// tools/call - check OpenAPI first, then custom
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // ... existing OpenAPI tool lookup ...

  // If not found in OpenAPI tools, check custom tools
  const customTool = this.customTools.get(idOrName)
  if (customTool) {
    try {
      return await customTool.handler(params || {})
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      }
    }
  }

  throw new Error(`Tool not found: ${idOrName}`)
})
```

4. **Capabilities** (already correct ✅):
```typescript
// Capabilities are already dynamic in constructor
if (this.promptsManager) {
  capabilities.prompts = {}
}
if (this.resourcesManager) {
  capabilities.resources = {}
}
// No changes needed - this already works
```

## Open Questions

None - all design decisions resolved during proposal phase.
