import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import {
  JSONRPCMessage,
  isInitializeRequest,
  isJSONRPCRequest,
  isJSONRPCResponse,
} from "@modelcontextprotocol/sdk/types.js"
import * as http from "http"
import { randomUUID } from "crypto"

/**
 * Session data for a connected client
 */
interface SessionData {
  messageHandler: (message: JSONRPCMessage) => void
  activeResponses: Set<http.ServerResponse>
  initialized: boolean
  pendingRequests: Set<string | number> // Track pending request IDs for this session
}

/**
 * StreamableHttpServerTransport implements the MCP Streamable HTTP transport.
 * It supports chunked HTTP responses (not using SSE) for streaming.
 *
 * This transport follows the MCP spec, including:
 * - Session management using Mcp-Session-Id header
 * - POST for client requests
 * - GET for streaming responses
 * - DELETE for session termination
 */
export class StreamableHttpServerTransport implements Transport {
  private server: http.Server
  private sessions: Map<string, SessionData> = new Map()
  private started = false
  private startTime = Date.now()
  private maxBodySize = 4 * 1024 * 1024 // 4MB max request size
  private requestSessionMap: Map<string | number, string> = new Map() // Maps request IDs to session IDs
  private readonly healthCheckPath = "/health"
  private readonly isExternalServer: boolean // Track if using an external server

  /**
   * Initialize a new StreamableHttpServerTransport
   *
   * @param port HTTP port to listen on
   * @param host Host to bind to (default: 127.0.0.1)
   * @param endpointPath Endpoint path (default: /mcp)
   * @param server Optional HTTP server instance. If not provided, a new server will be created.
   *               If provided, the transport will attach its request handler to the server.
   *               Note: When using an external server, all handlers added via server.on('request', handler)
   *               will be called for every request, in the order they were added. Custom handlers should be
   *               added FIRST and should fully handle their routes (including sending responses) to prevent
   *               further handlers from running for those requests. The MCP handler should be added after
   *               custom handlers and will return early for non-MCP paths.
   */
  constructor(
    private port: number,
    private host: string = "127.0.0.1",
    private endpointPath: string = "/mcp",
    server?: http.Server,
  ) {
    this.isExternalServer = !!server
    if (server) {
      // External server provided - attach our request handler to it
      this.server = server
      this.server.on("request", this.handleRequest.bind(this))
    } else {
      // No server provided - create a new one with handler bound
      this.server = http.createServer(this.handleRequest.bind(this))
    }
  }

  /**
   * Callback when message is received
   */
  onmessage?: (message: JSONRPCMessage) => void

  /**
   * Callback when error occurs
   */
  onerror?: (error: Error) => void

  /**
   * Callback when transport closes
   */
  onclose?: () => void

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Transport already started")
    }

    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        this.started = true
        console.error(
          `Streamable HTTP transport listening on http://${this.host}:${this.port}${this.endpointPath}`,
        )
        resolve()
      })

      this.server.on("error", (err) => {
        reject(err)
        if (this.onerror) {
          this.onerror(err)
        }
      })
    })
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    // Close all active sessions
    for (const session of this.sessions.values()) {
      for (const response of session.activeResponses) {
        try {
          response.end()
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          // Ignore errors from already closed connections
        }
      }
    }

    this.sessions.clear()

    // Skip closing the server if it's an external server - let the owner manage its lifecycle
    if (this.isExternalServer) {
      this.started = false
      if (this.onclose) {
        this.onclose()
      }
      return
    }

    // Close the server (only for internally-created servers)
    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        } else {
          this.started = false
          if (this.onclose) {
            this.onclose()
          }
          resolve()
        }
      })
    })
  }

  /**
   * Send message to client(s)
   *
   * @param message JSON-RPC message
   */
  async send(message: JSONRPCMessage): Promise<void> {
    console.error(`StreamableHttpServerTransport: Sending message: ${JSON.stringify(message)}`)
    let targetSessionId: string | undefined
    let messageIdForThisResponse: string | number | null = null

    if (isJSONRPCResponse(message) && message.id !== null) {
      messageIdForThisResponse = message.id
      targetSessionId = this.requestSessionMap.get(messageIdForThisResponse)
      console.error(
        `StreamableHttpServerTransport: Potential target session for response ID ${messageIdForThisResponse}: ${targetSessionId}`,
      )

      if (targetSessionId && this.initResponseHandlers.has(targetSessionId)) {
        console.error(
          `StreamableHttpServerTransport: Session ${targetSessionId} has initResponseHandlers. Invoking them for message ID ${messageIdForThisResponse}.`,
        )
        const handlers = this.initResponseHandlers.get(targetSessionId)!
        // Clone to safely iterate if handlers modify the collection (though removeInitResponseHandler handles this)
        ;[...handlers].forEach((handler) => handler(message))

        // If the request ID is no longer in the map, an initResponseHandler handled it (and removed it).
        if (!this.requestSessionMap.has(messageIdForThisResponse)) {
          console.error(
            `StreamableHttpServerTransport: Response for ID ${messageIdForThisResponse} was handled by an initResponseHandler (e.g., synchronous POST response for initialize or tools/list).`,
          )
          return // Exit, as response was sent on POST by the handler.
        } else {
          console.error(
            `StreamableHttpServerTransport: Response for ID ${messageIdForThisResponse} was NOT exclusively handled by an initResponseHandler or handler did not remove from requestSessionMap. Proceeding to GET stream / broadcast if applicable.`,
          )
        }
      }

      // If not handled by a synchronous initResponseHandler (like for initialize or tools/list),
      // or if the message is of a type that should always go to the stream after initial handling,
      // ensure the request ID is removed from the map as we are about to process it for streaming or completion.
      // This applies to standard request-responses that go to the GET stream.
      if (this.requestSessionMap.has(messageIdForThisResponse)) {
        console.error(
          `StreamableHttpServerTransport: Deleting request ID ${messageIdForThisResponse} from requestSessionMap as it's being processed for GET stream or broadcast.`,
        )
        this.requestSessionMap.delete(messageIdForThisResponse)
      }
    }

    // Standard logic for sending to GET stream or broadcasting notifications.
    // This block is reached if:
    // 1. It's a notification (messageIdForThisResponse is null, targetSessionId is undefined).
    // 2. It's a response that was NOT handled by an initResponseHandler (e.g. standard tool_call response).
    if (!targetSessionId) {
      const idForLog =
        messageIdForThisResponse !== null
          ? messageIdForThisResponse
          : isJSONRPCRequest(message)
            ? message.id
            : "N/A"
      console.warn(
        `StreamableHttpServerTransport: No specific target session for message (ID: ${idForLog}). Broadcasting to all applicable sessions.`,
      )
      for (const [sid, session] of this.sessions.entries()) {
        if (session.initialized && session.activeResponses.size > 0) {
          this.sendMessageToSession(sid, session, message)
        }
      }
      return
    }

    // If targetSessionId is known (it's a response to a request that was not handled synchronously by initResponseHandler)
    const session = this.sessions.get(targetSessionId)
    if (session && session.activeResponses.size > 0) {
      console.error(
        `StreamableHttpServerTransport: Sending message (ID: ${messageIdForThisResponse}) to GET stream for session ${targetSessionId} (${session.activeResponses.size} active connections).`,
      )
      this.sendMessageToSession(targetSessionId, session, message)
    } else if (targetSessionId) {
      // This case means a response was generated for a session, it wasn't handled by initResponseHandlers,
      // but the session has no active GET connections. The message might be lost for the client.
      console.error(
        `StreamableHttpServerTransport: No active GET connections for session ${targetSessionId} to send message (ID: ${messageIdForThisResponse}). Message might not be delivered if not handled by POST.`,
      )
    }
  }

  /**
   * Helper method to send a message to a specific session
   */
  private sendMessageToSession(
    sessionId: string,
    session: SessionData,
    message: JSONRPCMessage,
  ): void {
    const messageStr = `data: ${JSON.stringify(message)}\n\n`

    for (const response of session.activeResponses) {
      try {
        response.write(messageStr)
      } catch (err: unknown) {
        // Remove dead connections
        session.activeResponses.delete(response)
        if (this.onerror) {
          this.onerror(new Error(`Failed to write to response: ${(err as Error).message}`))
        }
      }
    }
  }

  /**
   * Handle health check request
   */
  private handleHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000) // uptime in seconds
    const healthResponse = {
      status: "healthy",
      activeSessions: this.sessions.size,
      uptime,
    }

    res.setHeader("Content-Type", "application/json")
    res.writeHead(200)
    res.end(JSON.stringify(healthResponse))
  }

  /**
   * Handle HTTP request
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Handle health check endpoint
    if (req.url === this.healthCheckPath) {
      this.handleHealthCheck(req, res)
      return
    }

    // Only handle requests to the MCP endpoint
    if (req.url !== this.endpointPath) {
      // If using external server, don't respond - let other handlers process the request
      if (this.isExternalServer) {
        return
      }
      // For internal server, respond with 404
      res.writeHead(404)
      res.end()
      return
    }

    // Validate origin header to prevent DNS rebinding attacks
    this.validateOrigin(req, res)

    switch (req.method) {
      case "POST":
        this.handlePostRequest(req, res)
        break
      case "GET":
        this.handleGetRequest(req, res)
        break
      case "DELETE":
        this.handleDeleteRequest(req, res)
        break
      default:
        // Method not allowed
        res.writeHead(405, { Allow: "POST, GET, DELETE" })
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Method not allowed",
            },
            id: null,
          }),
        )
    }
  }

  /**
   * Validate origin header to prevent DNS rebinding attacks
   */
  private validateOrigin(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const origin = req.headers.origin

    // Allow requests without origin (e.g., curl, non-browser clients)
    if (!origin) {
      return true
    }

    // In a production implementation, you would validate the origin against a whitelist
    // This is a simplified check that assumes local development
    try {
      const originUrl = new URL(origin)
      const isLocalhost = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1"

      if (!isLocalhost) {
        res.writeHead(403)
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Origin not allowed",
            },
            id: null,
          }),
        )
        return false
      }

      return true
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      res.writeHead(400)
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Invalid origin",
          },
          id: null,
        }),
      )
      return false
    }
  }

  /**
   * Handle POST request
   */
  private handlePostRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Check content type
    const contentType = req.headers["content-type"]
    if (!contentType || !contentType.includes("application/json")) {
      res.writeHead(415)
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Unsupported Media Type: Content-Type must be application/json",
          },
          id: null,
        }),
      )
      return
    }

    // Read request body
    let body = ""
    let size = 0

    req.on("data", (chunk) => {
      size += chunk.length
      if (size > this.maxBodySize) {
        res.writeHead(413)
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Request entity too large",
            },
            id: null,
          }),
        )
        req.destroy()
        return
      }
      body += chunk.toString()
    })

    req.on("end", () => {
      try {
        // Parse JSON-RPC message
        const message = JSON.parse(body) as JSONRPCMessage

        // Handle initialization request (synchronous response on POST)
        if (isInitializeRequest(message)) {
          this.handleInitializeRequest(message, req, res)
        } else if (isJSONRPCRequest(message) && message.method === "tools/list") {
          // Synchronous response for tools/list similar to initialize
          const sessionId = req.headers["mcp-session-id"] as string

          if (!sessionId || !this.sessions.has(sessionId)) {
            res.writeHead(400)
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Invalid session. A valid Mcp-Session-Id header is required.",
                },
                id: "id" in message ? message.id : null,
              }),
            )
            return
          }

          const session = this.sessions.get(sessionId)!

          // Store mapping for this request
          if (message.id !== undefined && message.id !== null) {
            this.requestSessionMap.set(message.id, sessionId)
            if (!session.pendingRequests) {
              session.pendingRequests = new Set()
            }
            session.pendingRequests.add(message.id)
          }

          // Prepare response handler that will send the actual tools/list response on this POST
          const responseHandler = (responseMessage: JSONRPCMessage): void => {
            if (isJSONRPCResponse(responseMessage) && responseMessage.id === message.id) {
              res.setHeader("Content-Type", "application/json")
              res.writeHead(200)
              res.end(JSON.stringify(responseMessage))

              // Clean up mappings and handlers
              this.removeInitResponseHandler(sessionId, responseHandler)
              if (message.id !== undefined && message.id !== null) {
                this.requestSessionMap.delete(message.id)
                session.pendingRequests.delete(message.id)
              }
            }
          }

          this.addInitResponseHandler(sessionId, responseHandler)

          // Forward the request to the protocol layer
          if (session.messageHandler) {
            session.messageHandler(message)
          } else {
            // No message handler, respond with error
            this.removeInitResponseHandler(sessionId, responseHandler)
            res.writeHead(500)
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: "Internal error: No message handler available",
                },
                id: "id" in message ? message.id : null,
              }),
            )
          }
        } else {
          // Handle regular requests (asynchronous - 202 on POST, response on GET stream)
          const sessionId = req.headers["mcp-session-id"] as string

          if (!sessionId || !this.sessions.has(sessionId)) {
            res.writeHead(400)
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: "Invalid session. A valid Mcp-Session-Id header is required.",
                },
                id: "id" in message ? message.id : null,
              }),
            )
            return
          }

          const session = this.sessions.get(sessionId)!

          if (isJSONRPCRequest(message)) {
            if (session.messageHandler) {
              if (message.id !== undefined && message.id !== null) {
                this.requestSessionMap.set(message.id, sessionId)
                if (!session.pendingRequests) {
                  session.pendingRequests = new Set()
                }
                session.pendingRequests.add(message.id)
              }
              session.messageHandler(message) // Pass to protocol layer
              res.writeHead(202) // Respond 202 Accepted
              res.end()
            }
          } else {
            // Notification
            if (session.messageHandler) {
              session.messageHandler(message)
              res.writeHead(202) // Acknowledge notification
              res.end()
            }
          }
        }
      } catch (err) {
        res.writeHead(400)
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
              data: String(err),
            },
            id: null,
          }),
        )

        if (this.onerror) {
          this.onerror(new Error(`Parse error: ${String(err)}`))
        }
      }
    })

    req.on("error", (err) => {
      if (this.onerror) {
        this.onerror(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /**
   * Handle initialization request
   */
  private handleInitializeRequest(
    message: JSONRPCMessage,
    _req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // Generate new session
    const sessionId = randomUUID()
    // Create session
    this.sessions.set(sessionId, {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      messageHandler: this.onmessage || (() => {}),
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Store mapping for initialization request
    if ("id" in message && message.id !== null && message.id !== undefined) {
      this.requestSessionMap.set(message.id, sessionId)
    }

    // Set headers for initialization response
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Mcp-Session-Id", sessionId)

    // Create a handler to capture the initialize response from the Protocol layer
    const responseHandler = (responseMessage: JSONRPCMessage): void => {
      // Initialize responses should always be JSON-RPC responses with a result
      if (
        isJSONRPCResponse(responseMessage) &&
        "id" in message &&
        responseMessage.id === message.id
      ) {
        // Send the actual response that includes the server's capabilities
        res.writeHead(200)
        res.end(JSON.stringify(responseMessage))

        // Remove this one-time handler
        this.removeInitResponseHandler(sessionId, responseHandler)

        // Since we're handling the initialize response specially, remove it from the session mapping
        this.requestSessionMap.delete(message.id)
      }
    }

    // Add this response handler to the session
    this.addInitResponseHandler(sessionId, responseHandler)

    // Pass to message handler to let the Protocol layer process it
    if (this.onmessage) {
      this.onmessage(message)
    } else {
      // No message handler, respond with an error
      this.removeInitResponseHandler(sessionId, responseHandler)
      res.writeHead(500)
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error: No message handler available",
          },
          id: "id" in message ? message.id : null,
        }),
      )
    }
  }

  /**
   * Add initialize response handler
   */
  private initResponseHandlers: Map<string, ((message: JSONRPCMessage) => void)[]> = new Map()

  private addInitResponseHandler(
    sessionId: string,
    handler: (message: JSONRPCMessage) => void,
  ): void {
    if (!this.initResponseHandlers.has(sessionId)) {
      this.initResponseHandlers.set(sessionId, [])
    }
    this.initResponseHandlers.get(sessionId)!.push(handler)
  }

  private removeInitResponseHandler(
    sessionId: string,
    handler: (message: JSONRPCMessage) => void,
  ): void {
    if (this.initResponseHandlers.has(sessionId)) {
      const handlers = this.initResponseHandlers.get(sessionId)!
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
      if (handlers.length === 0) {
        this.initResponseHandlers.delete(sessionId)
      }
    }
  }

  /**
   * Handle GET request (streaming connection)
   */
  private handleGetRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // All GET requests must have a session ID
    const sessionId = req.headers["mcp-session-id"] as string

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400)
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Invalid session. A valid Mcp-Session-Id header is required.",
          },
          id: null,
        }),
      )
      return
    }

    const session = this.sessions.get(sessionId)!

    // Set headers for SSE streaming response
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Transfer-Encoding", "chunked")
    res.setHeader("Mcp-Session-Id", sessionId)

    // Send 200 OK status
    res.writeHead(200)

    // Store the response for future messages
    session.activeResponses.add(res)

    // Handle client disconnect
    req.on("close", () => {
      session.activeResponses.delete(res)
    })

    // Ensure resource cleanup
    res.on("error", (err) => {
      session.activeResponses.delete(res)
      if (this.onerror) {
        this.onerror(err)
      }
    })
  }

  /**
   * Handle DELETE request (session termination)
   */
  private handleDeleteRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = req.headers["mcp-session-id"] as string

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.writeHead(400)
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Invalid session. A valid Mcp-Session-Id header is required.",
          },
          id: null,
        }),
      )
      return
    }

    const session = this.sessions.get(sessionId)!

    // Close all active connections
    for (const response of session.activeResponses) {
      try {
        response.end()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err: unknown) {
        // Ignore errors from already closed connections
      }
    }

    // Clean up any pending requests from this session
    if (session.pendingRequests) {
      for (const requestId of session.pendingRequests) {
        this.requestSessionMap.delete(requestId)
      }
    }

    // Remove session
    this.sessions.delete(sessionId)

    // Respond with 204 No Content
    res.writeHead(204)
    res.end()
  }
}
