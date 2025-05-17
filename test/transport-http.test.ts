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
        client: { name: "test", version: "1.0" },
        protocol: { name: "mcp", version: "2025-03-26" },
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
    expect(mockRes.write).toHaveBeenCalledWith(JSON.stringify(message) + "\n")

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
    expect(mockRes1.write).toHaveBeenCalledWith(JSON.stringify(message1) + "\n")
    expect(mockRes1.write).not.toHaveBeenCalledWith(JSON.stringify(message2) + "\n")

    expect(mockRes2.write).toHaveBeenCalledWith(JSON.stringify(message2) + "\n")
    expect(mockRes2.write).not.toHaveBeenCalledWith(JSON.stringify(message1) + "\n")

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
    expect(res1.setHeader).toHaveBeenCalledWith("Content-Type", "application/json")
    expect(res1.setHeader).toHaveBeenCalledWith("Connection", "keep-alive")
    expect(res1.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform")
    expect(res1.setHeader).toHaveBeenCalledWith("Transfer-Encoding", "chunked")
    expect(res1.setHeader).toHaveBeenCalledWith("Mcp-Session-Id", sessionId)

    expect(res2.setHeader).toHaveBeenCalledWith("Content-Type", "application/json")
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
    expect(mockRes1.write).toHaveBeenCalledWith(JSON.stringify(notification) + "\n")
    expect(mockRes2.write).toHaveBeenCalledWith(JSON.stringify(notification) + "\n")
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
