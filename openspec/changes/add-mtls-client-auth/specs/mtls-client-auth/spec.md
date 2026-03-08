## ADDED Requirements

### Requirement: Client certificate configuration

The server SHALL accept mutual TLS client certificate and TLS trust settings through CLI flags and environment variables.

#### Scenario: CLI provides mTLS settings

- **WHEN** the user starts the server with `--client-cert`, `--client-key`, `--ca-cert`, `--client-key-passphrase`, and `--reject-unauthorized`
- **THEN** the loaded configuration includes those values

#### Scenario: Environment provides mTLS settings

- **WHEN** the user sets `CLIENT_CERT_PATH`, `CLIENT_KEY_PATH`, `CA_CERT_PATH`, `CLIENT_KEY_PASSPHRASE`, or `REJECT_UNAUTHORIZED`
- **THEN** the loaded configuration uses those values when CLI flags are not provided

### Requirement: Outbound HTTPS requests support mTLS

The server SHALL configure outbound API requests with client certificate material when mutual TLS settings are provided.

#### Scenario: mTLS is enabled

- **WHEN** the server is configured with both a client certificate path and client key path
- **THEN** outbound API requests use an HTTPS agent initialized with the loaded PEM certificate and key

#### Scenario: Server certificate validation override is disabled

- **WHEN** the user sets `rejectUnauthorized` to `false`
- **THEN** the HTTPS agent allows self-signed or otherwise untrusted server certificates

#### Scenario: Private CA bundle is configured

- **WHEN** the user provides a custom CA certificate path
- **THEN** the HTTPS agent trusts server certificates signed by that CA bundle

#### Scenario: Encrypted private key is configured

- **WHEN** the user provides a client key passphrase
- **THEN** the HTTPS agent uses that passphrase when loading the private key

### Requirement: HTTP authentication remains compatible with mTLS

The server SHALL continue to support header-based and dynamic authentication when mutual TLS is enabled.

#### Scenario: mTLS and HTTP auth are both configured

- **WHEN** the server has mTLS settings and either static headers or an `AuthProvider`
- **THEN** the API client uses the HTTPS agent and the existing HTTP authentication behavior together
