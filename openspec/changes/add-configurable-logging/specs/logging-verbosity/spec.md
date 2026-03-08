## ADDED Requirements

### Requirement: Configurable logging verbosity

The server SHALL allow users to control operational logging verbosity through CLI flags and environment variables.

#### Scenario: Verbose logging is enabled by default

- **WHEN** the user starts the server without setting any logging verbosity option
- **THEN** operational logs remain enabled for backward compatibility

#### Scenario: CLI disables verbose logging

- **WHEN** the user starts the server with a verbosity flag that disables logging
- **THEN** the loaded configuration disables non-essential logs

#### Scenario: Environment disables verbose logging

- **WHEN** the user sets an environment variable that disables verbose logging
- **THEN** the loaded configuration disables non-essential logs unless CLI flags override it

### Requirement: Internal logs respect configured verbosity

The server SHALL route internal warning and error logs through a shared logger that respects the configured verbosity.

#### Scenario: Verbose logging is disabled

- **WHEN** the logger receives warning or error messages while verbose logging is disabled
- **THEN** those messages are not written to stderr

#### Scenario: Verbose logging is enabled

- **WHEN** the logger receives warning or error messages while verbose logging is enabled
- **THEN** those messages are written to stderr
