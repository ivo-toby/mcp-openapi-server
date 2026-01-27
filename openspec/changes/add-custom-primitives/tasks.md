# Implementation Tasks (Updated Post PR #69)

**Status**: Prompts & Resources already implemented. Focus on Custom Tools + Programmatic APIs.

## 1. Type Definitions
- [x] 1.1 Create `src/types/custom-primitives.ts` file
- [x] 1.2 Define `CustomToolDefinition` interface with handler signature
- [x] 1.3 Define `CustomToolHandler` type for tool execution
- [x] 1.4 Export types from `src/index.ts`

## 2. Configuration Schema Updates
- [x] 2.1 Add `extraTools?: CustomToolDefinition[]` field to `OpenAPIMCPServerConfig`
- [ ] 2.2 Update `loadConfig()` in `config.ts` to parse `extraTools` from CLI/config (deferred - config loading only)
- [ ] 2.3 Add CLI flag `--extra-tool` to support command-line tool registration (deferred - programmatic API primary focus)

## 3. OpenAPIServer - Custom Tools Storage
- [x] 3.1 Add `private customTools: Map<string, CustomToolDefinition>` to OpenAPIServer class
- [x] 3.2 Update constructor to load `extraTools` from config into `customTools` Map
- [x] 3.3 Initialize `customTools` Map even when `extraTools` is empty

## 4. OpenAPIServer - Manager Initialization
- [x] 4.1 Update constructor to always initialize `promptsManager` (even if `config.prompts` empty)
- [x] 4.2 Update constructor to always initialize `resourcesManager` (even if `config.resources` empty)
- [x] 4.3 Update capabilities to always declare prompts/resources (for dynamic registration)

## 5. OpenAPIServer - Registration Methods
- [x] 5.1 Implement `registerTool(name, definition)` method
- [x] 5.2 Add duplicate name validation in `registerTool()`
- [x] 5.3 Implement `registerPrompt(prompt)` wrapper method (delegates to `promptsManager.addPrompt()`)
- [x] 5.4 Implement `registerResource(resource)` wrapper method (delegates to `resourcesManager.addResource()`)
- [x] 5.5 Export registration methods as public API

## 6. MCP Protocol Handler Updates - Tools
- [x] 6.1 Update `ListToolsRequestSchema` handler to merge OpenAPI + custom tools
- [x] 6.2 Ensure custom tools have correct MCP Tool format (name, description, inputSchema)
- [x] 6.3 Update `CallToolRequestSchema` handler to check custom tools if not found in OpenAPI tools
- [x] 6.4 Add error handling for custom tool handler execution
- [x] 6.5 Ensure error responses include `isError: true` flag
- [x] 6.6 Verify that OpenAPI tools have precedence over custom tools

## 7. Error Handling
- [x] 7.1 Add try-catch wrapper for custom tool handler execution
- [x] 7.2 Format handler errors as MCP text content with `isError: true`
- [ ] 7.3 Validate tool input against inputSchema before calling handler (deferred - MCP SDK handles)
- [x] 7.4 Add proper error message for tool not found (check both OpenAPI + custom)

## 8. Testing - Custom Tools
- [x] 8.1 Test registering custom tool programmatically via `registerTool()`
- [x] 8.2 Test registering custom tool via config `extraTools`
- [x] 8.3 Test custom tool appears in `tools/list` response
- [x] 8.4 Test custom tool execution with valid input via `tools/call`
- [x] 8.5 Test custom tool execution with handler error
- [x] 8.6 Test duplicate tool name error (same name registered twice)
- [x] 8.7 Test custom tool + OpenAPI tool coexistence
- [x] 8.8 Test OpenAPI tool precedence when names conflict

## 9. Testing - Programmatic Prompt Registration
- [x] 9.1 Test `registerPrompt()` adds prompt successfully
- [x] 9.2 Test registered prompt appears in `prompts/list`
- [x] 9.3 Test registered prompt can be retrieved via `prompts/get`
- [x] 9.4 Test prompt registration after server construction
- [ ] 9.5 Test duplicate prompt name error (deferred - manager handles)

## 10. Testing - Programmatic Resource Registration
- [x] 10.1 Test `registerResource()` adds resource successfully
- [x] 10.2 Test registered resource appears in `resources/list`
- [x] 10.3 Test registered resource can be read via `resources/read`
- [x] 10.4 Test resource registration after server construction
- [ ] 10.5 Test duplicate resource URI error (deferred - manager handles)

## 11. Testing - Integration
- [x] 11.1 Test all three registration methods work simultaneously
- [x] 11.2 Test capabilities declared correctly when all three used
- [x] 11.3 Test server initialization with `extraTools` + `prompts` + `resources` in config
- [x] 11.4 Test error handling across custom tools, prompts, and resources

## 12. Documentation
- [x] 12.1 Update README with custom tools API
- [x] 12.2 Add example of registering custom tool programmatically
- [x] 12.3 Add example of registering custom tool via config
- [x] 12.4 Document `registerPrompt()` and `registerResource()` methods
- [x] 12.5 Add use case examples (data transformation tool, workflow prompts)
- [x] 12.6 Update TypeScript API documentation (inline in README)
- [ ] 12.7 Add migration guide for users wanting to add custom functionality (deferred - examples sufficient)

## 13. Example/Demo
- [x] 13.1 Create example showing custom tool + OpenAPI tool together
- [x] 13.2 Create example showing all three primitives registered programmatically
- [x] 13.3 Add example of workflow prompt composing multiple API calls
- [x] 13.4 Add example of utility tool (e.g., base64 encode/decode)
