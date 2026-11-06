## ADDED Requirements

### Requirement: Configured server instructions

The OpenAPIServer SHALL let developers describe how the server is meant to be used, and SHALL hand that description to MCP clients in the `initialize` result.

#### Scenario: Instructions reach the client

- **WHEN** the server is configured with `instructions`
- **THEN** the `initialize` result holds them in its `instructions` field

#### Scenario: No instructions configured

- **WHEN** the server is configured without `instructions`
- **THEN** the `initialize` result has no `instructions` field

### Requirement: Instructions from the command line

The CLI SHALL accept the instructions as a string, from an argument or from the environment.

#### Scenario: Instructions given as an argument

- **WHEN** the CLI is given `--instructions` with a string
- **THEN** that string becomes the instructions of the server

#### Scenario: Instructions from the environment

- **WHEN** the environment holds `SERVER_INSTRUCTIONS` and the argument is missing
- **THEN** the value of the environment variable becomes the instructions of the server
