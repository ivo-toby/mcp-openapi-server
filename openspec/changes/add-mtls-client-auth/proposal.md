# Change: Add mTLS client certificate support

## Why

Some APIs require mutual TLS at the transport layer, so header-based authentication alone is not enough. The server needs a way to attach a client certificate and private key to outgoing HTTPS requests, and optionally relax server certificate verification for development environments.

## What Changes

- Add config options for `clientCertPath`, `clientKeyPath`, `caCertPath`, `clientKeyPassphrase`, and `rejectUnauthorized` via CLI flags and environment variables
- Load certificate material from PEM files and configure the API client with an HTTPS agent for outbound requests
- Keep mTLS orthogonal to existing header-based and dynamic authentication flows
- Document the new CLI and environment options with usage examples, including private CA and encrypted key usage

## Impact

- Affected specs: `mtls-client-auth`
- Affected code: `src/config.ts`, `src/server.ts`, `src/api-client.ts`, relevant tests, `README.md`
