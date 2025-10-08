# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that exposes OpenAPI endpoints as MCP tools. It allows LLMs to discover and interact with REST APIs defined by OpenAPI specifications through the MCP protocol.

## Essential Development Commands

### Building and Testing
```bash
npm run build           # Build TypeScript using esbuild
npm test                # Run all tests with Vitest
npm test -- api-client.test.ts   # Run specific test file
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate coverage report
```

### Development Workflow
```bash
npm run dev             # Watch mode with auto-rebuild
npm run inspect-watch   # Debug mode with auto-reload (starts MCP inspector)
npm run typecheck       # TypeScript type checking only (no build)
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix linting issues
```

### Common Pitfall
**Never try to run test scripts from command line using `node -e`** - this will always fail. Write a TypeScript test file, build it, and execute it, or use the test runner with `npm test`.

## Architecture & Key Concepts

### Core Components

The codebase has a layered architecture:

```
OpenAPIServer (server.ts)
    ↓ uses
ToolsManager (tools-manager.ts) → manages tool filtering & lookup
    ↓ uses
OpenAPISpecLoader (openapi-loader.ts) → parses specs & creates tools
    ↓ uses
ApiClient (api-client.ts) → executes HTTP requests
    ↓ uses
AuthProvider (auth-provider.ts) → handles authentication
```

### Tool ID System

Tool IDs uniquely identify API endpoints with format: `METHOD::pathPart`

**Critical implementation detail**: Uses **double underscores (`__`)** to separate path segments:
- `/api/v1/users` → `GET::api__v1__users`
- `/api/resource-name/items` → `GET::api__resource-name__items`
- Single hyphens within segments are preserved as-is
- Path parameters have braces removed: `/users/{id}` → `GET::users__---id`

Implementation in `src/utils/tool-id.ts`:
- `generateToolId()` - Creates tool IDs from method + path
- `parseToolId()` - Parses tool IDs back to method + path
- `sanitizeForToolId()` - Ensures safe characters only

### Parameter Location Handling

**Critical for Issue #50 fix**: The system tracks where parameters should be sent using `x-parameter-location` metadata:

- `path` - URL path parameters (e.g., `/users/{id}`)
- `query` - Query string parameters (e.g., `?page=1`)
- `header` - HTTP header parameters (e.g., `Authorization: Bearer token`)
- `cookie` - Cookie parameters

This metadata is set during tool creation in `openapi-loader.ts:546` and consumed during request execution in `api-client.ts:142-170`.

### Tools Loading Modes

Three distinct modes controlled by `toolsMode`:

1. **`"all"`** (default): Load all endpoint-based tools from OpenAPI spec, applying filters
2. **`"dynamic"`**: Load only meta-tools (`LIST-API-ENDPOINTS`, `GET-API-ENDPOINT-SCHEMA`, `INVOKE-API-ENDPOINT`)
3. **`"explicit"`**: Load only tools specified in `includeTools`, ignoring all other filters

### Tool Name Abbreviation

Tool names must be ≤64 characters with format `[a-z0-9-]+`. The abbreviation system (in `openapi-loader.ts` and `utils/abbreviations.ts`) applies:

1. Word splitting (camelCase, underscores, numbers)
2. Common word removal ("controller", "api", "service", etc.)
3. Standard abbreviations ("management" → "mgmt", "user" → "usr")
4. Vowel removal for long words
5. Hash suffix if needed

Disable with `disableAbbreviation: true` (may cause errors if names exceed 64 chars).

### Authentication System

Two approaches:

**Static headers** (backward compatible):
```typescript
const config = { headers: { Authorization: "Bearer token" } }
// Creates StaticAuthProvider internally
```

**Dynamic AuthProvider** (for token refresh, expiration handling):
```typescript
interface AuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>  // Called before each request
  handleAuthError(error: AxiosError): Promise<boolean>  // Called on 401/403, return true to retry
}
```

Key flow: Before each request → `getAuthHeaders()` → On 401/403 → `handleAuthError()` → If returns true, retry once with fresh headers.

### OpenAPI Processing

**Reference resolution**: Handles `$ref` pointers to components (parameters, schemas), detects circular references.

**Schema composition**: Supports `allOf` (merges schemas), `oneOf`/`anyOf` (preserves composition), `not`.

**Input schema generation**: Merges path/query/header/cookie parameters + request body into unified schema. Handles naming conflicts by prefixing body properties with `body_`.

**Parameter inheritance**: Path-level parameters are inherited by all operations, operation-level parameters can override.

## Testing Strategy

Tests use Vitest with comprehensive coverage across:

- **Unit tests**: Individual functions and classes
- **Integration tests**: Component interactions
- **Edge case tests**: Boundary conditions and errors
- **Regression tests**: Prevent known issues (e.g., Issue #33, Issue #50)

Key test files match source files: `api-client.test.ts` tests `api-client.ts`, etc.

Each major feature or bug fix should have dedicated test cases with descriptive names referencing the issue number (e.g., "Issue #50: Header Parameter Support").

## Filter System

Filters are applied in order with AND logic:

1. **`includeTools`** (highest priority) - If specified, overrides all others
2. **`includeOperations`** - HTTP methods (get, post, etc.)
3. **`includeResources`** - Resource names extracted from paths
4. **`includeTags`** - OpenAPI tags

All filtering is **case-insensitive**.

Exception: In **`explicit` mode**, only `includeTools` is used, all others are ignored.

## Important File Locations

- **Configuration**: `src/config.ts` - Loads from env vars and CLI args
- **CLI entry**: `src/cli.ts` - Command-line interface
- **Transport**: `src/transport/StreamableHttpServerTransport.ts` - HTTP transport with SSE
- **Examples**: `examples/` directory - Real-world usage patterns
- **Developer docs**: `docs/developer-guide.md` - Comprehensive architecture guide

## Common Development Patterns

### Adding New Parameter Location Support

When adding support for new parameter locations (like the header fix for Issue #50):

1. Update `openapi-loader.ts` to set `x-parameter-location` metadata
2. Update `api-client.ts` to extract and handle the parameter type
3. Add comprehensive tests covering GET/POST requests, mixed parameters, and auth header merging
4. Ensure parameters are removed from the main params object after extraction

### Adding New Tool Metadata

When adding metadata to `ExtendedTool` interface:

1. Define property in `openapi-loader.ts` interface
2. Populate during tool creation in `parseOpenAPISpec()`
3. Use in filtering logic in `tools-manager.ts`
4. Add tests for filter behavior

### Working with OpenAPI References

When processing `$ref`:

1. Always handle both reference objects and schema objects
2. Pass `components` and `visited` set for cycle detection
3. Return empty schema for unresolvable references
4. Use `inlineSchema()` helper for recursive resolution

## Project Structure Notes

- `src/` - TypeScript source files
- `test/` - Test files (mirror `src/` structure)
- `dist/` - Built output (created by build process)
- `bin/mcp-server.js` - CLI executable entry point
- `build.js` - esbuild configuration for bundling
- `examples/` - Complete runnable examples for different use cases
