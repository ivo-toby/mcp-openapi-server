# Plan: Implement Streamable HTTP Transport

This document outlines the steps to add a new **Streamable HTTP** transport to the `mcp-openapi-server` project, strictly following the MCP specification for Streamable HTTP (not using SSE).

## 1. Transport Interface Analysis

- Inspect the MCP SDK's `ServerTransport` interface to identify required methods (e.g., `connect`, `send`, `disconnect`).
- Review how `StdioServerTransport` implements these methods in `@modelcontextprotocol/sdk/server/stdio.js` to understand the contract.

## 2. Create Transport Class

- **File**: `src/transport/StreamableHttpServerTransport.ts`
- **Class**: `StreamableHttpServerTransport implements ServerTransport`
- **Constructor Parameters**:
  - `port: number`
  - `host: string` (default `'127.0.0.1'`)
  - `endpointPath: string` (e.g. `'/mcp'`)
- **Internal State**:
  - `sessions: Map<string, SessionData>` — maps `Mcp-Session-Id` to session info
  - Each `SessionData` holds:
    - `messageHandler: (msg: string) => void`
    - `activeResponses: Set<http.ServerResponse>` for streaming GET clients

## 3. Session Management

- On first client `POST /mcp` (InitializeRequest):

  1. Read and parse the JSON-RPC `InitializeRequest`.
  2. Generate a secure `sessionId` (UUIDv4).
  3. Store a new `SessionData` entry.
  4. Respond with `InitializeResult` JSON plus header `Mcp-Session-Id: <sessionId>`.
  5. Expect client to send an `InitializedNotification` as a separate POST.

- **Subsequent Requests**:

  - Validate `Mcp-Session-Id` header on each request; respond `400 Bad Request` if missing/invalid.

- **Session Termination**:
  - `DELETE /mcp` with valid `Mcp-Session-Id` header:
    - Clean up session data, close active streams, respond `204 No Content`.

## 4. HTTP Server & Endpoints

Use Node.js `http` module:

### POST /mcp

1. Read full request body as text.
2. Validate JSON-RPC format (non-null `id`, `method`, etc.).
3. Pass raw JSON string to stored `messageHandler` for that session.
4. For non-initialize calls, immediately respond `202 Accepted` to acknowledge receipt.

### GET /mcp

1. Validate `Mcp-Session-Id` header.
2. Set response headers:
   - `Content-Type: application/json`
   - `Transfer-Encoding: chunked`
   - `Connection: keep-alive`
3. Add response object to session's `activeResponses` set.
4. Keep the connection open; on each `send(message)`, write `${message}\n` to each response.
5. Clean up on client disconnect (`res.on('close', ...)`).

### DELETE /mcp

1. Validate session header.
2. Remove session, close all `activeResponses`, respond `204 No Content`.

## 5. Implement Transport Methods

- **`async connect(messageHandler: (msg: string) => void): Promise<void>`**

  - Store `messageHandler` in a new session on first initialize.
  - Start HTTP server listening on given host and port.

- **`async send(message: string): Promise<void>`**

  - On each invocation, iterate session's `activeResponses` and `res.write(message + '\n')`.

- **`async disconnect(): Promise<void>`**
  - Gracefully shut down HTTP server and clear sessions.

## 6. Integrate with `OpenAPIServer`

- Update `src/index.ts`:

  - Read new config options: `transportType`, `httpPort`, `httpHost`, `endpointPath`.
  - If `transportType === 'http'`, instantiate `StreamableHttpServerTransport`.
  - Else default to `StdioServerTransport`.

- Ensure `server.start(transport)` correctly calls `transport.connect(...)`.

## 7. Configuration Updates

- Modify `src/config.ts`:

  ```ts
  interface OpenAPIMCPServerConfig {
    // existing fields...
    transportType: "stdio" | "http"
    httpPort?: number
    httpHost?: string
    endpointPath?: string
  }

  yargs
    .option("transport", { choices: ["stdio", "http"], default: "stdio" })
    .option("port", { type: "number", default: 3000 })
    .option("host", { type: "string", default: "127.0.0.1" })
    .option("path", { type: "string", default: "/mcp" })
  ```

## 8. Security & Compliance

- Validate `Origin` header to prevent DNS rebinding.
- Bind default host to `localhost` for local usage.
- Implement size limits on POST bodies to prevent abuse.
- Ensure HTTPS support (via reverse proxy) for production.

## 9. Testing Strategy

- **Unit Tests**:

  - Mock HTTP server, simulate `POST`, `GET`, `DELETE` with/without valid headers.
  - Verify `connect`, `send`, and `disconnect` behavior.

- **Integration Tests**:
  - Start full server with HTTP transport.
  - Use HTTP client (e.g., `axios`) to perform JSON-RPC calls:
    - Initialize session, list tools, call tool, verify streaming responses.
    - Terminate session and verify 404 for subsequent calls.

## 10. Documentation

- Update `README.md` with:
  - Instructions for launching with `--transport http`.
  - Example curl commands for `POST`, `GET`, `DELETE` on `/mcp`.
  - Security recommendations (CORS, rate limiting).

---

This plan ensures full compliance with the Streamable HTTP transport section of the MCP spec, without using SSE, and provides a clear implementation roadmap.
