## ADDED Requirements

### Requirement: Exclude Tag Filtering

The system SHALL allow operators to configure OpenAPI tags that are excluded from the exposed MCP tool surface.

#### Scenario: Endpoint tool with excluded tag

- **WHEN** an OpenAPI operation has a tag matching an excluded tag case-insensitively
- **THEN** the corresponding endpoint tool is not listed or callable through the generated endpoint-tool registry

#### Scenario: Explicit include conflicts with excluded tag

- **WHEN** an endpoint is selected by `includeTools` and also has a matching excluded tag
- **THEN** the endpoint remains excluded

#### Scenario: Dynamic endpoint listing

- **WHEN** dynamic mode lists or describes endpoints
- **THEN** operations with matching excluded tags are omitted from dynamic discovery responses

#### Scenario: Dynamic endpoint invocation

- **WHEN** dynamic mode attempts to invoke an operation with a matching excluded tag
- **THEN** the invocation is rejected before the upstream API request is made

#### Scenario: Untagged endpoint

- **WHEN** an operation has no tags
- **THEN** exclude-tag filtering does not exclude it
