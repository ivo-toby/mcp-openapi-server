# Implementation Tasks

## 1. Type Definitions
- [ ] 1.1 Create `src/types/custom-primitives.ts` with TypeScript interfaces
- [ ] 1.2 Define `CustomToolDefinition` interface with handler signature
- [ ] 1.3 Define `CustomResourceDefinition` interface with handler signature
- [ ] 1.4 Define `CustomPromptDefinition` interface with handler signature
- [ ] 1.5 Export handler result types for all three primitives

## 2. Configuration Schema Updates
- [ ] 2.1 Add `extraTools` field to `OpenAPIMCPServerConfig` interface
- [ ] 2.2 Add `extraResources` field to `OpenAPIMCPServerConfig` interface
- [ ] 2.3 Add `extraPrompts` field to `OpenAPIMCPServerConfig` interface
- [ ] 2.4 Update `loadConfig()` to parse new configuration options

## 3. Server Registration Methods
- [ ] 3.1 Add private storage maps for custom primitives in `OpenAPIServer` class
- [ ] 3.2 Implement `registerTool(name, definition, handler)` method
- [ ] 3.3 Implement `registerResource(uri, definition, handler)` method
- [ ] 3.4 Implement `registerPrompt(name, definition, handler)` method
- [ ] 3.5 Add duplicate name/URI validation to registration methods
- [ ] 3.6 Update constructor to register primitives from config

## 4. MCP Protocol Handler Updates
- [ ] 4.1 Update `tools/list` handler to include custom tools
- [ ] 4.2 Update `tools/call` handler to execute custom tool handlers
- [ ] 4.3 Add `resources/list` handler with custom resources
- [ ] 4.4 Add `resources/read` handler to execute resource handlers
- [ ] 4.5 Add `prompts/list` handler with custom prompts
- [ ] 4.6 Add `prompts/get` handler to execute prompt handlers

## 5. Capabilities Declaration
- [ ] 5.1 Update `initializeHandlers()` to conditionally set capabilities
- [ ] 5.2 Add `resources` capability when custom resources registered
- [ ] 5.3 Add `prompts` capability when custom prompts registered
- [ ] 5.4 Ensure tools capability remains set when custom tools added

## 6. Error Handling
- [ ] 6.1 Add error handling for tool handler execution
- [ ] 6.2 Add error handling for resource handler execution
- [ ] 6.3 Add error handling for prompt handler execution
- [ ] 6.4 Add validation for missing required prompt arguments
- [ ] 6.5 Add proper error responses for not found resources/prompts

## 7. Testing - Custom Tools
- [ ] 7.1 Test registering tool programmatically
- [ ] 7.2 Test registering tool via config
- [ ] 7.3 Test tool appears in tools/list
- [ ] 7.4 Test tool execution with valid input
- [ ] 7.5 Test tool execution with invalid input
- [ ] 7.6 Test duplicate tool name error
- [ ] 7.7 Test custom tool alongside OpenAPI tools

## 8. Testing - Custom Resources
- [ ] 8.1 Test registering resource programmatically
- [ ] 8.2 Test registering resource via config
- [ ] 8.3 Test resource appears in resources/list
- [ ] 8.4 Test reading text resource
- [ ] 8.5 Test reading blob resource
- [ ] 8.6 Test resource not found error
- [ ] 8.7 Test duplicate resource URI error

## 9. Testing - Custom Prompts
- [ ] 9.1 Test registering prompt programmatically
- [ ] 9.2 Test registering prompt via config
- [ ] 9.3 Test prompt appears in prompts/list
- [ ] 9.4 Test getting prompt without arguments
- [ ] 9.5 Test getting prompt with arguments
- [ ] 9.6 Test missing required arguments error
- [ ] 9.7 Test duplicate prompt name error

## 10. Testing - Integration
- [ ] 10.1 Test all three primitive types registered simultaneously
- [ ] 10.2 Test capabilities declared correctly based on registered primitives
- [ ] 10.3 Test server initialization with extraTools/extraResources/extraPrompts
- [ ] 10.4 Test error handling across all primitive types

## 11. Documentation
- [ ] 11.1 Update README with custom primitives API
- [ ] 11.2 Add example of registering custom tool
- [ ] 11.3 Add example of registering custom resource
- [ ] 11.4 Add example of registering custom prompt
- [ ] 11.5 Create example file in `examples/` directory
- [ ] 11.6 Update CLAUDE.md with architecture details

## 12. Type Exports
- [ ] 12.1 Export custom primitive types from `src/index.ts`
- [ ] 12.2 Ensure TypeScript declarations are generated correctly
- [ ] 12.3 Verify type imports work in consuming projects
