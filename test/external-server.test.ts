import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as http from "http"

// Mock the MCP SDK modules before importing our modules
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: { method: "tools/list" },
  CallToolRequestSchema: { method: "tools/call" },
}))

// Import after mocks are set up
import { OpenAPIServer } from "../src/server"
import { StreamableHttpServerTransport } from "../src/transport/StreamableHttpServerTransport"
import type { OpenAPIMCPServerConfig } from "../src/config"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"

/**
 * External Server Tests
 *
 * These tests verify that the package works correctly when used as a library,
 * following the usage pattern documented in the README:
 *
 * ```typescript
 * import { OpenAPIServer } from "@ivotoby/openapi-mcp-server"
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
 *
 * const config = {
 *   name: "my-api-server",
 *   version: "1.0.0",
 *   apiBaseUrl: "https://api.example.com",
 *   openApiSpec: "https://api.example.com/openapi.json",
 *   specInputMethod: "url" as const,
 *   headers: { Authorization: "Bearer your-token" },
 *   transportType: "stdio" as const,
 *   toolsMode: "all" as const,
 * }
 *
 * const server = new OpenAPIServer(config)
 * const transport = new StdioServerTransport()
 * await server.start(transport)
 * ```
 */
describe("External Server - OpenAPIServer", () => {
  let server: OpenAPIServer | null = null

  afterEach(() => {
    server = null
    vi.clearAllMocks()
  })

  describe("Basic instantiation", () => {
    it("should create OpenAPIServer with minimal config", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "all",
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
      expect(server).toBeInstanceOf(OpenAPIServer)
    })

    it("should create OpenAPIServer with headers", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        headers: {
          Authorization: "Bearer test-token",
          "X-API-Key": "test-api-key",
        },
        transportType: "stdio",
        toolsMode: "all",
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should create OpenAPIServer with all toolsMode options", () => {
      const baseConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url" as const,
        transportType: "stdio" as const,
      }

      // toolsMode: "all"
      const serverAll = new OpenAPIServer({ ...baseConfig, toolsMode: "all" as const })
      expect(serverAll).toBeDefined()

      // toolsMode: "dynamic"
      const serverDynamic = new OpenAPIServer({ ...baseConfig, toolsMode: "dynamic" as const })
      expect(serverDynamic).toBeDefined()

      // toolsMode: "explicit"
      const serverExplicit = new OpenAPIServer({
        ...baseConfig,
        toolsMode: "explicit" as const,
        includeTools: ["GET::users"],
      })
      expect(serverExplicit).toBeDefined()
    })

    it("should create OpenAPIServer with specInputMethod variations", () => {
      const baseConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        transportType: "stdio" as const,
        toolsMode: "all" as const,
      }

      // specInputMethod: "url"
      const serverUrl = new OpenAPIServer({
        ...baseConfig,
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url" as const,
      })
      expect(serverUrl).toBeDefined()

      // specInputMethod: "file"
      const serverFile = new OpenAPIServer({
        ...baseConfig,
        openApiSpec: "./openapi.json",
        specInputMethod: "file" as const,
      })
      expect(serverFile).toBeDefined()

      // specInputMethod: "inline"
      const serverInline = new OpenAPIServer({
        ...baseConfig,
        openApiSpec: "inline",
        specInputMethod: "inline" as const,
        inlineSpecContent: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Test", version: "1.0.0" },
          paths: {},
        }),
      })
      expect(serverInline).toBeDefined()
    })
  })

  describe("Transport configuration", () => {
    it("should accept stdio transport type in config", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "all",
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should accept http transport type in config", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "http",
        httpPort: 3000,
        httpHost: "127.0.0.1",
        endpointPath: "/mcp",
        toolsMode: "all",
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })
  })

  describe("Filtering options", () => {
    it("should accept includeTools filter", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "explicit",
        includeTools: ["GET::users", "POST::users"],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should accept includeTags filter", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "all",
        includeTags: ["users", "admin"],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should accept includeResources filter", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "all",
        includeResources: ["/users", "/orders"],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should accept includeOperations filter", () => {
      const config: OpenAPIMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        apiBaseUrl: "https://api.example.com",
        openApiSpec: "https://api.example.com/openapi.json",
        specInputMethod: "url",
        transportType: "stdio",
        toolsMode: "all",
        includeOperations: ["get", "post"],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })
  })
})

/**
 * Tests for the documented external server pattern with mock transport
 */
describe("External Server - Start with Transport", () => {
  let server: OpenAPIServer | null = null
  let mockTransport: Transport

  beforeEach(() => {
    mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Transport

    vi.clearAllMocks()
  })

  afterEach(() => {
    server = null
  })

  it("should start server with custom transport (documented pattern)", async () => {
    // This tests the exact pattern from the README
    const config: OpenAPIMCPServerConfig = {
      name: "my-api-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      headers: {
        Authorization: "Bearer your-token",
        "X-API-Key": "your-api-key",
      },
      transportType: "stdio",
      toolsMode: "all",
    }

    server = new OpenAPIServer(config)

    // Mock the toolsManager.initialize to not actually load specs
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.initialize = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getToolsWithIds = vi.fn().mockReturnValue([])
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getOpenApiSpec = vi.fn().mockReturnValue(null)

    await server.start(mockTransport)

    // Verify initialize was called
    // @ts-expect-error: accessing private member for testing
    expect(server.toolsManager.initialize).toHaveBeenCalled()
  })

  it("should work with StdioServerTransport mock", async () => {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js")

    const config: OpenAPIMCPServerConfig = {
      name: "test-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      transportType: "stdio",
      toolsMode: "all",
    }

    server = new OpenAPIServer(config)
    const transport = new StdioServerTransport()

    // @ts-expect-error: accessing private member for testing
    server.toolsManager.initialize = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getToolsWithIds = vi.fn().mockReturnValue([])
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getOpenApiSpec = vi.fn().mockReturnValue(null)

    await server.start(transport)

    // @ts-expect-error: accessing private member for testing
    expect(server.toolsManager.initialize).toHaveBeenCalled()
  })
})

/**
 * Integration tests for external server with real HTTP transport
 */
describe("External Server - HTTP Transport Integration", () => {
  let server: OpenAPIServer | null = null
  let transport: StreamableHttpServerTransport | null = null
  let externalServer: http.Server | null = null
  const TEST_PORT = 3457
  const TEST_HOST = "127.0.0.1"
  const MCP_ENDPOINT = "/mcp"

  const waitForClose = (ms: number = 100): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms))

  afterEach(async () => {
    if (transport) {
      try {
        await transport.close()
      } catch {
        // Ignore close errors
      }
      transport = null
    }
    if (externalServer) {
      await new Promise<void>((resolve) => {
        externalServer!.close(() => resolve())
      }).catch(() => {})
      externalServer = null
    }
    server = null
    await waitForClose(50)
  })

  it("should start server with StreamableHttpServerTransport", async () => {
    const config: OpenAPIMCPServerConfig = {
      name: "http-test-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      transportType: "http",
      httpPort: TEST_PORT,
      httpHost: TEST_HOST,
      endpointPath: MCP_ENDPOINT,
      toolsMode: "dynamic", // Use dynamic to avoid loading actual specs
    }

    server = new OpenAPIServer(config)
    transport = new StreamableHttpServerTransport(TEST_PORT, TEST_HOST, MCP_ENDPOINT)

    // Mock the toolsManager to avoid network calls
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.initialize = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getToolsWithIds = vi.fn().mockReturnValue([])
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getOpenApiSpec = vi.fn().mockReturnValue(null)

    await server.start(transport)

    // Verify server is running by checking health endpoint
    const response = await makeRequest(`http://${TEST_HOST}:${TEST_PORT}/health`)
    expect(response.statusCode).toBe(200)

    const body = JSON.parse(response.body) as { status: string }
    expect(body.status).toBe("healthy")
  })

  it("should handle MCP initialize request when used as library", async () => {
    const config: OpenAPIMCPServerConfig = {
      name: "mcp-library-test",
      version: "2.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      transportType: "http",
      httpPort: TEST_PORT,
      httpHost: TEST_HOST,
      endpointPath: MCP_ENDPOINT,
      toolsMode: "dynamic",
    }

    server = new OpenAPIServer(config)
    transport = new StreamableHttpServerTransport(TEST_PORT, TEST_HOST, MCP_ENDPOINT, externalServer)

    // @ts-expect-error: accessing private member for testing
    server.toolsManager.initialize = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getToolsWithIds = vi.fn().mockReturnValue([])
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getOpenApiSpec = vi.fn().mockReturnValue(null)

    await server.start(transport)

    // Test MCP endpoint responds correctly
    const response = await makeRequest(`http://${TEST_HOST}:${TEST_PORT}${MCP_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    })

    // Should reject non-JSON content type
    expect(response.statusCode).toBe(415)
  })

  it("should work with external http.Server passed to transport", async () => {
    const config: OpenAPIMCPServerConfig = {
      name: "external-server-test",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      transportType: "http",
      httpPort: TEST_PORT,
      httpHost: TEST_HOST,
      endpointPath: MCP_ENDPOINT,
      toolsMode: "dynamic",
    }

    // Create external server with custom routes
    let customRouteHit = false
    externalServer = http.createServer((req, res) => {
      if (req.url === "/api/custom") {
        customRouteHit = true
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ custom: true }))
        return
      }
    })

    server = new OpenAPIServer(config)
    transport = new StreamableHttpServerTransport(
      TEST_PORT,
      TEST_HOST,
      MCP_ENDPOINT,
      externalServer,
    )

    // @ts-expect-error: accessing private member for testing
    server.toolsManager.initialize = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getToolsWithIds = vi.fn().mockReturnValue([])
    // @ts-expect-error: accessing private member for testing
    server.toolsManager.getOpenApiSpec = vi.fn().mockReturnValue(null)

    await server.start(transport)

    // Custom route should work
    const customResponse = await makeRequest(`http://${TEST_HOST}:${TEST_PORT}/api/custom`)
    expect(customResponse.statusCode).toBe(200)
    expect(customRouteHit).toBe(true)

    // Health endpoint should also work
    const healthResponse = await makeRequest(`http://${TEST_HOST}:${TEST_PORT}/health`)
    expect(healthResponse.statusCode).toBe(200)
  })
})

/**
 * Tests for module exports - verify all expected exports are available
 */
describe("External Server - Module Exports", () => {
  it("should export OpenAPIServer class", async () => {
    const { OpenAPIServer } = await import("../src/index")
    expect(OpenAPIServer).toBeDefined()
    expect(typeof OpenAPIServer).toBe("function")
  })

  it("should export StreamableHttpServerTransport class", async () => {
    const { StreamableHttpServerTransport } = await import("../src/index")
    expect(StreamableHttpServerTransport).toBeDefined()
    expect(typeof StreamableHttpServerTransport).toBe("function")
  })

  it("should export ApiClient class", async () => {
    const { ApiClient } = await import("../src/index")
    expect(ApiClient).toBeDefined()
    expect(typeof ApiClient).toBe("function")
  })

  it("should export ToolsManager class", async () => {
    const { ToolsManager } = await import("../src/index")
    expect(ToolsManager).toBeDefined()
    expect(typeof ToolsManager).toBe("function")
  })

  it("should export config utilities", async () => {
    const { loadConfig, parseHeaders } = await import("../src/index")
    expect(loadConfig).toBeDefined()
    expect(parseHeaders).toBeDefined()
    expect(typeof loadConfig).toBe("function")
    expect(typeof parseHeaders).toBe("function")
  })

  it("should export auth provider classes", async () => {
    const { StaticAuthProvider } = await import("../src/index")
    expect(StaticAuthProvider).toBeDefined()
    expect(typeof StaticAuthProvider).toBe("function")
  })

  it("should export OpenAPISpecLoader", async () => {
    const { OpenAPISpecLoader } = await import("../src/index")
    expect(OpenAPISpecLoader).toBeDefined()
    expect(typeof OpenAPISpecLoader).toBe("function")
  })
})

/**
 * Tests for documented usage examples from README
 */
describe("External Server - README Examples", () => {
  it("should work with the basic external server example pattern", () => {
    // This mirrors the basic-library-usage example
    const config = {
      name: "my-api-mcp-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url" as const,
      headers: {
        Authorization: "Bearer your-api-token",
        "X-API-Key": "your-api-key",
        "User-Agent": "MyApp/1.0.0",
      },
      transportType: "stdio" as const,
      toolsMode: "all" as const,
    }

    const server = new OpenAPIServer(config)
    expect(server).toBeDefined()

    // Verify the config was accepted without errors
    // @ts-expect-error: accessing private member for testing
    expect(server.toolsManager).toBeDefined()
    // @ts-expect-error: accessing private member for testing
    expect(server.apiClient).toBeDefined()
  })

  it("should work with dynamic tools mode", () => {
    const config = {
      name: "dynamic-tools-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url" as const,
      transportType: "stdio" as const,
      toolsMode: "dynamic" as const,
    }

    const server = new OpenAPIServer(config)
    expect(server).toBeDefined()
  })

  it("should work with explicit tools mode", () => {
    const config = {
      name: "explicit-tools-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url" as const,
      transportType: "stdio" as const,
      toolsMode: "explicit" as const,
      includeTools: ["GET::users", "POST::users"],
    }

    const server = new OpenAPIServer(config)
    expect(server).toBeDefined()
  })

  it("should work with HTTP transport configuration", () => {
    const config = {
      name: "http-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url" as const,
      transportType: "http" as const,
      httpPort: 3000,
      httpHost: "127.0.0.1",
      endpointPath: "/mcp",
      toolsMode: "all" as const,
    }

    const server = new OpenAPIServer(config)
    expect(server).toBeDefined()
  })
})

/**
 * Helper function to make HTTP requests
 */
function makeRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {},
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const reqOptions: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || "GET",
      headers: options.headers || {},
    }

    const req = http.request(reqOptions, (res) => {
      let body = ""
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString()
      })
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body,
          headers: res.headers,
        })
      })
    })

    req.on("error", reject)

    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error("Request timeout"))
    })

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}
