# Change: Add configurable logging verbosity

## Why

The server currently writes operational and diagnostic logs unconditionally. That is noisy in embedded and automated environments, and there is no supported way to reduce output without patching the code.

## What Changes

- Add a `verbose` configuration option exposed through CLI flags and environment variables
- Route existing internal warning and error logging through a shared logger that respects the configured verbosity
- Preserve current behavior by default so existing users still see logs unless they explicitly disable them
- Document the new logging controls and their defaults

## Impact

- Affected specs: `logging-verbosity`
- Affected code: `src/config.ts`, `src/index.ts`, `src/server.ts`, `src/openapi-loader.ts`, `src/tools-manager.ts`, `src/transport/StreamableHttpServerTransport.ts`, related tests, `README.md`
