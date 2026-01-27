# Examples

This directory contains comprehensive examples demonstrating how to use `@ivotoby/openapi-mcp-server` as a library to create dedicated MCP servers for specific APIs.

## Overview

The `@ivotoby/openapi-mcp-server` package can be used in two ways:

1. **CLI Tool**: Use `npx @ivotoby/openapi-mcp-server` directly with command-line arguments
2. **Library**: Import and use the `OpenAPIServer` class in your own Node.js applications

These examples focus on the **library usage**, showing how to create dedicated, customized MCP servers for specific APIs.

## Examples Included

### 1. [Basic Library Usage](./basic-library-usage/)

**Purpose**: Demonstrates the simplest way to use the library with static authentication.

**Key Features**:

- Basic `OpenAPIServer` configuration
- Static header authentication
- Stdio transport for Claude Desktop integration
- Minimal setup for quick prototyping

**When to use**: When you have a simple API with static authentication and want to get started quickly.

### 2. [AuthProvider Example](./auth-provider-example/)

**Purpose**: Showcases the `AuthProvider` interface for dynamic authentication scenarios.

**Key Features**:

- Multiple AuthProvider implementations (Refreshable, Manual, API Key)
- Token expiration handling
- Authentication error recovery
- Dynamic header generation

**When to use**: When your API requires token refresh, has expiring tokens, or needs complex authentication logic.

### 3. [Custom Tools Example](./custom-tools-example/)

**Purpose**: Demonstrates how to extend an OpenAPI server with custom tools, prompts, and resources.

**Key Features**:

- Custom utility tools (base64 encode/decode, UUID generation, JSON formatting)
- Configuration-based tool definition
- Programmatic tool registration
- Custom prompts for common workflows
- Custom resources with documentation
- Integration of custom and auto-generated tools

**When to use**: When you need to add utility functions, data transformations, or workflow helpers alongside your API endpoints.

### 4. [Beatport Example](./beatport-example/)

**Purpose**: Real-world implementation for the Beatport API demonstrating production-ready patterns.

**Key Features**:

- Custom AuthProvider for manual token management
- API endpoint filtering and optimization
- Comprehensive error handling with user guidance
- Production-ready packaging and distribution

**When to use**: As a template for creating production-ready MCP servers for specific APIs.

## Key Concepts Demonstrated

### Library vs CLI Usage

**CLI Usage** (what most users start with):

```bash
npx @ivotoby/openapi-mcp-server \
  --api-base-url https://api.example.com \
  --openapi-spec https://api.example.com/openapi.json \
  --headers "Authorization:Bearer token"
```

**Library Usage** (what these examples show):

```typescript
import { OpenAPIServer } from "@ivotoby/openapi-mcp-server"

const server = new OpenAPIServer({
  name: "my-api-server",
  apiBaseUrl: "https://api.example.com",
  openApiSpec: "https://api.example.com/openapi.json",
  headers: { Authorization: "Bearer token" },
})
```

### AuthProvider Interface

The `AuthProvider` interface enables dynamic authentication:

```typescript
interface AuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>
  handleAuthError(error: AxiosError): Promise<boolean>
}
```

**Benefits**:

- Fresh headers for each request
- Token expiration handling
- Authentication error recovery
- Runtime token updates

### Custom Tools, Prompts, and Resources

The library supports extending auto-generated OpenAPI tools with custom functionality:

```typescript
// Register a custom tool
server.registerTool("my-tool", {
  description: "Custom utility function",
  inputSchema: { type: "object", properties: { /* ... */ } },
  handler: async (args) => {
    return { content: [{ type: "text", text: "result" }] }
  }
})

// Register a prompt
server.registerPrompt({
  name: "my-prompt",
  template: "Do {{action}} with {{data}}",
  arguments: [/* ... */]
})

// Register a resource
server.registerResource({
  uri: "docs://my-doc",
  name: "my-doc",
  mimeType: "text/markdown",
  text: "# Documentation..."
})
```

**Benefits**:

- Add utility functions alongside API endpoints
- Create workflow templates
- Provide inline documentation
- Extend API functionality

### Configuration Options

All examples demonstrate different configuration patterns:

- **Transport Types**: Stdio (Claude Desktop) vs HTTP (web clients)
- **Tool Loading**: All endpoints vs filtered subsets vs dynamic meta-tools
- **Authentication**: Static headers vs dynamic AuthProvider
- **API Filtering**: Include/exclude specific endpoints, operations, or tags
- **Custom Extensions**: Custom tools, prompts, and resources

## Getting Started

### 1. Choose Your Pattern

- **Simple API with static auth** → Start with [Basic Library Usage](./basic-library-usage/)
- **API with token expiration** → Use [AuthProvider Example](./auth-provider-example/)
- **Production deployment** → Follow [Beatport Example](./beatport-example/) patterns

### 2. Copy and Customize

Each example is a complete, standalone project:

1. Copy the example directory
2. Update `package.json` with your details
3. Modify the configuration for your API
4. Implement custom authentication if needed
5. Build and deploy

### 3. Package for Distribution

Examples show how to create distributable packages:

```json
{
  "name": "my-api-mcp-server",
  "bin": {
    "my-api-mcp-server": "dist/index.js"
  }
}
```

Users can then install and use your server:

```bash
npx my-api-mcp-server
```

## Common Patterns

### Static Authentication

```typescript
const config = {
  // ... other config
  headers: {
    Authorization: "Bearer token",
    "X-API-Key": "key",
  },
}
```

### Dynamic Authentication

```typescript
const authProvider = new MyAuthProvider()
const config = {
  // ... other config
  authProvider: authProvider,
}
```

### API Filtering

```typescript
const config = {
  // ... other config
  includeOperations: ["get", "post"],
  includeResources: ["users", "posts"],
  includeTags: ["public"],
}
```

### Error Handling

```typescript
class MyAuthProvider implements AuthProvider {
  async handleAuthError(error: AxiosError): Promise<boolean> {
    if (error.response?.status === 401) {
      // Provide clear instructions
      throw new Error("Token expired. Please...")
    }
    return false
  }
}
```

## Benefits of Library Usage

### 1. Customization

- Custom authentication logic
- API-specific optimizations
- Custom error handling
- Additional tools and features

### 2. Distribution

- Package as standalone npm modules
- Version control and updates
- Easy installation for users
- Professional deployment

### 3. Integration

- Embed in larger applications
- Custom transport implementations
- Integration with existing auth systems
- Custom middleware and processing

### 4. Maintenance

- API-specific documentation
- Tailored user experience
- Focused feature set
- Better error messages

## Next Steps

1. **Explore the Examples**: Start with the basic example and work your way up
2. **Read the Documentation**: Check the main README for all configuration options
3. **Implement Your API**: Use the patterns to create your own dedicated server
4. **Share Your Work**: Consider publishing your server for others to use

## Contributing

Found a useful pattern or want to add an example? Contributions are welcome!

- Add new examples for different authentication patterns
- Improve existing examples with better error handling
- Add examples for specific popular APIs
- Document advanced configuration patterns
