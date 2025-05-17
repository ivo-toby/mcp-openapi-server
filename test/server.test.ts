import { describe, it, expect, beforeEach, vi } from "vitest"
import type { OpenAPIMCPServerConfig } from "../src/config"

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
}

describe("OpenAPIServer", () => {
  let server: OpenAPIServer
  let mockServer: { setRequestHandler: Mock; connect: Mock }
  let mockToolsManager: { initialize: Mock; getAllTools: Mock; findTool: Mock }
  let mockApiClient: { executeApiCall: Mock }

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
        }) as any,
    )

    vi.mocked(ApiClient).mockImplementation(
      () =>
        ({
          executeApiCall: vi.fn(),
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

  it("should handle tool execution success", async () => {
    const handler = vi.mocked(mockServer.setRequestHandler).mock.calls[1][1]

    vi.mocked(mockToolsManager.findTool).mockReturnValue({
      toolId: "get-ping",
      tool: { name: "ping" },
    })
    vi.mocked(mockApiClient.executeApiCall).mockResolvedValue({ ok: true })

    const req = { params: { id: "get-ping", arguments: { foo: "bar" } } }
    const result = await handler(req)
    expect(result.content[0].text).toContain("ok")
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
      toolId: "get-ping",
      tool: { name: "ping" },
    })
    vi.mocked(mockApiClient.executeApiCall).mockRejectedValue(new Error("fail"))

    const req = { params: { id: "get-ping", arguments: {} } }
    const result = await handler(req)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("fail")
  })

  it("should start the server", async () => {
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
})
