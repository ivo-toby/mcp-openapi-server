# OpenAPI MCP Server

A Model Context Protocol (MCP) server that exposes OpenAPI endpoints as MCP resources. This server allows Large Language Models to discover and interact with REST APIs defined by OpenAPI specifications through the MCP protocol.

## Overview

This MCP server supports two transport methods:

1. **Stdio Transport** (default): For direct integration with AI systems like Claude Desktop that manage MCP connections through standard input/output.
2. **Streamable HTTP Transport**: For connecting to the server over HTTP, allowing web clients and other HTTP-capable systems to use the MCP protocol.

## Quick Start for Users

### Option 1: Using with Claude Desktop (Stdio Transport)

No need to clone this repository. Simply configure Claude Desktop to use this MCP server:

1. Locate or create your Claude Desktop configuration file:

   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add the following configuration:

```json
{
  "mcpServers": {
    "openapi": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "API_BASE_URL": "https://api.example.com",
        "OPENAPI_SPEC_PATH": "https://api.example.com/openapi.json",
        "API_HEADERS": "Authorization:Bearer token123,X-API-Key:your-api-key"
      }
    }
  }
}
```

3. Replace the environment variables with your actual API configuration:
   - `API_BASE_URL`: The base URL of your API
   - `OPENAPI_SPEC_PATH`: URL or path to your OpenAPI specification
   - `API_HEADERS`: Comma-separated key:value pairs for API authentication headers

### Option 2: Using with HTTP Clients (HTTP Transport)

To use the server with HTTP clients:

1. No installation required! Use npx to run the package directly:

```bash
npx @ivotoby/openapi-mcp-server \
  --api-base-url https://api.example.com \
  --openapi-spec https://api.example.com/openapi.json \
  --headers "Authorization:Bearer token123" \
  --transport http \
  --port 3000
```

2. Interact with the server using HTTP requests:

```bash
# Initialize a session (first request)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"client":{"name":"curl-client","version":"1.0.0"},"protocol":{"name":"mcp","version":"2025-03-26"}}}'

# The response includes a Mcp-Session-Id header that you must use for subsequent requests

# Open a streaming connection for server responses
curl -N http://localhost:3000/mcp -H "Mcp-Session-Id: your-session-id"

# Send a request to list tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: your-session-id" \
  -d '{"jsonrpc":"2.0","id":2,"method":"listTools"}'

# Terminate the session when done
curl -X DELETE http://localhost:3000/mcp -H "Mcp-Session-Id: your-session-id"
```

## Transport Types

### Stdio Transport (Default)

The stdio transport is designed for direct integration with AI systems like Claude Desktop that manage MCP connections through standard input/output. This is the simplest setup and requires no network configuration.

**When to use**: When integrating with Claude Desktop or other systems that support stdio-based MCP communication.

### Streamable HTTP Transport

The HTTP transport allows the MCP server to be accessed over HTTP, enabling web applications and other HTTP-capable clients to interact with the MCP protocol. It supports session management, streaming responses, and standard HTTP methods.

**Key features**:

- Session management with Mcp-Session-Id header
- Chunked HTTP streaming (without Server-Sent Events)
- Support for POST/GET/DELETE methods
- Security measures against DNS rebinding attacks

**When to use**: When you need to expose the MCP server to web clients or systems that communicate over HTTP rather than stdio.

## Configuration Options

The server can be configured through environment variables or command line arguments:

### Environment Variables

- `API_BASE_URL` - Base URL for the API endpoints
- `OPENAPI_SPEC_PATH` - Path or URL to OpenAPI specification
- `API_HEADERS` - Comma-separated key:value pairs for API headers
- `SERVER_NAME` - Name for the MCP server (default: "mcp-openapi-server")
- `SERVER_VERSION` - Version of the server (default: "1.0.0")
- `TRANSPORT_TYPE` - Transport type to use: "stdio" or "http" (default: "stdio")
- `HTTP_PORT` - Port for HTTP transport (default: 3000)
- `HTTP_HOST` - Host for HTTP transport (default: "127.0.0.1")
- `ENDPOINT_PATH` - Endpoint path for HTTP transport (default: "/mcp")

### Command Line Arguments

```bash
npx @ivotoby/openapi-mcp-server \
  --api-base-url https://api.example.com \
  --openapi-spec https://api.example.com/openapi.json \
  --headers "Authorization:Bearer token123,X-API-Key:your-api-key" \
  --name "my-mcp-server" \
  --version "1.0.0" \
  --transport http \
  --port 3000 \
  --host 127.0.0.1 \
  --path /mcp
```

## Security Considerations

- The HTTP transport validates Origin headers to prevent DNS rebinding attacks
- By default, HTTP transport only binds to localhost (127.0.0.1)
- If exposing to other hosts, consider implementing additional authentication

## Debugging

To see debug logs:

1. When using stdio transport with Claude Desktop:

   - Logs appear in the Claude Desktop logs

2. When using HTTP transport:
   ```bash
   npx @ivotoby/openapi-mcp-server --transport http 2>debug.log
   ```

## For Developers

### Development Tools

- `npm run build` - Builds the TypeScript source
- `npm run clean` - Removes build artifacts
- `npm run typecheck` - Runs TypeScript type checking
- `npm run lint` - Runs ESLint
- `npm run dev` - Watches source files and rebuilds on changes
- `npm run inspect-watch` - Runs the inspector with auto-reload on changes

### Development Workflow

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development environment: `npm run inspect-watch`
4. Make changes to the TypeScript files in `src/`
5. The server will automatically rebuild and restart

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting: `npm run typecheck && npm run lint`
5. Submit a pull request

## License

MIT
