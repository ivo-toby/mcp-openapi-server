# Change: Add exclude-tag filtering

## Why

Large OpenAPI specs often include admin, internal, deprecated, or otherwise noisy endpoint groups that should not be exposed to an LLM tool surface by default. Operators need a simple deny-list filter that removes endpoints by OpenAPI tag without maintaining a long explicit allow-list.

## What Changes

- Add `excludeTags` configuration and a `--exclude-tag` CLI option.
- Treat excluded tags as a hard tool-surface deny across all, explicit, and dynamic tool modes.
- Ensure dynamic meta-tools do not list, describe, or invoke excluded endpoints.
- Document that tag exclusion reduces the MCP tool surface but does not replace upstream authorization.

## Impact

- Affected specs: tool-filtering
- Affected code: `src/config.ts`, `src/tools-manager.ts`, `src/api-client.ts`
- Affected tests: `test/config.test.ts`, `test/tools-manager.test.ts`, `test/api-client.test.ts`
