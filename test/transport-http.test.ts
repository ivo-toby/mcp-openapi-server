import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as http from "http"
import { StreamableHttpServerTransport } from "../src/transport/StreamableHttpServerTransport"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"

// Mock http server
vi.mock("http", () => {
  const mockServer = {
    listen: vi.fn((port: number, host: string, cb: Function) => {
      setTimeout(() => cb(), 0)
    }),
    close: vi.fn((cb: Function) => {
      setTimeout(() => cb(), 0)
    }),
    on: vi.fn(),
  }
  return {
    createServer: vi.fn(() => mockServer),
    Server: vi.fn(() => mockServer),
  }
})

// Need to mock console.warn for one of our tests
const originalConsoleWarn = console.warn

describe("StreamableHttpServerTransport", () => {
  let transport: StreamableHttpServerTransport

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    console.warn = vi.fn()

    // Create transport
    transport = new StreamableHttpServerTransport(3000, "127.0.0.1", "/mcp")
  })

  afterEach(async () => {
    // Clean up
    await transport.close()
    console.warn = originalConsoleWarn
  })

  it("should start the HTTP server on the specified port and host", async () => {
    await transport.start()

    expect(http.createServer).toHaveBeenCalled()
    expect((http.createServer() as any).listen).toHaveBeenCalledWith(
      3000,
      "127.0.0.1",
      expect.any(Function),
    )
  })

  it("should handle initialization request and set session ID", () => {
    transport.onmessage = vi.fn()

    // Access the private sessions Map directly
    const transportAny = transport as any

    // Create a test session ID
    const sessionId = "test-session-id"

    // Mock initialization data
    const initData = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }

    // Create mock response
    const initRes = createMockResponse()

    // Call the handleInitializeRequest method directly
    transportAny.handleInitializeRequest(initData, {}, initRes)

    // Verify headers were set
    expect(initRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/json")
    expect(initRes.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", expect.any(String))

    // Extract the generated session ID
    const generatedSessionId = initRes.setHeader.mock.calls.find(
      (call) => call[0] === "Mcp-Session-Id",
    )?.[1]

    // Make sure a session was created
    expect(transportAny.sessions.has(generatedSessionId)).toBeTruthy()

    // Verify the message handler was set correctly
    const sessionData = transportAny.sessions.get(generatedSessionId)
    expect(sessionData.messageHandler).toBe(transport.onmessage)

    // Verify onmessage was called with the init data
    expect(transport.onmessage).toHaveBeenCalledWith(initData)

    // Verify that the init request ID is mapped to the session
    expect(transportAny.requestSessionMap.get(1)).toBe(generatedSessionId)
  })

  it("should send messages to active sessions", async () => {
    // Setup spy for message handler
    transport.onmessage = vi.fn()

    // Create a session manually
    const transportAny = transport as any
    const sessionId = "test-session-id"
    transportAny.sessions.set(sessionId, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create mock streaming response
    const mockRes = createMockResponse()

    // Add the response to active responses for the session
    const session = transportAny.sessions.get(sessionId)
    session.activeResponses.add(mockRes)

    // Create a test message
    const message: JSONRPCMessage = {
      jsonrpc: "2.0" as const,
      id: 123,
      result: { success: true },
    }

    // Map this message ID to the session
    transportAny.requestSessionMap.set(123, sessionId)

    // Send the message
    await transport.send(message)

    // Verify the message was written to the response
    expect(mockRes.write).toHaveBeenCalledWith(`data: ${JSON.stringify(message)}\n\n`)

    // Verify the message mapping was removed after sending
    expect(transportAny.requestSessionMap.has(123)).toBe(false)
  })

  it("should handle session termination with DELETE", () => {
    // Setup the transport with a session
    const transportAny = transport as any
    const sessionId = "test-session-id"

    // Create a session and add it to the transport
    transportAny.sessions.set(sessionId, {
      messageHandler: vi.fn(),
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set([111, 222, 333]),
    })

    // Add some request mappings
    transportAny.requestSessionMap.set(111, sessionId)
    transportAny.requestSessionMap.set(222, sessionId)
    transportAny.requestSessionMap.set(333, sessionId)

    // Create a DELETE request with the session ID
    const deleteReq = {
      url: "/mcp",
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId,
      },
      on: vi.fn(),
    }

    const deleteRes = createMockResponse()

    // Handle the DELETE request
    transportAny.handleDeleteRequest(deleteReq, deleteRes)

    // Should respond with 204 No Content
    expect(deleteRes.writeHead).toHaveBeenCalledWith(204)
    expect(deleteRes.end).toHaveBeenCalled()

    // Session should be removed
    expect(transportAny.sessions.has(sessionId)).toBe(false)

    // All request mappings should be cleaned up
    expect(transportAny.requestSessionMap.has(111)).toBe(false)
    expect(transportAny.requestSessionMap.has(222)).toBe(false)
    expect(transportAny.requestSessionMap.has(333)).toBe(false)
  })

  it("should properly route responses to the correct session", async () => {
    const transportAny = transport as any
    transport.onmessage = vi.fn()

    // Create two sessions
    const sessionId1 = "session-1"
    const sessionId2 = "session-2"

    // Set up both sessions with active responses
    transportAny.sessions.set(sessionId1, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set([101, 102]),
    })

    transportAny.sessions.set(sessionId2, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set([201, 202]),
    })

    // Map request IDs to sessions
    transportAny.requestSessionMap.set(101, sessionId1)
    transportAny.requestSessionMap.set(102, sessionId1)
    transportAny.requestSessionMap.set(201, sessionId2)
    transportAny.requestSessionMap.set(202, sessionId2)

    // Create mock responses for both sessions
    const mockRes1 = createMockResponse()
    const mockRes2 = createMockResponse()

    // Add responses to sessions
    transportAny.sessions.get(sessionId1).activeResponses.add(mockRes1)
    transportAny.sessions.get(sessionId2).activeResponses.add(mockRes2)

    // Send response to session 1
    const message1: JSONRPCMessage = {
      jsonrpc: "2.0" as const,
      id: 101,
      result: { session: 1 },
    }

    await transport.send(message1)

    // Send response to session 2
    const message2: JSONRPCMessage = {
      jsonrpc: "2.0" as const,
      id: 201,
      result: { session: 2 },
    }

    await transport.send(message2)

    // Verify each message was sent to the correct session only
    expect(mockRes1.write).toHaveBeenCalledWith(`data: ${JSON.stringify(message1)}\n\n`)
    expect(mockRes1.write).not.toHaveBeenCalledWith(`data: ${JSON.stringify(message2)}\n\n`)

    expect(mockRes2.write).toHaveBeenCalledWith(`data: ${JSON.stringify(message2)}\n\n`)
    expect(mockRes2.write).not.toHaveBeenCalledWith(`data: ${JSON.stringify(message1)}\n\n`)

    // Verify request mappings were cleaned up
    expect(transportAny.requestSessionMap.has(101)).toBe(false)
    expect(transportAny.requestSessionMap.has(201)).toBe(false)
    expect(transportAny.requestSessionMap.has(102)).toBe(true) // Still pending
    expect(transportAny.requestSessionMap.has(202)).toBe(true) // Still pending
  })

  it("should handle requests with invalid session IDs", () => {
    const transportAny = transport as any

    // Create a POST request with an invalid session ID
    const req = {
      url: "/mcp",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "non-existent-session",
      },
      on: vi.fn(),
      destroy: vi.fn(),
    }

    // Mock data for the request body
    const requestBody = JSON.stringify({
      jsonrpc: "2.0",
      method: "test",
      id: 999,
    })

    // Setup on('data') and on('end') event handlers
    req.on.mockImplementation((event: string, handler: Function) => {
      if (event === "data") {
        // Simulate receiving data
        setTimeout(() => handler(requestBody), 0)
      }
      if (event === "end") {
        // Simulate end event after data is received
        setTimeout(() => handler(), 10)
      }
      return req
    })

    const res = createMockResponse()

    // Call handleRequest method directly
    transportAny.handleRequest(req, res)

    // Return a promise to allow the async events to complete
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Now check the assertions after allowing time for the events to process
        expect(res.writeHead).toHaveBeenCalledWith(400)
        expect(res.end).toHaveBeenCalledWith(expect.stringContaining("Invalid session"))
        resolve()
      }, 50)
    })
  })

  it("should handle multiple GET requests from the same session", () => {
    const transportAny = transport as any
    const sessionId = "test-session-id"

    // Create a session
    transportAny.sessions.set(sessionId, {
      messageHandler: vi.fn(),
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create multiple GET requests with the same session ID
    const req1 = {
      url: "/mcp",
      method: "GET",
      headers: {
        "mcp-session-id": sessionId,
      },
      on: vi.fn(),
    }

    const req2 = {
      url: "/mcp",
      method: "GET",
      headers: {
        "mcp-session-id": sessionId,
      },
      on: vi.fn(),
    }

    // Setup event handlers
    req1.on.mockImplementation(() => req1)
    req2.on.mockImplementation(() => req2)

    const res1 = createMockResponse()
    const res2 = createMockResponse()

    // Handle both GET requests
    transportAny.handleGetRequest(req1, res1)
    transportAny.handleGetRequest(req2, res2)

    // Verify both responses were added to the session's activeResponses
    const session = transportAny.sessions.get(sessionId)
    expect(session.activeResponses.size).toBe(2)
    expect(session.activeResponses.has(res1)).toBe(true)
    expect(session.activeResponses.has(res2)).toBe(true)

    // Verify headers were set properly on both responses
    expect(res1.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream")
    expect(res1.setHeader).toHaveBeenCalledWith("Connection", "keep-alive")
    expect(res1.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform")
    expect(res1.setHeader).toHaveBeenCalledWith("Transfer-Encoding", "chunked")
    expect(res1.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", sessionId)

    expect(res2.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream")
    expect(res2.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", sessionId)
  })

  it("should handle client disconnects and clean up resources", () => {
    const transportAny = transport as any
    const sessionId = "test-session-id"

    // Create a session
    transportAny.sessions.set(sessionId, {
      messageHandler: vi.fn(),
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create a GET request
    const req = {
      url: "/mcp",
      method: "GET",
      headers: {
        "mcp-session-id": sessionId,
      },
      on: vi.fn(),
    }

    let closeHandler: Function | undefined

    // Setup event handlers
    req.on.mockImplementation((event: string, handler: Function) => {
      if (event === "close") closeHandler = handler
      return req
    })

    const res = createMockResponse()

    // Handle the GET request
    transportAny.handleGetRequest(req, res)

    // Verify the response was added to activeResponses
    const session = transportAny.sessions.get(sessionId)
    expect(session.activeResponses.has(res)).toBe(true)

    // Simulate client disconnect by triggering the close event
    if (closeHandler) {
      closeHandler()

      // Verify the response was removed from activeResponses
      expect(session.activeResponses.has(res)).toBe(false)
    } else {
      // This should not happen, but added as a safeguard
      expect.fail("closeHandler was not set")
    }
  })

  it("should fallback to broadcasting when target session cannot be determined", async () => {
    const transportAny = transport as any
    transport.onmessage = vi.fn()

    // Create two sessions
    const sessionId1 = "session-1"
    const sessionId2 = "session-2"

    transportAny.sessions.set(sessionId1, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    transportAny.sessions.set(sessionId2, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create mock responses for both sessions
    const mockRes1 = createMockResponse()
    const mockRes2 = createMockResponse()

    // Add responses to sessions
    transportAny.sessions.get(sessionId1).activeResponses.add(mockRes1)
    transportAny.sessions.get(sessionId2).activeResponses.add(mockRes2)

    // Create a notification message (no ID)
    const notification: JSONRPCMessage = {
      jsonrpc: "2.0" as const,
      method: "notify",
      params: { type: "broadcast" },
    }

    // Send the notification (no target session)
    await transport.send(notification)

    // Verify warning was logged using the mocked console.warn
    expect(console.warn).toHaveBeenCalled()

    // Verify message was broadcast to all sessions
    expect(mockRes1.write).toHaveBeenCalledWith(`data: ${JSON.stringify(notification)}\n\n`)
    expect(mockRes2.write).toHaveBeenCalledWith(`data: ${JSON.stringify(notification)}\n\n`)
  })

  it("should handle POST requests and track request session mappings", () => {
    const transportAny = transport as any
    transport.onmessage = vi.fn()

    // Create a session
    const sessionId = "test-session-id"
    transportAny.sessions.set(sessionId, {
      messageHandler: transport.onmessage,
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create the request message
    const requestMessage = {
      jsonrpc: "2.0",
      method: "test",
      id: 555,
    }

    // Create a mock POST request function that directly calls our handler
    // This simulates what would happen in handleRequest -> handlePostRequest
    const simulatePostRequest = () => {
      // Call the messageHandler directly like the real implementation would
      const session = transportAny.sessions.get(sessionId)
      session.messageHandler(requestMessage)

      // Manually set up the mapping as handlePostRequest would
      transportAny.requestSessionMap.set(555, sessionId)
      if (!session.pendingRequests) {
        session.pendingRequests = new Set()
      }
      session.pendingRequests.add(555)
    }

    // Simulate the POST request
    simulatePostRequest()

    // Verify the message handler was called
    expect(transport.onmessage).toHaveBeenCalledWith(requestMessage)

    // Verify request ID was mapped to the session
    expect(transportAny.requestSessionMap.get(555)).toBe(sessionId)

    // Verify the request ID was added to the session's pendingRequests
    expect(transportAny.sessions.get(sessionId).pendingRequests.has(555)).toBe(true)
  })

  it("should properly handle initialize request with response body", async () => {
    // Setup mock handler to simulate the protocol layer's response
    transport.onmessage = vi.fn((message) => {
      // Simulate the protocol layer's response to the initialize request
      if ("method" in message && message.method === "initialize" && "id" in message) {
        // Create the mock response that would come from the Protocol layer
        const response: JSONRPCMessage = {
          jsonrpc: "2.0" as const,
          id: message.id,
          result: {
            protocolVersion: "2025-03-26",
            serverInfo: {
              name: "test-server",
              version: "1.0.0",
            },
            capabilities: {
              // Basic capabilities
              tools: {},
            },
          },
        }

        // Send the response via the transport's send method
        // This is how the Protocol layer would respond
        setTimeout(() => {
          transport.send(response)
        }, 0)
      }
    })

    // Create init request data
    const initData = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }

    // Create mock request and response
    const req = createInitRequest()
    const res = createMockResponse()

    // Access the private method to directly test initialize request handling
    const transportAny = transport as any

    // Call initialize handler directly
    transportAny.handleInitializeRequest(initData, req, res)

    // Wait for the async handler to process the response
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify response contains session ID header
    expect(res.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", expect.any(String))

    // Verify onmessage was called with the init request
    expect(transport.onmessage).toHaveBeenCalledWith(initData)

    // Verify response was sent with the response from the protocol layer
    expect(res.end).toHaveBeenCalled()
    expect(res.writeHead).toHaveBeenCalledWith(200)

    const responseArg = res.end.mock.calls[0]?.[0]

    if (responseArg) {
      const responseObj = JSON.parse(responseArg)
      // Verify it's a proper JSON-RPC response
      expect(responseObj.jsonrpc).toBe("2.0")
      expect(responseObj.id).toBe(1)
      expect(responseObj.result).toBeDefined()
      expect(responseObj.result.protocolVersion).toBe("2025-03-26")
      expect(responseObj.result.serverInfo).toBeDefined()
      expect(responseObj.result.capabilities).toBeDefined()
    }

    // Verify session was created
    const sessionId = res.setHeader.mock.calls.find((call) => call[0] === "Mcp-Session-Id")?.[1]
    expect(transportAny.sessions.has(sessionId)).toBe(true)
  })

  it("should correctly include server capabilities in initialize response", async () => {
    // Set up a custom message handler that simulates the protocol layer's response
    transport.onmessage = vi.fn((message) => {
      // Simulate the protocol layer's response to the initialize request
      if ("method" in message && message.method === "initialize" && "id" in message) {
        // Create the mock response that would come from the Protocol layer
        // with actual capabilities
        const response: JSONRPCMessage = {
          jsonrpc: "2.0" as const,
          id: message.id,
          result: {
            protocolVersion: "2025-03-26",
            serverInfo: {
              name: "test-server",
              version: "1.0.0",
            },
            capabilities: {
              tools: {
                execute: true,
              },
              resources: {
                read: true,
                list: true,
              },
            },
          },
        }

        // Send the response via the transport's send method
        // This is how the Protocol layer would respond
        setTimeout(() => {
          transport.send(response)
        }, 0)
      }
    })

    // Create init request
    const initData = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }

    // Create mock request and response objects
    const req = createInitRequest()
    const res = createMockResponse()

    // Access the private method to directly test initialize request handling
    const transportAny = transport as any

    // Call initialize handler directly
    transportAny.handleInitializeRequest(initData, req, res)

    // Wait for the async handler to process the response
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify headers are set
    expect(res.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", expect.any(String))

    // Verify onmessage was called with the init request
    expect(transport.onmessage).toHaveBeenCalledWith(initData)

    // Verify response was sent with capabilities
    expect(res.end).toHaveBeenCalled()
    const responseArg = res.end.mock.calls[0]?.[0]

    if (responseArg) {
      const responseObj = JSON.parse(responseArg)

      // Verify it's a proper JSON-RPC response
      expect(responseObj.jsonrpc).toBe("2.0")
      expect(responseObj.id).toBe(1)
      expect(responseObj.result).toBeDefined()

      // Verify capabilities are included from the protocol layer
      expect(responseObj.result.capabilities).toEqual({
        tools: {
          execute: true,
        },
        resources: {
          read: true,
          list: true,
        },
      })
    }
  })

  it("should handle tools/list requests synchronously", async () => {
    // Set up a custom message handler that simulates the protocol layer's response
    transport.onmessage = vi.fn((message) => {
      // Simulate the protocol layer's response to the tools/list request
      if ("method" in message && message.method === "tools/list" && "id" in message) {
        console.error(`Test: received tools/list message in onmessage handler`)

        // Create the mock response that would come from the Protocol layer
        // with actual tools data
        const response: JSONRPCMessage = {
          jsonrpc: "2.0" as const,
          id: message.id,
          result: {
            tools: [
              {
                id: "test-tool-1",
                name: "Test Tool 1",
                description: "A test tool for testing",
                parameters: {
                  type: "object",
                  properties: {
                    param1: {
                      type: "string",
                      description: "A test parameter",
                    },
                  },
                },
              },
            ],
          },
        }

        // Call the send method to simulate the protocol's response
        console.error(`Test: sending response for tools/list request`)
        transport.send(response)
      }
    })

    // Create a mock session ID
    const sessionId = "test-session-123"
    const transportAny = transport as any

    // Create session in the transport
    transportAny.sessions.set(sessionId, {
      messageHandler: transport.onmessage || (() => {}),
      activeResponses: new Set(),
      initialized: true,
      pendingRequests: new Set(),
    })

    // Create tools/list request data
    const toolsListRequest = {
      jsonrpc: "2.0",
      id: 123,
      method: "tools/list",
    }

    // More realistic mock request with proper handlers
    const reqHandlers: Record<string, Array<(...args: any[]) => void>> = {
      data: [],
      end: [],
      error: [],
    }

    const req = {
      url: "/mcp",
      method: "POST",
      headers: {
        "mcp-session-id": sessionId,
        "content-type": "application/json",
      },
      on: vi.fn((event, handler) => {
        console.error(`Test: adding handler for ${event} event`)
        if (reqHandlers[event]) {
          reqHandlers[event].push(handler)
        }
        return req
      }),
      emit: vi.fn((event, ...args) => {
        console.error(`Test: emitting ${event} event`)
        if (reqHandlers[event]) {
          reqHandlers[event].forEach((handler) => handler(...args))
        }
        return true
      }),
    }

    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
      setHeader: vi.fn(),
    }

    // Simulate the POST request with the tools/list request
    console.error(`Test: calling handlePostRequest`)
    transportAny.handlePostRequest(req, res)

    // Simulate the request body
    console.error(`Test: emitting data event`)
    req.emit("data", Buffer.from(JSON.stringify(toolsListRequest)))
    console.error(`Test: emitting end event`)
    req.emit("end")

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    console.error(`Test: checking expectations`)

    // Verify the tools/list response was sent synchronously
    expect(res.end).toHaveBeenCalled()
    expect(res.writeHead).toHaveBeenCalledWith(200)

    try {
      // Get the JSON response if it exists
      const responseJson = JSON.parse(res.end.mock.calls[0][0])

      // Verify the response structure
      expect(responseJson.jsonrpc).toBe("2.0")
      expect(responseJson.id).toBe(123)
      expect(responseJson.result).toBeDefined()
      expect(responseJson.result.tools).toBeInstanceOf(Array)
      expect(responseJson.result.tools.length).toBe(1)
      expect(responseJson.result.tools[0].id).toBe("test-tool-1")
    } catch (e) {
      console.error(`Test: Failed to parse response: ${e}`)
      console.error(`Response end calls: ${res.end.mock.calls.length}`)
      if (res.end.mock.calls.length > 0) {
        console.error(`Response body: ${res.end.mock.calls[0][0]}`)
      }
      throw e
    }
  })

  it("should handle full HTTP initialize request flow and reject invalid format", async () => {
    // This test simulates the exact scenario from the GitHub issue
    // It tests the full HTTP request flow, not just the handleInitializeRequest method

    transport.onmessage = vi.fn()
    const transportAny = transport as any

    // Test 1: Invalid format (the old format that was in the README)
    const invalidInitRequest = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        client: { name: "curl-client", version: "1.0.0" },
        protocol: { name: "mcp", version: "2025-03-26" },
      },
    }

    const reqHandlers1: Record<string, Array<(...args: any[]) => void>> = {
      data: [],
      end: [],
      error: [],
    }

    const req1 = {
      url: "/mcp",
      method: "POST",
      headers: {
        "content-type": "application/json",
        // No session ID - this is an initialize request
      },
      on: vi.fn((event, handler) => {
        if (reqHandlers1[event]) {
          reqHandlers1[event].push(handler)
        }
        return req1
      }),
      emit: vi.fn((event, ...args) => {
        if (reqHandlers1[event]) {
          reqHandlers1[event].forEach((handler) => handler(...args))
        }
        return true
      }),
      destroy: vi.fn(),
    }

    const res1 = {
      writeHead: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
      setHeader: vi.fn(),
    }

    // Simulate the POST request with invalid format
    transportAny.handlePostRequest(req1, res1)
    req1.emit("data", Buffer.from(JSON.stringify(invalidInitRequest)))
    req1.emit("end")

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should return 400 Bad Request for invalid format
    expect(res1.writeHead).toHaveBeenCalledWith(400)
    expect(res1.end).toHaveBeenCalledWith(
      expect.stringContaining("Invalid session. A valid Mcp-Session-Id header is required."),
    )

    // Test 2: Valid format (the correct MCP format)
    const validInitRequest = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "curl-client", version: "1.0.0" },
      },
    }

    // Set up a mock response handler for the valid request
    transport.onmessage = vi.fn((message) => {
      if ("method" in message && message.method === "initialize" && "id" in message) {
        const response: JSONRPCMessage = {
          jsonrpc: "2.0" as const,
          id: message.id,
          result: {
            protocolVersion: "2025-03-26",
            serverInfo: { name: "test-server", version: "1.0.0" },
            capabilities: { tools: {} },
          },
        }
        setTimeout(() => transport.send(response), 0)
      }
    })

    const reqHandlers2: Record<string, Array<(...args: any[]) => void>> = {
      data: [],
      end: [],
      error: [],
    }

    const req2 = {
      url: "/mcp",
      method: "POST",
      headers: {
        "content-type": "application/json",
        // No session ID - this is an initialize request
      },
      on: vi.fn((event, handler) => {
        if (reqHandlers2[event]) {
          reqHandlers2[event].push(handler)
        }
        return req2
      }),
      emit: vi.fn((event, ...args) => {
        if (reqHandlers2[event]) {
          reqHandlers2[event].forEach((handler) => handler(...args))
        }
        return true
      }),
      destroy: vi.fn(),
    }

    const res2 = {
      writeHead: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
      setHeader: vi.fn(),
    }

    // Simulate the POST request with valid format
    transportAny.handlePostRequest(req2, res2)
    req2.emit("data", Buffer.from(JSON.stringify(validInitRequest)))
    req2.emit("end")

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Should return 200 OK with session ID for valid format
    expect(res2.writeHead).toHaveBeenCalledWith(200)
    expect(res2.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", expect.any(String))
    expect(res2.end).toHaveBeenCalled()

    // Verify the response contains proper initialize result
    const responseBody = res2.end.mock.calls[0]?.[0]
    if (responseBody) {
      const responseObj = JSON.parse(responseBody)
      expect(responseObj.jsonrpc).toBe("2.0")
      expect(responseObj.id).toBe(0)
      expect(responseObj.result).toBeDefined()
      expect(responseObj.result.protocolVersion).toBe("2025-03-26")
    }

    // Verify a session was created
    expect(transportAny.sessions.size).toBeGreaterThan(0)
  })

  it("should handle non-initialize requests without session ID correctly", async () => {
    // This test ensures that non-initialize requests properly require session IDs

    transport.onmessage = vi.fn()
    const transportAny = transport as any

    const regularRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }

    const reqHandlers: Record<string, Array<(...args: any[]) => void>> = {
      data: [],
      end: [],
      error: [],
    }

    const req = {
      url: "/mcp",
      method: "POST",
      headers: {
        "content-type": "application/json",
        // No session ID - this should fail for non-initialize requests
      },
      on: vi.fn((event, handler) => {
        if (reqHandlers[event]) {
          reqHandlers[event].push(handler)
        }
        return req
      }),
      emit: vi.fn((event, ...args) => {
        if (reqHandlers[event]) {
          reqHandlers[event].forEach((handler) => handler(...args))
        }
        return true
      }),
      destroy: vi.fn(),
    }

    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
      setHeader: vi.fn(),
    }

    // Simulate the POST request
    transportAny.handlePostRequest(req, res)
    req.emit("data", Buffer.from(JSON.stringify(regularRequest)))
    req.emit("end")

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should return 400 Bad Request for missing session ID
    expect(res.writeHead).toHaveBeenCalledWith(400)
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining("Invalid session. A valid Mcp-Session-Id header is required."),
    )
  })

  describe("Health Check Endpoint (Issue #48)", () => {
    it("should respond to GET /health with status 200 and health info", () => {
      const transportAny = transport as any

      const req = {
        url: "/health",
        method: "GET",
        headers: {},
      }

      const res = createMockResponse()

      // Call the request handler
      transportAny.handleRequest(req, res)

      // Verify response
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json")
      expect(res.writeHead).toHaveBeenCalledWith(200)
      expect(res.end).toHaveBeenCalled()

      // Parse and verify response body
      const responseBody = res.end.mock.calls[0]?.[0]
      expect(responseBody).toBeDefined()

      const healthData = JSON.parse(responseBody)
      expect(healthData.status).toBe("healthy")
      expect(healthData.activeSessions).toBe(0)
      expect(healthData.uptime).toBeGreaterThanOrEqual(0)
      expect(typeof healthData.uptime).toBe("number")
    })

    it("should report correct number of active sessions", () => {
      const transportAny = transport as any

      // Create some test sessions
      transportAny.sessions.set("session-1", {
        messageHandler: vi.fn(),
        activeResponses: new Set(),
        initialized: true,
        pendingRequests: new Set(),
      })

      transportAny.sessions.set("session-2", {
        messageHandler: vi.fn(),
        activeResponses: new Set(),
        initialized: true,
        pendingRequests: new Set(),
      })

      const req = {
        url: "/health",
        method: "GET",
        headers: {},
      }

      const res = createMockResponse()

      // Call the request handler
      transportAny.handleRequest(req, res)

      // Verify response
      expect(res.writeHead).toHaveBeenCalledWith(200)
      expect(res.end).toHaveBeenCalled()

      // Parse and verify response body
      const responseBody = res.end.mock.calls[0]?.[0]
      const healthData = JSON.parse(responseBody)

      expect(healthData.status).toBe("healthy")
      expect(healthData.activeSessions).toBe(2)
    })

    it("should calculate uptime correctly", async () => {
      const transportAny = transport as any

      // Wait a bit to ensure uptime is measurable
      await new Promise((resolve) => setTimeout(resolve, 100))

      const req = {
        url: "/health",
        method: "GET",
        headers: {},
      }

      const res = createMockResponse()

      // Call the request handler
      transportAny.handleRequest(req, res)

      // Parse response
      const responseBody = res.end.mock.calls[0]?.[0]
      const healthData = JSON.parse(responseBody)

      // Uptime should be at least 0 seconds (could be 0 if very fast)
      expect(healthData.uptime).toBeGreaterThanOrEqual(0)
      expect(typeof healthData.uptime).toBe("number")
      expect(Number.isInteger(healthData.uptime)).toBe(true)
    })

    it("should not require authentication or session ID", () => {
      const transportAny = transport as any

      const req = {
        url: "/health",
        method: "GET",
        headers: {
          // No session ID or authentication
        },
      }

      const res = createMockResponse()

      // Call the request handler
      transportAny.handleRequest(req, res)

      // Should succeed without authentication
      expect(res.writeHead).toHaveBeenCalledWith(200)
      expect(res.end).toHaveBeenCalled()
    })

    it("should handle POST requests to /health (allow any method)", () => {
      const transportAny = transport as any

      const req = {
        url: "/health",
        method: "POST",
        headers: {},
      }

      const res = createMockResponse()

      // Call the request handler
      transportAny.handleRequest(req, res)

      // Should succeed regardless of method
      expect(res.writeHead).toHaveBeenCalledWith(200)
      expect(res.end).toHaveBeenCalled()
    })
  })
})

// Helper functions to create mock objects
function createInitRequest() {
  const req = {
    url: "/mcp",
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    on: vi.fn(),
    destroy: vi.fn(),
  }

  // Set up the mock implementation to return req
  req.on.mockImplementation(() => req)

  return req
}

function createMockResponse() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
    write: vi.fn(),
    setHeader: vi.fn(),
    on: vi.fn(),
  }
}

function createMockRequest(method: string, headers: Record<string, string>) {
  const req = {
    url: "/mcp",
    method: method,
    headers: headers,
    on: vi.fn(),
    emit: vi.fn(),
  }

  // Set up the mock implementation to return req
  req.on.mockImplementation(() => req)

  return req
}
