import { describe, it, expect, beforeEach, vi } from "vitest"
import type { OpenAPIMCPServerConfig } from "../src/config"
import type { AuthProvider } from "../src/auth-provider"

vi.mock("@modelcontextprotocol/sdk/server/index.js")
vi.mock("@modelcontextprotocol/sdk/server/transport.js")
vi.mock("@modelcontextprotocol/sdk/types.js")
vi.mock("../src/tools-manager")
vi.mock("../src/api-client")

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"

// Create a dummy interface that implements the Transport interface
interface ServerTransport extends Transport {
  start(): Promise<void>
  send(message: any): Promise<void>
  close(): Promise<void>
}

import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { ToolsManager } from "../src/tools-manager"
import { ApiClient } from "../src/api-client"
import { OpenAPIServer } from "../src/server"

const config: OpenAPIMCPServerConfig = {
  name: "test-server",
  version: "1.0.0",
  apiBaseUrl: "http://localhost",
  openApiSpec: "spec.yaml",
  headers: { Authorization: "Bearer token" },
  transportType: "stdio",
  httpPort: 3000,
  httpHost: "127.0.0.1",
  endpointPath: "/mcp",
  toolsMode: "all",
  specInputMethod: "file",
}

describe("OpenAPIServer", () => {
  let server: OpenAPIServer
  let mockServer: { setRequestHandler: Mock; connect: Mock }
  let mockToolsManager: {
    initialize: Mock
    getAllTools: Mock
    findTool: Mock
    getToolsWithIds: Mock
    getSpecLoader: Mock
    getOpenApiSpec: Mock
  }
  let mockApiClient: { executeApiCall: Mock; setTools: Mock; setOpenApiSpec: Mock }

  type Mock = ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    const mockSetRequestHandler = vi.fn()
    const mockConnect = vi.fn()
    vi.mocked(Server).mockImplementation(
      () =>
        ({
          setRequestHandler: mockSetRequestHandler,
          connect: mockConnect,
        }) as any,
    )

    vi.mocked(ToolsManager).mockImplementation(
      () =>
        ({
          initialize: vi.fn(),
          getAllTools: vi.fn().mockReturnValue([]),
          findTool: vi.fn(),
          getToolsWithIds: vi.fn().mockReturnValue([]),
          getSpecLoader: vi.fn().mockReturnValue({}), // Return a mock spec loader object
          getOpenApiSpec: vi.fn(),
        }) as any,
    )

    vi.mocked(ApiClient).mockImplementation(
      () =>
        ({
          executeApiCall: vi.fn(),
          setTools: vi.fn(),
          setOpenApiSpec: vi.fn(),
        }) as any,
    )

    server = new OpenAPIServer(config)

    // @ts-expect-error: access private for test
    mockServer = server.server
    // @ts-expect-error: access private for test
    mockToolsManager = server.toolsManager
    // @ts-expect-error: access private for test
    mockApiClient = server.apiClient
  })

  it("should construct with config", () => {
    expect(server).toBeInstanceOf(OpenAPIServer)
  })

  it("should register tool listing handler", () => {
    expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
      ListToolsRequestSchema,
      expect.any(Function),
    )
  })

  it("should handle tool listing", async () => {
    const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[0][1]

    vi.mocked(mockToolsManager.getAllTools).mockReturnValue([{ name: "tool1" }])

    const result = await handler()
    expect(result.tools).toEqual([{ name: "tool1" }])
  })

  describe("Tool Execution", () => {
    it("should handle tool execution success", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::ping",
        tool: { name: "ping" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ ok: true })

      const req = { params: { id: "get::ping", arguments: { foo: "bar" } } }
      const result = await handler(req)
      expect(result.content[0].text).toContain("ok")
    })

    it("should explicitly pass request arguments to API client", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "post::users",
        tool: { name: "create-user" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ id: 123, name: "John" })

      const testArguments = {
        name: "John Doe",
        email: "john@example.com",
        age: 30,
        metadata: { role: "admin", department: "engineering" },
      }
      const req = { params: { id: "post::users", arguments: testArguments } }

      await handler(req)

      // Verify that executeApiCall was called with the exact arguments from the request
      expect(mockApiClient.executeApiCall).toHaveBeenCalledWith("post::users", testArguments)
      expect(mockApiClient.executeApiCall).toHaveBeenCalledTimes(1)
    })

    it("should handle empty arguments object", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::status",
        tool: { name: "get-status" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ status: "ok" })

      const req = { params: { id: "get::status", arguments: {} } }

      await handler(req)

      // Verify that executeApiCall was called with empty arguments
      expect(mockApiClient.executeApiCall).toHaveBeenCalledWith("get::status", {})
    })

    it("should handle undefined arguments", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::health",
        tool: { name: "health-check" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ healthy: true })

      const req = { params: { id: "get::health" } } // No arguments property

      await handler(req)

      // Verify that executeApiCall was called with empty object when arguments is undefined
      expect(mockApiClient.executeApiCall).toHaveBeenCalledWith("get::health", {})
    })

    it("should handle complex nested arguments", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "put::users-123",
        tool: { name: "update-user" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ updated: true })

      const complexArguments = {
        user: {
          profile: {
            name: "Jane Smith",
            contact: {
              email: "jane@example.com",
              phone: "+1-555-0123",
            },
          },
          preferences: {
            notifications: ["email", "sms"],
            theme: "dark",
          },
        },
        metadata: {
          lastModified: "2023-12-01T10:00:00Z",
          version: 2,
        },
      }
      const req = { params: { id: "put::users-123", arguments: complexArguments } }

      await handler(req)

      // Verify that executeApiCall preserves complex argument structure
      expect(mockApiClient.executeApiCall).toHaveBeenCalledWith("put::users-123", complexArguments)
    })

    it("should handle tool not found", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue(undefined)
      vi.mocked(mockToolsManager.getAllTools).mockReturnValue([{ name: "ping" }])

      const req = { params: { id: "not-exist", arguments: {} } }
      await expect(handler(req)).rejects.toThrow("Tool not found: not-exist")
    })

    it("should handle tool execution error", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::ping",
        tool: { name: "ping" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockRejectedValue(new Error("fail"))

      const req = { params: { id: "get::ping", arguments: {} } }
      const result = await handler(req)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("fail")
    })

    it("should handle non-Error exceptions during tool execution", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::ping",
        tool: { name: "ping" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockRejectedValue("string error")

      const req = { params: { id: "get::ping", arguments: {} } }

      // Non-Error exceptions should be re-thrown
      await expect(handler(req)).rejects.toBe("string error")
    })

    it("should require tool ID or name", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      const req = { params: { arguments: {} } } // No id or name

      await expect(handler(req)).rejects.toThrow("Tool ID or name is required")
    })

    it("should handle tool lookup by name", async () => {
      const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

      vi.mocked(mockToolsManager.findTool).mockReturnValue({
        toolId: "get::ping",
        tool: { name: "ping" },
      })
      vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ pong: true })

      const req = { params: { name: "ping", arguments: { test: "value" } } }

      await handler(req)

      expect(mockToolsManager.findTool).toHaveBeenCalledWith("ping")
      expect(mockApiClient.executeApiCall).toHaveBeenCalledWith("get::ping", { test: "value" })
    })
  })

  describe("Server Lifecycle", () => {
    it("should start the server successfully", async () => {
      vi.mocked(mockToolsManager.initialize).mockResolvedValue(undefined)
      vi.mocked(mockServer.connect).mockResolvedValue(undefined)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await expect(server.start(transport)).resolves.toBeUndefined()
      expect(mockToolsManager.initialize).toHaveBeenCalled()
      expect(mockServer.connect).toHaveBeenCalledWith(transport)
    })

    it("should handle ToolsManager initialization failure", async () => {
      const initError = new Error("Failed to load OpenAPI spec")
      vi.mocked(mockToolsManager.initialize).mockRejectedValue(initError)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await expect(server.start(transport)).rejects.toThrow("Failed to load OpenAPI spec")

      // Verify that server.connect was not called when initialization fails
      expect(mockServer.connect).not.toHaveBeenCalled()
      expect(mockApiClient.setTools).not.toHaveBeenCalled()
    })

    it("should handle ToolsManager initialization failure with network error", async () => {
      const networkError = new Error("ENOTFOUND api.example.com")
      networkError.name = "NetworkError"
      vi.mocked(mockToolsManager.initialize).mockRejectedValue(networkError)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await expect(server.start(transport)).rejects.toThrow("ENOTFOUND api.example.com")
      expect(mockServer.connect).not.toHaveBeenCalled()
    })

    it("should handle Server.connect() failure", async () => {
      vi.mocked(mockToolsManager.initialize).mockResolvedValue(undefined)
      const connectError = new Error("Transport connection failed")
      vi.mocked(mockServer.connect).mockRejectedValue(connectError)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await expect(server.start(transport)).rejects.toThrow("Transport connection failed")

      // Verify that initialization completed but connection failed
      expect(mockToolsManager.initialize).toHaveBeenCalled()
      expect(mockApiClient.setTools).toHaveBeenCalled()
      expect(mockServer.connect).toHaveBeenCalledWith(transport)
    })

    it("should handle Server.connect() failure with timeout", async () => {
      vi.mocked(mockToolsManager.initialize).mockResolvedValue(undefined)
      const timeoutError = new Error("Connection timeout")
      timeoutError.name = "TimeoutError"
      vi.mocked(mockServer.connect).mockRejectedValue(timeoutError)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await expect(server.start(transport)).rejects.toThrow("Connection timeout")
      expect(mockToolsManager.initialize).toHaveBeenCalled()
      expect(mockServer.connect).toHaveBeenCalledWith(transport)
    })

    it("should provide tools with their IDs to the API client when starting the server", async () => {
      vi.mocked(mockToolsManager.initialize).mockResolvedValue(undefined)
      vi.mocked(mockServer.connect).mockResolvedValue(undefined)

      // Mock the tools with their IDs
      const mockToolsWithIds = [
        ["GET::users", { name: "list-users" }],
        ["POST::users", { name: "create-user" }],
      ]
      vi.mocked(mockToolsManager.getToolsWithIds).mockReturnValue(mockToolsWithIds)

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await server.start(transport)

      // Verify that getToolsWithIds is called
      expect(mockToolsManager.getToolsWithIds).toHaveBeenCalled()

      // Verify that setTools is called with a map containing the correct tool IDs and tools
      const expectedToolsMap = new Map([
        ["GET::users", { name: "list-users" }],
        ["POST::users", { name: "create-user" }],
      ])
      expect(mockApiClient.setTools).toHaveBeenCalledWith(expectedToolsMap)
    })

    it("should handle empty tools list during startup", async () => {
      vi.mocked(mockToolsManager.initialize).mockResolvedValue(undefined)
      vi.mocked(mockServer.connect).mockResolvedValue(undefined)
      vi.mocked(mockToolsManager.getToolsWithIds).mockReturnValue([])

      const transport = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as ServerTransport

      await server.start(transport)

      // Verify that setTools is called with an empty map
      expect(mockApiClient.setTools).toHaveBeenCalledWith(new Map())
    })

    // Note: The OpenAPIServer class doesn't currently have a close/stop method
    // This test documents the expected behavior if such a method were to be added
    it("should document expected close/stop lifecycle behavior", () => {
      // Currently, OpenAPIServer doesn't have a close() or stop() method
      // If added in the future, it should:
      // 1. Close any open connections
      // 2. Clean up resources
      // 3. Potentially call transport.close() if available

      expect(typeof (server as any).close).toBe("undefined")
      expect(typeof (server as any).stop).toBe("undefined")

      // This test serves as documentation for future implementation
      // When close/stop methods are added, they should be tested here
    })
  })

  it("should advertise tools capabilities in initialization response", () => {
    // Verify the server was constructed with the correct capabilities
    // Note: prompts and resources are always declared to support dynamic registration
    expect(Server).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        capabilities: {
          tools: {
            list: true,
            execute: true,
          },
          prompts: {},
          resources: {},
        },
      }),
    )
  })

  describe("AuthProvider Integration", () => {
    it("should use AuthProvider when provided in config", () => {
      const mockAuthProvider: AuthProvider = {
        getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer token" }),
        handleAuthError: vi.fn().mockResolvedValue(false),
      }

      const configWithAuthProvider: OpenAPIMCPServerConfig = {
        ...config,
        authProvider: mockAuthProvider,
      }

      new OpenAPIServer(configWithAuthProvider)

      // Verify ApiClient was constructed with the AuthProvider
      expect(ApiClient).toHaveBeenCalledWith(config.apiBaseUrl, mockAuthProvider, expect.anything())
    })

    it("should use StaticAuthProvider with headers when no AuthProvider provided", () => {
      const configWithHeaders: OpenAPIMCPServerConfig = {
        ...config,
        headers: { "X-API-Key": "test-key" },
      }

      new OpenAPIServer(configWithHeaders)

      // Verify ApiClient was constructed with a StaticAuthProvider
      expect(ApiClient).toHaveBeenCalledWith(
        config.apiBaseUrl,
        expect.objectContaining({
          getAuthHeaders: expect.any(Function),
          handleAuthError: expect.any(Function),
        }),
        expect.anything(),
      )
    })

    it("should prefer AuthProvider over headers when both are provided", () => {
      const mockAuthProvider: AuthProvider = {
        getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer token" }),
        handleAuthError: vi.fn().mockResolvedValue(false),
      }

      const configWithBoth: OpenAPIMCPServerConfig = {
        ...config,
        headers: { "X-API-Key": "should-be-ignored" },
        authProvider: mockAuthProvider,
      }

      new OpenAPIServer(configWithBoth)

      // Verify ApiClient was constructed with the AuthProvider, not the headers
      expect(ApiClient).toHaveBeenCalledWith(config.apiBaseUrl, mockAuthProvider, expect.anything())
    })
  })
})
