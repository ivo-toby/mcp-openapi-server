import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { ToolsManager } from "../src/tools-manager"
import { OpenAPISpecLoader } from "../src/openapi-loader"
import { Tool } from "@modelcontextprotocol/sdk/types.js"

// Mock dependencies
vi.mock("../src/openapi-loader", () => {
  return {
    OpenAPISpecLoader: vi.fn().mockImplementation(() => ({
      loadOpenAPISpec: vi.fn(),
      parseOpenAPISpec: vi.fn(),
    })),
  }
})

describe("ToolsManager", () => {
  let toolsManager: ToolsManager
  let mockConfig: any
  let mockSpecLoader: any

  beforeEach(() => {
    mockConfig = {
      name: "test-server",
      version: "1.0.0",
      apiBaseUrl: "http://example.com/api",
      openApiSpec: "http://example.com/openapi.json",
    }

    toolsManager = new ToolsManager(mockConfig)
    mockSpecLoader = (toolsManager as any).specLoader
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("initialize", () => {
    it("should load and parse the OpenAPI spec", async () => {
      const mockSpec = { paths: {} }
      const mockTools = new Map([
        ["GET-users", { name: "List Users", description: "Get all users" } as Tool],
        ["POST-users", { name: "Create User", description: "Create a new user" } as Tool],
      ])

      mockSpecLoader.loadOpenAPISpec.mockResolvedValue(mockSpec)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)

      await toolsManager.initialize()

      expect(mockSpecLoader.loadOpenAPISpec).toHaveBeenCalledWith(mockConfig.openApiSpec)
      expect(mockSpecLoader.parseOpenAPISpec).toHaveBeenCalledWith(mockSpec)
      expect((toolsManager as any).tools).toEqual(mockTools)
    })

    it("should load dynamic meta-tools when toolsMode is dynamic", async () => {
      // Configure for dynamic mode
      ;(toolsManager as any).config.toolsMode = "dynamic"
      const spyLoad = mockSpecLoader.loadOpenAPISpec.mockResolvedValue({} as any)
      await toolsManager.initialize()
      // parseOpenAPISpec should not be called
      expect(mockSpecLoader.parseOpenAPISpec).not.toHaveBeenCalled()
      const tools = toolsManager.getAllTools().map((t) => t.name)
      expect(tools).toEqual([
        "list_api_endpoints",
        "get_api_endpoint_schema",
        "invoke_api_endpoint",
      ])
    })

    it("should filter tools by includeTools list", async () => {
      // Setup raw tools
      const mockTools = new Map([
        ["GET-foo", { name: "foo" } as Tool],
        ["GET-bar", { name: "bar" } as Tool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeTools = ["GET-bar"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET-bar"])
    })

    it("should filter tools by includeOperations list", async () => {
      const mockTools = new Map([
        ["GET-1", { name: "g1" } as Tool],
        ["POST-1", { name: "p1" } as Tool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeOperations = ["get"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET-1"])
    })

    it("should filter tools by includeResources list", async () => {
      const mockTools = new Map([
        ["GET-users", { name: "u" } as Tool],
        ["GET-orders-id", { name: "o" } as Tool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeResources = ["users"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET-users"])
    })

    it("should filter tools by includeTags list", async () => {
      const spec = {
        paths: {
          "/a": { get: { tags: ["x"] } },
          "/b": { get: { tags: ["y"] } },
        },
      } as any
      const mockTools = new Map([
        ["GET-a", { name: "a" } as Tool],
        ["GET-b", { name: "b" } as Tool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue(spec)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeTags = ["x"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET-a"])
    })
  })

  describe("getAllTools", () => {
    it("should return all tools", async () => {
      const mockTools = new Map([
        ["GET-users", { name: "List Users" } as Tool],
        ["POST-users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const tools = toolsManager.getAllTools()

      expect(tools).toEqual([{ name: "List Users" }, { name: "Create User" }])
    })
  })

  describe("findTool", () => {
    it("should find a tool by ID", () => {
      const mockTools = new Map([
        ["GET-users", { name: "List Users" } as Tool],
        ["POST-users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("GET-users")

      expect(result).toEqual({
        toolId: "GET-users",
        tool: { name: "List Users" },
      })
    })

    it("should find a tool by name", () => {
      const mockTools = new Map([
        ["GET-users", { name: "List Users" } as Tool],
        ["POST-users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("Create User")

      expect(result).toEqual({
        toolId: "POST-users",
        tool: { name: "Create User" },
      })
    })

    it("should return undefined if tool is not found", () => {
      const mockTools = new Map([["GET-users", { name: "List Users" } as Tool]])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("nonexistent")

      expect(result).toBeUndefined()
    })
  })

  describe("parseToolId", () => {
    it("should parse a tool ID into method and path", () => {
      const result = toolsManager.parseToolId("GET-users-active")

      expect(result).toEqual({
        method: "GET",
        path: "/users/active",
      })
    })

    it("should handle complex paths with hyphens", () => {
      const result = toolsManager.parseToolId("POST-api-v1-user-profile-update")

      expect(result).toEqual({
        method: "POST",
        path: "/api/v1/user/profile/update",
      })
    })
  })
})
