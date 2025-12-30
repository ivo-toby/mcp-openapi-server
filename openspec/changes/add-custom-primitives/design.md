# Design: Custom MCP Primitives

## Context

The OpenAPIServer currently generates tools exclusively from OpenAPI specifications. Users need to:
1. Combine API-generated tools with custom utility tools (data transformation, validation)
2. Expose templated workflows as prompts that orchestrate multiple API calls
3. Provide dynamic resources (documentation, schemas) alongside API data

The MCP protocol supports three primitive types: **tools**, **resources**, and **prompts**. The OpenAPIServer currently only implements tools, and only from OpenAPI specs.

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
- Enable registration of custom tools with full MCP Tool interface
- Enable registration of custom resources (text and blob types)
- Enable registration of custom prompts with argument templating
- Provide both programmatic API and configuration-based registration
- Maintain type safety throughout the API surface
- Update server capabilities dynamically based on registered primitives

### Non-Goals
- Not changing OpenAPI tool generation logic
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
type CustomToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}>

type CustomResourceHandler = () => Promise<TextResourceContents | BlobResourceContents>

type CustomPromptHandler = (args: Record<string, string>) => Promise<PromptMessage[]>
```

**Rationale**:
- Async by default matches MCP request/response pattern
- Explicit return types ensure type safety
- Simple parameter passing - handlers don't need MCP protocol knowledge
- Error handling via exceptions (caught by server)

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

### Component Structure

```
OpenAPIServer
├─ customTools: Map<string, CustomToolDefinition>
├─ customResources: Map<string, CustomResourceDefinition>
├─ customPrompts: Map<string, CustomPromptDefinition>
├─ registerTool(name, definition, handler)
├─ registerResource(uri, definition, handler)
├─ registerPrompt(name, definition, handler)
└─ initializeHandlers()
   ├─ ListToolsRequestSchema → [...openApiTools, ...customTools]
   ├─ CallToolRequestSchema → execute tool or custom handler
   ├─ ListResourcesRequestSchema → customResources
   ├─ ReadResourceRequestSchema → execute resource handler
   ├─ ListPromptsRequestSchema → customPrompts
   └─ GetPromptRequestSchema → execute prompt handler
```

### Data Flow

**Custom Tool Execution**:
1. Client sends `tools/call` request
2. Server checks OpenAPI tools (existing logic)
3. If not found, check `customTools` map
4. Execute handler with `args`
5. Wrap result in MCP response format

**Custom Resource Read**:
1. Client sends `resources/read` request
2. Server looks up URI in `customResources` map
3. Execute handler
4. Return TextResourceContents or BlobResourceContents

**Custom Prompt Get**:
1. Client sends `prompts/get` request
2. Server looks up name in `customPrompts` map
3. Validate required arguments present
4. Execute handler with arguments
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

### File Organization
```
src/
├─ types/
│  └─ custom-primitives.ts          # New: Type definitions
├─ server.ts                         # Modified: Add registration + handlers
├─ config.ts                         # Modified: Add config fields
└─ index.ts                          # Modified: Export new types
```

### Key Implementation Details

1. **Registration Method Template**:
```typescript
registerTool(name: string, definition: CustomToolDefinition, handler: CustomToolHandler): void {
  if (this.customTools.has(name)) {
    throw new Error(`Tool with name '${name}' already exists`)
  }
  this.customTools.set(name, { ...definition, handler })
}
```

2. **Handler Execution Template**:
```typescript
const toolInfo = this.customTools.get(name)
if (toolInfo) {
  try {
    const result = await toolInfo.handler(params)
    return result
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true }
  }
}
```

3. **Capabilities Update**:
```typescript
const capabilities: ServerCapabilities = {
  tools: { list: true, execute: true }
}
if (this.customResources.size > 0) {
  capabilities.resources = { list: true }
}
if (this.customPrompts.size > 0) {
  capabilities.prompts = { list: true }
}
```

## Open Questions

None - all design decisions resolved during proposal phase.
