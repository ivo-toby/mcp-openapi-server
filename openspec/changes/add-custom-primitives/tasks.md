# Implementation Tasks (Updated Post PR #69)

**Status**: Prompts & Resources already implemented. Focus on Custom Tools + Programmatic APIs.

## 1. Type Definitions
- [ ] 1.1 Create `src/types/custom-primitives.ts` file
- [ ] 1.2 Define `CustomToolDefinition` interface with handler signature
- [ ] 1.3 Define `CustomToolHandler` type for tool execution
- [ ] 1.4 Export types from `src/index.ts`

## 2. Configuration Schema Updates
- [ ] 2.1 Add `extraTools?: CustomToolDefinition[]` field to `OpenAPIMCPServerConfig`
- [ ] 2.2 Update `loadConfig()` in `config.ts` to parse `extraTools` from CLI/config
- [ ] 2.3 Add CLI flag `--extra-tool` to support command-line tool registration

## 3. OpenAPIServer - Custom Tools Storage
- [ ] 3.1 Add `private customTools: Map<string, CustomToolDefinition>` to OpenAPIServer class
- [ ] 3.2 Update constructor to load `extraTools` from config into `customTools` Map
- [ ] 3.3 Initialize `customTools` Map even when `extraTools` is empty

## 4. OpenAPIServer - Manager Initialization
- [ ] 4.1 Update constructor to always initialize `promptsManager` (even if `config.prompts` empty)
- [ ] 4.2 Update constructor to always initialize `resourcesManager` (even if `config.resources` empty)
- [ ] 4.3 Keep capabilities dynamic based on actual manager content (existing logic ✅)

## 5. OpenAPIServer - Registration Methods
- [ ] 5.1 Implement `registerTool(name, definition, handler)` method
- [ ] 5.2 Add duplicate name validation in `registerTool()`
- [ ] 5.3 Implement `registerPrompt(prompt)` wrapper method (delegates to `promptsManager.addPrompt()`)
- [ ] 5.4 Implement `registerResource(resource)` wrapper method (delegates to `resourcesManager.addResource()`)
- [ ] 5.5 Export registration methods as public API

## 6. MCP Protocol Handler Updates - Tools
- [ ] 6.1 Update `ListToolsRequestSchema` handler to merge OpenAPI + custom tools
- [ ] 6.2 Ensure custom tools have correct MCP Tool format (name, description, inputSchema)
- [ ] 6.3 Update `CallToolRequestSchema` handler to check custom tools if not found in OpenAPI tools
- [ ] 6.4 Add error handling for custom tool handler execution
- [ ] 6.5 Ensure error responses include `isError: true` flag
- [ ] 6.6 Test that OpenAPI tools have precedence over custom tools with same name

## 7. Error Handling
- [ ] 7.1 Add try-catch wrapper for custom tool handler execution
- [ ] 7.2 Format handler errors as MCP text content with `isError: true`
- [ ] 7.3 Validate tool input against inputSchema before calling handler (optional)
- [ ] 7.4 Add proper error message for tool not found (check both OpenAPI + custom)

## 8. Testing - Custom Tools
- [ ] 8.1 Test registering custom tool programmatically via `registerTool()`
- [ ] 8.2 Test registering custom tool via config `extraTools`
- [ ] 8.3 Test custom tool appears in `tools/list` response
- [ ] 8.4 Test custom tool execution with valid input via `tools/call`
- [ ] 8.5 Test custom tool execution with handler error
- [ ] 8.6 Test duplicate tool name error (same name registered twice)
- [ ] 8.7 Test custom tool + OpenAPI tool coexistence
- [ ] 8.8 Test OpenAPI tool precedence when names conflict

## 9. Testing - Programmatic Prompt Registration
- [ ] 9.1 Test `registerPrompt()` adds prompt successfully
- [ ] 9.2 Test registered prompt appears in `prompts/list`
- [ ] 9.3 Test registered prompt can be retrieved via `prompts/get`
- [ ] 9.4 Test prompt registration after server construction
- [ ] 9.5 Test duplicate prompt name error

## 10. Testing - Programmatic Resource Registration
- [ ] 10.1 Test `registerResource()` adds resource successfully
- [ ] 10.2 Test registered resource appears in `resources/list`
- [ ] 10.3 Test registered resource can be read via `resources/read`
- [ ] 10.4 Test resource registration after server construction
- [ ] 10.5 Test duplicate resource URI error

## 11. Testing - Integration
- [ ] 11.1 Test all three registration methods work simultaneously
- [ ] 11.2 Test capabilities declared correctly when all three used
- [ ] 11.3 Test server initialization with `extraTools` + `prompts` + `resources` in config
- [ ] 11.4 Test error handling across custom tools, prompts, and resources

## 12. Documentation
- [ ] 12.1 Update README with custom tools API
- [ ] 12.2 Add example of registering custom tool programmatically
- [ ] 12.3 Add example of registering custom tool via config
- [ ] 12.4 Document `registerPrompt()` and `registerResource()` methods
- [ ] 12.5 Add use case examples (data transformation tool, workflow prompts)
- [ ] 12.6 Update TypeScript API documentation
- [ ] 12.7 Add migration guide for users wanting to add custom functionality

## 13. Example/Demo
- [ ] 13.1 Create example showing custom tool + OpenAPI tool together
- [ ] 13.2 Create example showing all three primitives registered programmatically
- [ ] 13.3 Add example of workflow prompt composing multiple API calls
- [ ] 13.4 Add example of utility tool (e.g., base64 encode/decode)
