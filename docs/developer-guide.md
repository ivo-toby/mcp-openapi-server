# Developer Guide

This guide provides comprehensive documentation for developers working with or contributing to the `@ivotoby/openapi-mcp-server` codebase. It covers key concepts, internal architecture, and development workflows.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Concepts](#core-concepts)
- [Tool ID System](#tool-id-system)
- [Tool Name Abbreviation System](#tool-name-abbreviation-system)
- [Resource Name Extraction](#resource-name-extraction)
- [Filtering System](#filtering-system)
- [Authentication System](#authentication-system)
- [OpenAPI Processing](#openapi-processing)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Contributing](#contributing)

## Architecture Overview

The MCP OpenAPI Server consists of several key components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenAPIServer │    │   ToolsManager  │    │ OpenAPISpecLoader│
│                 │    │                 │    │                 │
│ - Server setup  │───▶│ - Tool filtering│───▶│ - Spec parsing  │
│ - Transport mgmt│    │ - Tool lookup   │    │ - Tool creation │
│ - Request routing│   │ - Tool metadata │    │ - Schema processing│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    ApiClient    │    │   AuthProvider  │    │   Tool ID Utils │
│                 │    │                 │    │                 │
│ - HTTP requests │    │ - Dynamic auth  │    │ - ID generation │
│ - Parameter     │    │ - Token refresh │    │ - ID parsing    │
│   handling      │    │ - Error recovery│    │ - Hyphen escaping│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Concepts

### ExtendedTool Interface

The server extends the standard MCP `Tool` interface with metadata for efficient filtering:

```typescript
interface ExtendedTool extends Tool {
  /** OpenAPI tags associated with this tool's operation */
  tags?: string[]
  /** HTTP method for this tool (GET, POST, etc.) */
  httpMethod?: string
  /** Primary resource name extracted from the path */
  resourceName?: string
  /** Original OpenAPI path before toolId conversion */
  originalPath?: string
}
```

This metadata is computed during tool creation and enables efficient filtering without re-parsing tool IDs or accessing the raw OpenAPI specification.

### Tools Loading Modes

The server supports three distinct tools loading modes:

1. **`"all"` (default)**: Load all tools from the OpenAPI spec, applying any specified filters
2. **`"dynamic"`**: Load only meta-tools for API exploration (`list-api-endpoints`, `get-api-endpoint-schema`, `invoke-api-endpoint`)
3. **`"explicit"`**: Load only tools explicitly listed in `includeTools`, ignoring all other filters

## Tool ID System

### Overview

Tool IDs uniquely identify API endpoints and have the format: `METHOD::pathPart`

Examples:

- `GET::users` → GET /users
- `POST::api__v1__users` → POST /api/v1/users
- `GET::api__resource-name__items` → GET /api/resource-name/items

### Path Separation Scheme

**Critical for developers**: The tool ID system uses double underscores (`__`) as a separator for path segments. This approach is robust and avoids the complexities of hyphen-escaping schemes.

#### The Problem (Simplified)

OpenAPI paths (e.g., `/api/v1/users`, `/api/resource-name/items`) need to be converted into a flat string format for tool IDs. A clear separator is needed to distinguish between different segments of the original path. Legitimate hyphens within path segments (e.g., `resource-name`) must be preserved.

#### The Solution

- **Double underscores (`__`)** are used to replace slashes (`/`) from the original path.
- **Legitimate hyphens** within path segments are preserved as-is.

#### Examples

| Original Path              | Tool ID                          | Parsed Back                |
| -------------------------- | -------------------------------- | -------------------------- |
| `/users`                   | `GET::users`                     | `/users`                   |
| `/api/v1/users`            | `GET::api__v1__users`            | `/api/v1/users`            |
| `/api/resource-name/items` | `GET::api__resource-name__items` | `/api/resource-name/items` |
| `/user-profile/data`       | `GET::user-profile__data`        | `/user-profile/data`       |
| `/a_b/c-d/e_f-g`           | `GET::a_b__c-d__e_f-g`           | `/a_b/c-d/e_f-g`           |

#### Implementation Details

**Generation (`generateToolId`)**:

```typescript
const cleanPath = path
  .replace(/^\//, "") // Remove leading slash
  .replace(/\/+/g, "/") // Collapse multiple consecutive slashes to single slash
  .replace(/\{([^}]+)\}/g, "$1") // Remove curly braces from path params
  .replace(/\//g, "__") // Convert slashes to double underscores

const sanitizedPath = sanitizeForToolId(cleanPath) // Apply further sanitization

return `${method.toUpperCase()}::${sanitizedPath}`
```

**Parsing (`parseToolId`)**:

```typescript
const [method, pathPart] = toolId.split("::", 2)
// Simply replace double underscores with slashes
const path = pathPart.replace(/__/g, "/")
return { method, path: "/" + path }
```

#### Character Sanitization

Tool IDs are sanitized by the `sanitizeForToolId` helper function to ensure they contain only safe characters `[A-Za-z0-9_-]`. The process involves:

- **Removing disallowed characters**: Any character not in `A-Za-z0-9_-` is removed.
- **Collapsing underscores**: Sequences of three or more underscores (`___`, `____`, etc.) are collapsed to a double underscore (`__`). This preserves the `__` path separator if an original path segment happened to contain multiple underscores that were then joined by `__`.
- **Trimming**: Leading or trailing underscores (`_`) and hyphens (`-`) are removed from the final sanitized path part.
- **Original path structure**: Note that operations like collapsing multiple slashes (`//` to `/`) in the original path happen _before_ sanitization during the `generateToolId`'s path cleaning phase.

#### Known Limitations

(This section can be removed as the previous limitations were specific to the hyphen-escaping scheme. The double underscore system is much simpler and avoids those issues. If new limitations are identified, they can be added here.)

## Tool Name Abbreviation System

### Overview

Tool names are generated from OpenAPI `operationId`, `summary`, or fallback patterns and must be ≤64 characters with format `[a-z0-9-]+`.

### Abbreviation Process

The abbreviation system follows a multi-step process:

1. **Initial Sanitization**: Replace non-alphanumeric characters with hyphens
2. **Word Splitting**: Split by underscores, camelCase, and numbers
3. **Common Word Removal**: Remove words like "controller", "api", "service"
4. **Standard Abbreviations**: Apply predefined abbreviations
5. **Vowel Removal**: For long words (>5 chars) that aren't abbreviations
6. **Truncation & Hashing**: Add hash suffix if original was long or result exceeds limit

### Common Words Removed

```typescript
const REVISED_COMMON_WORDS_TO_REMOVE = [
  "controller",
  "api",
  "operation",
  "handler",
  "endpoint",
  "action",
  "perform",
  "execute",
  "retrieve",
  "specify",
  "for",
  "and",
  "the",
  "with",
  "from",
  "into",
  "onto",
  "out",
]
```

### Standard Abbreviations

```typescript
const WORD_ABBREVIATIONS = {
  service: "Svc",
  user: "Usr",
  management: "Mgmt",
  authority: "Auth",
  group: "Grp",
  update: "Upd",
  delete: "Del",
  create: "Crt",
  configuration: "Config",
  resource: "Res",
  authentication: "Authn", // ... and more
}
```

### Examples

| Original                                                            | Process                                   | Result                                     |
| ------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| `getUserDetails`                                                    | get-user-details                          | `get-user-details`                         |
| `ServiceUsersManagementController_updateServiceUsersAuthorityGroup` | Split → Remove common → Abbreviate → Hash | `svc-usrs-mgmt-upd-svc-usrs-auth-grp-a1b2` |
| `UpdateUserConfigurationManagement`                                 | Split → Abbreviate                        | `upd-usr-config-mgmt`                      |

### Disabling Abbreviation

Set `disableAbbreviation: true` to disable the abbreviation system:

- No common word removal
- No standard abbreviations
- No vowel removal
- No length limits (may cause errors if names exceed 64 characters)

## Resource Name Extraction

### Algorithm

Resource names are extracted from OpenAPI paths for filtering purposes:

```typescript
private extractResourceName(path: string): string | undefined {
  const segments = path.replace(/^\//, "").split("/")

  // Find the last non-parameter segment
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    if (!segment.includes("{") && !segment.includes("}") && segment.length > 0) {
      return segment
    }
  }

  return segments[0] || undefined
}
```

### Examples

| Path                            | Resource Name |
| ------------------------------- | ------------- |
| `/users`                        | `users`       |
| `/users/{id}`                   | `users`       |
| `/api/v1/users/{id}/posts`      | `posts`       |
| `/api/v1/user-profile-settings` | `settings`    |
| `/health`                       | `health`      |

## Filtering System

### Filter Application Order

Filters are applied in a specific order with different precedence:

1. **`excludeTags`** (hard deny): If a tool has any excluded OpenAPI tag, it is removed before include filters are applied.
2. **`includeTools`**: If specified, selects only matching tool IDs or names after excluded tags have been removed, then bypasses the remaining include filters.
3. **`includeOperations`**: When `includeTools` is not set, filter by HTTP methods (AND operation with remaining filters)
4. **`includeResources`**: When `includeTools` is not set, filter by resource names (AND operation)
5. **`includeTags`**: When `includeTools` is not set, filter by OpenAPI tags (AND operation)

`excludeTags` is a tool-surface filter, not an authorization mechanism. Untagged endpoints pass the exclude filter, so sensitive operations still need upstream API authorization and correct OpenAPI tags.

### Filter Modes

#### All Mode (default)

```typescript
toolsMode: "all"
// Apply filters as AND operations after excludeTags removes denied tools
// Empty filter arrays = no filtering for that dimension
```

#### Explicit Mode

```typescript
toolsMode: "explicit"
includeTools: ["GET::users", "POST::users"]
// ONLY load explicitly listed tools
// Ignore includeTags, includeResources, and includeOperations
// Still apply excludeTags as a deny filter
```

#### Dynamic Mode

```typescript
toolsMode: "dynamic"
// Load only meta-tools:
// - list-api-endpoints
// - get-api-endpoint-schema
// - invoke-api-endpoint
// excludeTags filters discovery responses and blocks matching dynamic invocations
```

### Case Sensitivity

All filtering is **case-insensitive**:

- Tool IDs: `GET::Users` matches filter `get::users`
- Tool names: `getUsers` matches filter `getusers`
- Resource names: `Users` matches filter `users`
- Tags: `ADMIN` matches filter `admin`
- HTTP methods: `GET` matches filter `get`

## Authentication System

### AuthProvider Interface

```typescript
interface AuthProvider {
  /**
   * Get authentication headers for the current request
   * Called before each API request to get fresh headers
   */
  getAuthHeaders(): Promise<Record<string, string>>

  /**
   * Handle authentication errors from API responses
   * Called when the API returns 401 or 403 errors
   * Return true to retry the request, false otherwise
   */
  handleAuthError(error: AxiosError): Promise<boolean>
}
```

### Authentication Flow

1. **Before each request**: `getAuthHeaders()` is called
2. **On auth errors (401/403)**: `handleAuthError()` is called
3. **If `handleAuthError()` returns `true`**: Request is retried once with fresh headers
4. **If `handleAuthError()` returns `false`**: Error is propagated to user

### Static vs Dynamic Authentication

**Static Authentication** (backward compatible):

```typescript
const config = {
  headers: { Authorization: "Bearer token" },
}
// Internally creates StaticAuthProvider
```

**Dynamic Authentication**:

```typescript
const config = {
  authProvider: new MyAuthProvider(),
  // No headers property when using AuthProvider
}
```

## OpenAPI Processing

### Reference Resolution

The server resolves OpenAPI `$ref` references:

- **Parameter references**: `$ref: "#/components/parameters/MyParam"`
- **Schema references**: `$ref: "#/components/schemas/MySchema"`
- **Recursive references**: Circular reference detection prevents infinite loops
- **External references**: Gracefully handled (returns empty schema)

### Schema Composition

Supports OpenAPI schema composition keywords:

- **`allOf`**: Schemas are merged into a single object
- **`oneOf`/`anyOf`**: Composition is preserved in the input schema
- **`not`**: Preserved as-is in the input schema

### Parameter Inheritance

Path-level parameters are inherited by operations:

- **Path parameters** are added to all operations in the path
- **Operation parameters** can override path parameters (same name + location)
- **Merging logic** combines both sets without duplication

### Input Schema Generation

The server creates unified input schemas by merging:

1. **Path parameters** (from URL path)
2. **Query parameters** (from URL query string)
3. **Header parameters** (with `x-parameter-location: "header"`)
4. **Cookie parameters** (with `x-parameter-location: "cookie"`)
5. **Request body** (flattened into schema or wrapped in `body` property)

### Content Type Handling

For request bodies with multiple content types:

- **Priority**: `application/json` > `application/x-www-form-urlencoded` > `multipart/form-data` > others
- **File uploads**: `multipart/form-data` with `type: string, format: binary`

## Development Workflow

### Setup

```bash
git clone <repository>
cd mcp-openapi-server
npm install
```

### Development Commands

```bash
npm run dev              # Watch mode with auto-rebuild
npm run inspect-watch    # Debug mode with auto-reload
npm run build           # Build TypeScript
npm run typecheck       # Type checking only
npm run lint            # ESLint
npm run test            # Run tests
npm run test:watch      # Watch mode tests
npm run clean           # Remove build artifacts
```

### Project Structure

```
src/
├── config.ts           # Configuration loading and validation
├── server.ts           # Main OpenAPIServer class
├── tools-manager.ts    # Tool filtering and management
├── openapi-loader.ts   # OpenAPI spec parsing and tool creation
├── api-client.ts       # HTTP client for API requests
├── auth-provider.ts    # Authentication interfaces and implementations
├── transport-http.ts   # HTTP transport implementation
└── utils/
    ├── tool-id.ts      # Tool ID generation and parsing
    └── abbreviations.ts # Name abbreviation rules

test/
├── *.test.ts          # Unit tests for each module
└── fixtures/          # Test data and mock OpenAPI specs

docs/
├── developer-guide.md  # This document
├── auth-provider-guide.md # AuthProvider documentation
└── plans/             # Development plans and improvements

examples/
├── basic-library-usage/    # Simple library usage example
├── auth-provider-example/  # AuthProvider implementations
└── beatport-example/       # Real-world production example
```

## Testing Guidelines

### Test Organization

Tests are organized by module with comprehensive coverage:

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test component interactions
- **Edge case tests**: Test error conditions and boundary cases
- **Regression tests**: Prevent known issues from reoccurring

### Key Testing Areas

1. **Tool ID System**: Round-trip consistency, hyphen escaping, edge cases
2. **Abbreviation System**: All processing steps, edge cases, hash generation
3. **Filtering Logic**: All filter combinations, precedence, case sensitivity
4. **OpenAPI Processing**: Reference resolution, schema composition, parameter inheritance
5. **Authentication**: Static and dynamic auth, error handling, retry logic

### Running Tests

```bash
npm test                    # All tests
npm test -- --watch        # Watch mode
npm test tool-id-utils     # Specific test file
npm test -- --coverage     # Coverage report
```

### Test Patterns

**Parameterized tests** for comprehensive coverage:

```typescript
const testCases = [
  { input: "GET::users", expected: { method: "GET", path: "/users" } },
  { input: "POST::api-v1-users", expected: { method: "POST", path: "/api/v1/users" } },
]

for (const { input, expected } of testCases) {
  const result = parseToolId(input)
  expect(result).toEqual(expected)
}
```

**Mock management** for isolated testing:

```typescript
const mockSpecLoader = {
  loadOpenAPISpec: vi.fn(),
  parseOpenAPISpec: vi.fn(),
}
```

## Contributing

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier with project configuration
- **Linting**: ESLint with TypeScript rules
- **Naming**: camelCase for variables/functions, PascalCase for classes, kebab-case for files

### Documentation Standards

Follow Google's Technical Writing Style Guide:

- Use active voice and present tense
- Write clear, concise sentences
- Define terminology when needed
- Use lists and tables for complex information
- Include examples for all concepts

### JSDoc Requirements

All code must have comprehensive JSDoc documentation:

```typescript
/**
 * Parse a tool ID into HTTP method and path
 *
 * Tool IDs have the format: METHOD::pathPart where pathPart has slashes
 * converted to hyphens and legitimate hyphens escaped as double hyphens.
 *
 * @param toolId - Tool ID in format METHOD::pathPart
 * @returns Object containing method and path
 *
 * @example
 * parseToolId("GET::users") → { method: "GET", path: "/users" }
 * parseToolId("GET::api__resource-name__items") → { method: "GET", path: "/api/resource-name/items" }
 */
```

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch from `main`
3. **Implement** changes with tests
4. **Run** `npm run typecheck && npm run lint && npm test`
5. **Update** documentation if needed
6. **Submit** pull request with clear description

### Commit Message Format

Follow conventional commit format:

```
feat: add support for OpenAPI 3.1 specifications

- Implement OpenAPI 3.1 parser compatibility
- Add tests for new specification features
- Update documentation with 3.1 examples

Closes #123
```

### Adding New Features

When adding new features:

1. **Design**: Consider backward compatibility
2. **Test**: Add comprehensive test coverage
3. **Document**: Update relevant documentation
4. **Examples**: Add usage examples if applicable
5. **Performance**: Consider impact on existing functionality

This developer guide should be updated as the codebase evolves to ensure it remains accurate and comprehensive.
