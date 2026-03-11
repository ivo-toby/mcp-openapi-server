## ADDED Requirements

### Requirement: Configured extra tools

The OpenAPIServer SHALL allow developers to define extra custom tools in server configuration alongside OpenAPI-generated tools.

#### Scenario: Extra tools appear in tools list

- **WHEN** the server is configured with one or more `extraTools`
- **THEN** those tools appear in `tools/list` responses alongside generated tools

#### Scenario: Extra tool executes successfully

- **WHEN** an MCP client calls a configured extra tool with valid arguments
- **THEN** the configured handler is invoked with the provided arguments
- **AND** the handler result is returned to the client as the tool response

### Requirement: Extra tool collision protection

The OpenAPIServer SHALL reject conflicting extra tool registrations.

#### Scenario: Duplicate extra tool id

- **WHEN** two extra tools use the same configured tool ID
- **THEN** server initialization fails with a clear error

#### Scenario: Duplicate extra tool name

- **WHEN** two extra tools use the same MCP tool name
- **THEN** server initialization fails with a clear error

#### Scenario: Conflict with generated tool

- **WHEN** an extra tool uses the ID or name of an OpenAPI-generated tool
- **THEN** server startup fails with a clear error

### Requirement: Extra tools are configuration-only in the first release

The initial extra tools capability SHALL be exposed through server configuration only.

#### Scenario: Server constructed without extra tools

- **WHEN** the server is created without `extraTools`
- **THEN** existing OpenAPI-generated tool behavior remains unchanged
