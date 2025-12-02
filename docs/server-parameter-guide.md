# StreamableHttpServerTransport Server Parameter

## Overview

The `StreamableHttpServerTransport` constructor accepts an optional `server` parameter to pass an existing `http.Server` instance.

```typescript
constructor(
  port: number,
  host: string = "127.0.0.1",
  endpointPath: string = "/mcp",
  server?: http.Server
)
```

## Usage Examples

### Basic Usage

```typescript
import { OpenAPIServer, StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

const config = {
  name: "my-api-server",
  version: "1.0.0",
  apiBaseUrl: "https://api.example.com",
  openApiSpec: "https://api.example.com/openapi.json",
  specInputMethod: "url" as const,
  transportType: "http" as const,
  httpPort: 3000,
  httpHost: "127.0.0.1",
  endpointPath: "/mcp",
  toolsMode: "all" as const,
};

const server = new OpenAPIServer(config);
const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp');

await server.start(transport);
```

### With External HTTP Server

```typescript
import http from 'http';
import { OpenAPIServer, StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

// Define your config
const config = {
  name: "my-api-server",
  version: "1.0.0",
  apiBaseUrl: "https://api.example.com",
  openApiSpec: "https://api.example.com/openapi.json",
  specInputMethod: "url" as const,
  transportType: "http" as const,
  toolsMode: "all" as const,
};

const externalServer = http.createServer((req, res) => {
  if (req.url === "/api/custom") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ custom: true }));
  }
  // Other requests handled by MCP transport
});

const server = new OpenAPIServer(config);
const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp', externalServer);

await server.start(transport);
```

### With Express

```typescript
import express from 'express';
import http from 'http';
import { OpenAPIServer, StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

// Define your config
const config = {
  name: "my-api-server",
  version: "1.0.0",
  apiBaseUrl: "https://api.example.com",
  openApiSpec: "https://api.example.com/openapi.json",
  specInputMethod: "url" as const,
  transportType: "http" as const,
  toolsMode: "all" as const,
};

const app = express();
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const httpServer = http.createServer(app);
const server = new OpenAPIServer(config);
const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp', httpServer);

await server.start(transport);
```

## Notes

- When using an external server, you can either:
  - Let the transport start it by calling `start()`, or
  - Manually start the external server before calling `start()`, in which case you should handle the `EADDRINUSE` error or skip calling `start()`.
- In external server mode, non-MCP routes pass through to your handlers
- `/health` endpoint is always available
