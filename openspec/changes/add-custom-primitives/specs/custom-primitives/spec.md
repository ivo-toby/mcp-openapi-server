# Custom MCP Primitives

## ADDED Requirements

### Requirement: Custom Tool Registration
The OpenAPIServer SHALL allow registration of custom tools that are exposed alongside OpenAPI-generated tools through the MCP tools protocol.

#### Scenario: Register custom tool programmatically
- **WHEN** developer calls `server.registerTool(name, definition, handler)`
- **THEN** the custom tool appears in `tools/list` responses
- **AND** the tool can be invoked via `tools/call` requests
- **AND** the handler function is executed with provided arguments

#### Scenario: Register custom tool via configuration
- **WHEN** developer provides `extraTools` array in config with tool definitions and handlers
- **THEN** all specified tools are registered during server initialization
- **AND** tools are available immediately when server starts

#### Scenario: Custom tool execution with valid input
- **WHEN** MCP client calls a custom tool with valid arguments matching the input schema
- **THEN** the tool handler receives the arguments
- **AND** the handler returns a result with content array
- **AND** the result is returned to the client in MCP format

#### Scenario: Custom tool execution with invalid input
- **WHEN** MCP client calls a custom tool with arguments that don't match the input schema
- **THEN** the server returns an error response
- **AND** the error message indicates schema validation failure

#### Scenario: Duplicate tool registration
- **WHEN** developer attempts to register a tool with a name that already exists (either from OpenAPI or previous registration)
- **THEN** the server throws an error indicating duplicate tool name
- **AND** the original tool remains registered unchanged

### Requirement: Custom Resource Registration
The OpenAPIServer SHALL allow registration of custom resources that are exposed through the MCP resources protocol.

#### Scenario: Register custom resource programmatically
- **WHEN** developer calls `server.registerResource(uri, definition, handler)`
- **THEN** the custom resource appears in `resources/list` responses
- **AND** the resource can be read via `resources/read` requests
- **AND** the handler function is executed when resource is accessed

#### Scenario: Register custom resource via configuration
- **WHEN** developer provides `extraResources` array in config with resource definitions and handlers
- **THEN** all specified resources are registered during server initialization
- **AND** resources are available immediately when server starts

#### Scenario: Read text resource
- **WHEN** MCP client requests a custom resource with URI matching a registered text resource
- **THEN** the resource handler is invoked
- **AND** the handler returns text content with mimeType
- **AND** the content is returned to the client as TextResourceContents

#### Scenario: Read blob resource
- **WHEN** MCP client requests a custom resource with URI matching a registered blob resource
- **THEN** the resource handler is invoked
- **AND** the handler returns base64-encoded blob data with mimeType
- **AND** the content is returned to the client as BlobResourceContents

#### Scenario: Resource not found
- **WHEN** MCP client requests a resource URI that doesn't match any registered resource
- **THEN** the server returns an error indicating resource not found

#### Scenario: Duplicate resource registration
- **WHEN** developer attempts to register a resource with a URI that already exists
- **THEN** the server throws an error indicating duplicate resource URI
- **AND** the original resource remains registered unchanged

### Requirement: Custom Prompt Registration
The OpenAPIServer SHALL allow registration of custom prompts that are exposed through the MCP prompts protocol.

#### Scenario: Register custom prompt programmatically
- **WHEN** developer calls `server.registerPrompt(name, definition, handler)`
- **THEN** the custom prompt appears in `prompts/list` responses
- **AND** the prompt can be retrieved via `prompts/get` requests
- **AND** the handler function is executed to generate prompt messages

#### Scenario: Register custom prompt via configuration
- **WHEN** developer provides `extraPrompts` array in config with prompt definitions and handlers
- **THEN** all specified prompts are registered during server initialization
- **AND** prompts are available immediately when server starts

#### Scenario: Get prompt without arguments
- **WHEN** MCP client requests a custom prompt that has no required arguments
- **THEN** the prompt handler is invoked with empty arguments
- **AND** the handler returns an array of prompt messages
- **AND** the messages are returned to the client in MCP format

#### Scenario: Get prompt with arguments
- **WHEN** MCP client requests a custom prompt with arguments matching the prompt definition
- **THEN** the prompt handler is invoked with provided arguments
- **AND** the handler uses arguments to generate contextualized prompt messages
- **AND** the messages are returned to the client in MCP format

#### Scenario: Get prompt with missing required arguments
- **WHEN** MCP client requests a custom prompt without providing required arguments
- **THEN** the server returns an error indicating missing required arguments
- **AND** the error message specifies which arguments are required

#### Scenario: Duplicate prompt registration
- **WHEN** developer attempts to register a prompt with a name that already exists
- **THEN** the server throws an error indicating duplicate prompt name
- **AND** the original prompt remains registered unchanged

### Requirement: Server Capabilities Declaration
The OpenAPIServer SHALL declare support for resources and prompts in its capabilities when custom primitives are registered.

#### Scenario: Capabilities with custom resources
- **WHEN** at least one custom resource is registered
- **THEN** the server's `initialize` response includes `capabilities.resources` with `list: true`

#### Scenario: Capabilities with custom prompts
- **WHEN** at least one custom prompt is registered
- **THEN** the server's `initialize` response includes `capabilities.prompts` with `list: true`

#### Scenario: Capabilities without custom primitives
- **WHEN** no custom resources or prompts are registered
- **THEN** the server's capabilities object only includes `tools` capability
- **AND** resources and prompts capabilities are omitted

### Requirement: Handler Function Contracts
All custom primitive handlers SHALL follow consistent patterns for error handling and return types.

#### Scenario: Tool handler returns structured content
- **WHEN** a custom tool handler executes successfully
- **THEN** it MUST return an object with a `content` array
- **AND** each content item MUST have a `type` field
- **AND** the result MAY include `isError: true` for semantic errors

#### Scenario: Resource handler returns valid resource contents
- **WHEN** a custom resource handler executes successfully
- **THEN** it MUST return either TextResourceContents or BlobResourceContents
- **AND** the result MUST include a valid `mimeType`

#### Scenario: Prompt handler returns valid messages
- **WHEN** a custom prompt handler executes successfully
- **THEN** it MUST return an array of PromptMessage objects
- **AND** each message MUST have a `role` field (user or assistant)
- **AND** each message MUST have a `content` field with ContentBlock

#### Scenario: Handler throws error
- **WHEN** any custom primitive handler throws an error
- **THEN** the server catches the error
- **AND** returns an appropriate error response to the MCP client
- **AND** logs the error for debugging

### Requirement: Configuration API Type Safety
The configuration-based registration API SHALL provide full TypeScript type safety.

#### Scenario: Type checking for tool handlers
- **WHEN** developer provides an `extraTools` configuration
- **THEN** TypeScript SHALL validate that handler signatures match tool definitions
- **AND** TypeScript SHALL validate that input schemas are valid JSON Schema

#### Scenario: Type checking for resource handlers
- **WHEN** developer provides an `extraResources` configuration
- **THEN** TypeScript SHALL validate that handlers return correct resource content types

#### Scenario: Type checking for prompt handlers
- **WHEN** developer provides an `extraPrompts` configuration
- **THEN** TypeScript SHALL validate that handlers return arrays of PromptMessage
