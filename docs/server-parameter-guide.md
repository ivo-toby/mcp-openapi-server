# StreamableHttpServerTransport Server Parameter

## Overview

The `StreamableHttpServerTransport` constructor now accepts an optional `server` parameter, allowing you to pass in an existing `http.Server` instance or let it create one automatically.

## Constructor Signature

```typescript
constructor(
  port: number,
  host: string = "127.0.0.1",
  endpointPath: string = "/mcp",
  server?: http.Server | null
)
```

## Usage Examples

### Example 1: Default Behavior (No Server Passed)

When you don't pass a server parameter, the transport creates a new HTTP server internally:

```typescript
import { StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp');
await transport.start();
```

### Example 2: Passing `null`

Explicitly passing `null` also creates a new HTTP server:

```typescript
import { StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp', null);
await transport.start();
```

### Example 3: Using an Existing HTTP Server

You can pass an existing `http.Server` instance to reuse it:

```typescript
import http from 'http';
import { StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

// Create a custom HTTP server with additional middleware or routes
const customServer = http.createServer((req, res) => {
  // Your custom logic here
  console.log(`Request received: ${req.method} ${req.url}`);
});

// Pass the custom server to the transport
const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp', customServer);
await transport.start();
```

### Example 4: Sharing a Server with Express

```typescript
import express from 'express';
import http from 'http';
import { StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server';

const app = express();

// Add your Express routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Create HTTP server from Express app
const server = http.createServer(app);

// Use the same server for MCP transport
const transport = new StreamableHttpServerTransport(3000, '127.0.0.1', '/mcp', server);
await transport.start();

console.log('Server running on http://localhost:3000');
console.log('Express API available at /api/*');
console.log('MCP endpoint available at /mcp');
```

## Benefits

- **Flexibility**: Reuse existing HTTP servers in your application
- **Integration**: Easily integrate MCP transport with existing web frameworks (Express, Fastify, etc.)
- **Backward Compatibility**: Existing code continues to work without any changes
- **Resource Efficiency**: Share a single HTTP server across multiple services

## Notes

- When passing an existing server, make sure it's not already listening on a port
- The transport will call `server.listen()` during `start()`, so the server should not be started before passing it to the transport
- When `close()` is called, the transport will close the HTTP server
