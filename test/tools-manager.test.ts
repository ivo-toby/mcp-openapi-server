import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { ToolsManager } from "../src/tools-manager"
import { OpenAPISpecLoader, ExtendedTool } from "../src/openapi-loader"
import { Tool } from "@modelcontextprotocol/sdk/types.js"
import { parseToolId as parseToolIdUtil } from "../src/utils/tool-id.js"

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
        ["GET::users", { name: "List Users", description: "Get all users" } as Tool],
        ["POST::users", { name: "Create User", description: "Create a new user" } as Tool],
      ])

      mockSpecLoader.loadOpenAPISpec.mockResolvedValue(mockSpec)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)

      await toolsManager.initialize()

      expect(mockSpecLoader.loadOpenAPISpec).toHaveBeenCalledWith(
        mockConfig.openApiSpec,
        undefined,
        undefined,
      )
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
        "list-api-endpoints",
        "get-api-endpoint-schema",
        "invoke-api-endpoint",
      ])
    })

    describe("toolsMode: explicit", () => {
      it("should only load tools explicitly listed in includeTools when toolsMode is explicit", async () => {
        // Setup raw tools
        const mockTools = new Map([
          [
            "GET::users",
            { name: "getUsers", httpMethod: "GET", resourceName: "users" } as ExtendedTool,
          ],
          [
            "POST::users",
            { name: "createUser", httpMethod: "POST", resourceName: "users" } as ExtendedTool,
          ],
          [
            "GET::orders",
            { name: "getOrders", httpMethod: "GET", resourceName: "orders" } as ExtendedTool,
          ],
          [
            "DELETE::orders-id",
            { name: "deleteOrder", httpMethod: "DELETE", resourceName: "orders" } as ExtendedTool,
          ],
        ])
        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)

        // Configure for explicit mode with specific tools
        ;(toolsManager as any).config.toolsMode = "explicit"
        ;(toolsManager as any).config.includeTools = ["GET::users", "POST::users"]

        await toolsManager.initialize()

        // Should only include explicitly listed tools, ignoring other filters
        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        expect(resultToolIds).toEqual(["GET::users", "POST::users"])
      })

      it("should load no tools when toolsMode is explicit but includeTools is empty", async () => {
        const mockTools = new Map([
          ["GET::users", { name: "getUsers" } as ExtendedTool],
          ["POST::users", { name: "createUser" } as ExtendedTool],
        ])
        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "explicit"
        ;(toolsManager as any).config.includeTools = []

        await toolsManager.initialize()

        expect(Array.from((toolsManager as any).tools.keys())).toEqual([])
      })

      it("should ignore include filters but still apply excludeTags when toolsMode is explicit", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: "GET",
              resourceName: "users",
              tags: ["public"],
            } as ExtendedTool,
          ],
          [
            "POST::orders",
            {
              name: "createOrder",
              httpMethod: "POST",
              resourceName: "orders",
              tags: ["admin"],
            } as ExtendedTool,
          ],
        ])
        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "explicit"
        ;(toolsManager as any).config.includeTools = ["POST::orders"] // Explicitly include POST::orders
        ;(toolsManager as any).config.includeOperations = ["get"] // This should be ignored
        ;(toolsManager as any).config.includeResources = ["users"] // This should be ignored
        ;(toolsManager as any).config.includeTags = ["public"] // This should be ignored
        ;(toolsManager as any).config.excludeTags = ["admin"] // This should still deny the tool

        await toolsManager.initialize()

        expect(Array.from((toolsManager as any).tools.keys())).toEqual([])
      })

      it("should handle tool names in includeTools for explicit mode", async () => {
        const mockTools = new Map([
          ["GET::users", { name: "getUsers", httpMethod: "GET" } as ExtendedTool],
          ["POST::users", { name: "createUser", httpMethod: "POST" } as ExtendedTool],
          ["GET::orders", { name: "getOrders", httpMethod: "GET" } as ExtendedTool],
        ])
        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "explicit"
        ;(toolsManager as any).config.includeTools = ["getUsers", "createUser"] // Using tool names instead of IDs

        await toolsManager.initialize()

        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        expect(resultToolIds).toEqual(["GET::users", "POST::users"])
      })
    })

    describe("Resource Name Extraction Logic", () => {
      it("should handle complex path examples for resource filtering", async () => {
        const mockTools = new Map([
          // Simple resource paths
          ["GET::users", { name: "getUsers", resourceName: "users" } as ExtendedTool],
          ["GET::orders", { name: "getOrders", resourceName: "orders" } as ExtendedTool],

          // Complex nested paths - resource should be the last non-parameter segment
          [
            "GET::api__v1__user__profile__settings",
            { name: "userProfileSettings", resourceName: "settings" } as ExtendedTool,
          ],
          [
            "POST::api__v2__organizations__id__members",
            { name: "addOrgMember", resourceName: "members" } as ExtendedTool,
          ],
          [
            "PUT::service__users__authority__groups__id",
            { name: "updateAuthorityGroup", resourceName: "groups" } as ExtendedTool,
          ],

          // Paths with hyphens and underscores
          [
            "GET::user_profile__data",
            { name: "userProfileData", resourceName: "data" } as ExtendedTool,
          ],
          [
            "POST::api__v1__user__management",
            { name: "manageUser", resourceName: "management" } as ExtendedTool,
          ],

          // Edge cases
          ["GET::health", { name: "healthCheck", resourceName: "health" } as ExtendedTool],
          [
            "GET::api__status__check",
            { name: "statusCheck", resourceName: "check" } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"

        // Test filtering by different resource names
        const testCases = [
          { filter: ["users"], expected: ["GET::users"] },
          { filter: ["settings"], expected: ["GET::api__v1__user__profile__settings"] },
          { filter: ["members"], expected: ["POST::api__v2__organizations__id__members"] },
          { filter: ["groups"], expected: ["PUT::service__users__authority__groups__id"] },
          { filter: ["data"], expected: ["GET::user_profile__data"] },
          { filter: ["management"], expected: ["POST::api__v1__user__management"] },
          { filter: ["health"], expected: ["GET::health"] },
          { filter: ["check"], expected: ["GET::api__status__check"] },
          { filter: ["users", "data"], expected: ["GET::users", "GET::user_profile__data"] },
        ]

        for (const testCase of testCases) {
          // Reset tools manager for each test
          const freshToolsManager = new ToolsManager({
            ...mockConfig,
            toolsMode: "all",
            includeResources: testCase.filter,
          })
          ;(freshToolsManager as any).specLoader = mockSpecLoader

          await freshToolsManager.initialize()

          const resultToolIds = Array.from((freshToolsManager as any).tools.keys())
          expect(resultToolIds.sort()).toEqual(testCase.expected.sort())
        }
      })

      it("should handle resource names with special characters and case variations", async () => {
        const mockTools = new Map([
          [
            "GET::api__user_profiles",
            { name: "userProfiles", resourceName: "user_profiles" } as ExtendedTool,
          ],
          ["GET::api__UserData", { name: "getUserData", resourceName: "UserData" } as ExtendedTool],
          [
            "GET::api__ADMIN_PANEL",
            { name: "adminPanel", resourceName: "ADMIN_PANEL" } as ExtendedTool,
          ],
          [
            "GET::api__kebab-case-resource",
            { name: "kebabResource", resourceName: "kebab-case-resource" } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"
        ;(toolsManager as any).config.includeResources = [
          "user_profiles",
          "userdata",
          "admin_panel",
        ] // Mixed case filters

        await toolsManager.initialize()

        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        // Should match case-insensitively
        expect(resultToolIds.sort()).toEqual(
          ["GET::api__user_profiles", "GET::api__UserData", "GET::api__ADMIN_PANEL"].sort(),
        )
      })
    })

    describe("Filter Order of Application", () => {
      it("should apply excludeTags before other include filters", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: "GET",
              resourceName: "users",
              tags: ["public", "read"],
            } as ExtendedTool,
          ],
          [
            "POST::users",
            {
              name: "createUser",
              httpMethod: "POST",
              resourceName: "users",
              tags: ["admin", "write"],
            } as ExtendedTool,
          ],
          [
            "GET::orders",
            {
              name: "getOrders",
              httpMethod: "GET",
              resourceName: "orders",
              tags: ["public", "read"],
            } as ExtendedTool,
          ],
          [
            "DELETE::orders-id",
            {
              name: "deleteOrder",
              httpMethod: "DELETE",
              resourceName: "orders",
              tags: ["admin", "write"],
            } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"

        // Apply all filters - should work as AND operation
        ;(toolsManager as any).config.includeOperations = ["get", "post"] // Excludes DELETE
        ;(toolsManager as any).config.includeResources = ["users"] // Excludes orders
        ;(toolsManager as any).config.excludeTags = ["write"] // Excludes write tools
        ;(toolsManager as any).config.includeTags = ["public"] // Excludes admin-only tools

        await toolsManager.initialize()

        // Only GET::users should match all criteria:
        // - Operation: GET (✓) or POST (✗ - has admin tag, not public)
        // - Resource: users (✓)
        // - ExcludeTags: write (✓)
        // - Tags: public (✓)
        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        expect(resultToolIds).toEqual(["GET::users"])
      })

      it("should let excludeTags override includeTools", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: "GET",
              resourceName: "users",
              tags: ["public"],
            } as ExtendedTool,
          ],
          [
            "DELETE::orders-id",
            {
              name: "deleteOrder",
              httpMethod: "DELETE",
              resourceName: "orders",
              tags: ["admin"],
            } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"
        ;(toolsManager as any).config.includeTools = ["DELETE::orders-id"]
        ;(toolsManager as any).config.excludeTags = ["admin"]
        ;(toolsManager as any).config.includeOperations = ["get"] // Would normally exclude DELETE
        ;(toolsManager as any).config.includeResources = ["users"] // Would normally exclude orders
        ;(toolsManager as any).config.includeTags = ["public"] // Would normally exclude admin

        await toolsManager.initialize()

        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        expect(resultToolIds).toEqual([])
      })

      it("should handle empty filter arrays correctly", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: "GET",
              resourceName: "users",
              tags: ["public"],
            } as ExtendedTool,
          ],
          [
            "POST::orders",
            {
              name: "createOrder",
              httpMethod: "POST",
              resourceName: "orders",
              tags: ["admin"],
            } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"

        // Empty arrays should not filter anything
        ;(toolsManager as any).config.includeTools = []
        ;(toolsManager as any).config.includeOperations = []
        ;(toolsManager as any).config.includeResources = []
        ;(toolsManager as any).config.excludeTags = []
        ;(toolsManager as any).config.includeTags = []

        await toolsManager.initialize()

        // All tools should be included
        const resultToolIds = Array.from((toolsManager as any).tools.keys())
        expect(resultToolIds.sort()).toEqual(["GET::users", "POST::orders"])
      })
    })

    it("should filter tools by includeTools list", async () => {
      // Setup raw tools
      const mockTools = new Map([
        ["GET::foo", { name: "foo" } as Tool],
        ["GET::bar", { name: "bar" } as Tool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeTools = ["GET::bar"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::bar"])
    })

    it("should filter tools by includeOperations list", async () => {
      const mockTools = new Map([
        ["GET::1", { name: "g1", httpMethod: "GET" } as ExtendedTool],
        ["POST::1", { name: "p1", httpMethod: "POST" } as ExtendedTool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeOperations = ["get"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::1"])
    })

    it("should filter tools by includeResources list", async () => {
      const mockTools = new Map([
        ["GET::users", { name: "u", resourceName: "users" } as ExtendedTool],
        ["GET::orders-id", { name: "o", resourceName: "orders" } as ExtendedTool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeResources = ["users"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::users"])
    })

    it("should filter tools by includeTags list", async () => {
      const mockTools = new Map([
        ["GET::a", { name: "a", tags: ["x"] } as ExtendedTool],
        ["GET::b", { name: "b", tags: ["y"] } as ExtendedTool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeTags = ["x"]
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::a"])
    })

    it("should filter tools by includeTags list case-insensitively", async () => {
      const mockTools = new Map([
        ["GET::a", { name: "a", tags: ["USERS"] } as ExtendedTool],
        ["GET::b", { name: "b", tags: ["products"] } as ExtendedTool],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeTags = ["users"] // lowercase, will match uppercase "USERS"
      await toolsManager.initialize()
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::a"])
    })

    it("should filter tools by excludeTags list case-insensitively", async () => {
      const mockTools = new Map([
        ["GET::users", { name: "users", tags: ["PUBLIC"] } as ExtendedTool],
        ["DELETE::admin", { name: "deleteAdmin", tags: ["Admin"] } as ExtendedTool],
        [
          "GET::untagged",
          {
            name: "untagged",
            inputSchema: { type: "object", properties: {} },
            tags: [],
          } as ExtendedTool,
        ],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.excludeTags = ["admin"]

      await toolsManager.initialize()

      expect(Array.from((toolsManager as any).tools.keys()).sort()).toEqual([
        "GET::untagged",
        "GET::users",
      ])
    })

    it("should filter tools by multiple criteria simultaneously", async () => {
      const mockTools = new Map([
        [
          "GET::users",
          {
            name: "getUsers",
            httpMethod: "GET",
            resourceName: "users",
            tags: ["users", "public"],
          } as ExtendedTool,
        ],
        [
          "POST::users",
          {
            name: "createUser",
            httpMethod: "POST",
            resourceName: "users",
            tags: ["users", "admin"],
          } as ExtendedTool,
        ],
        [
          "GET::orders",
          {
            name: "getOrders",
            httpMethod: "GET",
            resourceName: "orders",
            tags: ["orders"],
          } as ExtendedTool,
        ],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeOperations = ["get"]
      ;(toolsManager as any).config.includeResources = ["users"]
      ;(toolsManager as any).config.includeTags = ["public"]
      await toolsManager.initialize()
      // Should only include GET::users because it matches all criteria
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::users"])
    })

    it("should handle tools with missing metadata gracefully", async () => {
      const mockTools = new Map([
        [
          "GET::users",
          {
            name: "getUsers",
            httpMethod: "GET",
            resourceName: "users",
            tags: ["users"],
          } as ExtendedTool,
        ],
        [
          "POST::unknown",
          {
            name: "unknownTool",
            // Missing httpMethod, resourceName, tags
          } as ExtendedTool,
        ],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeOperations = ["get"]
      await toolsManager.initialize()
      // Should only include GET::users because POST::unknown has no httpMethod
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::users"])
    })

    it("should filter by resource names case-insensitively", async () => {
      const mockTools = new Map([
        [
          "GET::users",
          {
            name: "getUsers",
            resourceName: "Users", // uppercase
          } as ExtendedTool,
        ],
        [
          "GET::orders",
          {
            name: "getOrders",
            resourceName: "orders", // lowercase
          } as ExtendedTool,
        ],
      ])
      mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
      mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
      ;(toolsManager as any).config.toolsMode = "all"
      ;(toolsManager as any).config.includeResources = ["users"] // lowercase filter
      await toolsManager.initialize()
      // Should match "Users" resource case-insensitively
      expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::users"])
    })

    describe("Edge Cases and Error Handling", () => {
      it("should handle undefined or null filter arrays", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: "GET",
              resourceName: "users",
              tags: ["public"],
            } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"

        // Set filters to undefined/null
        ;(toolsManager as any).config.includeTools = undefined
        ;(toolsManager as any).config.includeOperations = null
        ;(toolsManager as any).config.includeResources = undefined
        ;(toolsManager as any).config.excludeTags = null
        ;(toolsManager as any).config.includeTags = null

        await toolsManager.initialize()

        // Should include all tools when filters are undefined/null
        expect(Array.from((toolsManager as any).tools.keys())).toEqual(["GET::users"])
      })

      it("should handle tools with empty or undefined tags arrays", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              tags: [],
              inputSchema: { type: "object", properties: {} },
            } as ExtendedTool,
          ],
          [
            "POST::orders",
            {
              name: "createOrder",
              tags: undefined,
              inputSchema: { type: "object", properties: {} },
            } as ExtendedTool,
          ],
          [
            "PUT::products",
            {
              name: "updateProduct",
              inputSchema: { type: "object", properties: {} },
            } as ExtendedTool,
          ], // No tags property
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"
        ;(toolsManager as any).config.includeTags = ["public"]

        await toolsManager.initialize()

        // No tools should match since none have the "public" tag
        expect(Array.from((toolsManager as any).tools.keys())).toEqual([])
      })

      it("should handle malformed tool metadata gracefully", async () => {
        const mockTools = new Map([
          [
            "GET::users",
            {
              name: "getUsers",
              httpMethod: 123,
              resourceName: null,
              tags: "not-an-array",
              inputSchema: { type: "object", properties: {} },
            } as any,
          ],
          [
            "POST::orders",
            {
              name: "createOrder",
              httpMethod: "",
              resourceName: "",
              tags: [],
              inputSchema: { type: "object", properties: {} },
            } as ExtendedTool,
          ],
        ])

        mockSpecLoader.loadOpenAPISpec.mockResolvedValue({ paths: {} } as any)
        mockSpecLoader.parseOpenAPISpec.mockReturnValue(mockTools)
        ;(toolsManager as any).config.toolsMode = "all"
        ;(toolsManager as any).config.includeOperations = ["post"]

        await toolsManager.initialize()

        // Should handle malformed data gracefully and only include valid tools
        expect(Array.from((toolsManager as any).tools.keys())).toEqual([])
      })
    })
  })

  describe("getAllTools - return all tools", () => {
    it("should return all tools", async () => {
      const mockTools = new Map([
        ["GET::users", { name: "List Users" } as Tool],
        ["POST::users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const tools = toolsManager.getAllTools()

      expect(tools).toEqual([{ name: "List Users" }, { name: "Create User" }])
    })
  })

  describe("getToolsWithIds", () => {
    it("should return all tools with their IDs", async () => {
      const mockTools = new Map([
        ["GET::users", { name: "List Users" } as Tool],
        ["POST::users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const toolsWithIds = toolsManager.getToolsWithIds()

      expect(toolsWithIds).toEqual([
        ["GET::users", { name: "List Users" }],
        ["POST::users", { name: "Create User" }],
      ])
    })
  })

  describe("findTool", () => {
    it("should find a tool by ID", () => {
      const mockTools = new Map([
        ["GET::users", { name: "List Users" } as Tool],
        ["POST::users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("GET::users")

      expect(result).toEqual({
        toolId: "GET::users",
        tool: { name: "List Users" },
      })
    })

    it("should find a tool by name", () => {
      const mockTools = new Map([
        ["GET::users", { name: "List Users" } as Tool],
        ["POST::users", { name: "Create User" } as Tool],
      ])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("Create User")

      expect(result).toEqual({
        toolId: "POST::users",
        tool: { name: "Create User" },
      })
    })

    it("should return undefined if tool is not found", () => {
      const mockTools = new Map([["GET::users", { name: "List Users" } as Tool]])

      // Set up the tools map
      vi.spyOn(toolsManager as any, "tools", "get").mockReturnValue(mockTools)

      const result = toolsManager.findTool("nonexistent")

      expect(result).toBeUndefined()
    })
  })

  describe("parseToolId", () => {
    it("should parse a tool ID into method and path", () => {
      const result = toolsManager.parseToolId("GET::users__active")
      expect(result).toEqual({
        method: "GET",
        path: "/users/active",
      })
    })

    it("should handle complex paths with hyphens", () => {
      const result = toolsManager.parseToolId("POST::api__v1__user-profile__update")
      expect(result).toEqual({
        method: "POST",
        path: "/api/v1/user-profile/update",
      })
    })

    it("should handle paths with underscores", () => {
      const result = toolsManager.parseToolId("GET::user_profile__user_id")
      expect(result).toEqual({
        method: "GET",
        path: "/user_profile/user_id",
      })
    })

    it("should handle paths with special characters (encoded)", () => {
      const specialPath = "/user_profile/{user_id}/data-2024_06"
      const pathPart = "user_profile__user_id__data-2024_06"
      const toolId = `GET::${pathPart}`
      const result = toolsManager.parseToolId(toolId)
      expect(result).toEqual({
        method: "GET",
        path: "/user_profile/user_id/data-2024_06",
      })
    })

    it("should round-trip encode and decode toolId for any path", () => {
      const paths = [
        "/user_profile/{user_id}",
        "/api/v1/user-profile_update",
        "/foo-bar_baz/123",
        "/complex/path_with-mixed_chars/and123",
      ]
      for (const path of paths) {
        const method = "GET"
        // Simulate the toolId generation process with new format
        const cleanPath = path
          .replace(/^\//, "")
          .replace(/\{([^}]+)\}/g, "$1")
          .replace(/\//g, "__") // Use double underscores now
        const toolId = `${method}::${cleanPath}`
        const { method: parsedMethod, path: parsedPath } = toolsManager.parseToolId(toolId)
        expect(parsedMethod).toBe(method)
        // The parsed path should reconstruct the original API path structure
        const expectedPath = "/" + cleanPath.replace(/__/g, "/")
        expect(parsedPath).toBe(expectedPath)
      }
    })

    it("should handle legitimate hyphens in path segments correctly", () => {
      // Test the enhanced hyphen handling - now much simpler with double underscores
      const testCases = [
        {
          toolId: "GET::api__resource-name__items",
          expected: { method: "GET", path: "/api/resource-name/items" },
        },
        {
          toolId: "POST::user-profile__data",
          expected: { method: "POST", path: "/user-profile/data" },
        },
        {
          toolId: "PUT::api__v1__user-management-system",
          expected: { method: "PUT", path: "/api/v1/user-management-system" },
        },
        {
          toolId: "DELETE::complex-path__with-multiple-hyphens",
          expected: { method: "DELETE", path: "/complex-path/with-multiple-hyphens" },
        },
      ]

      for (const testCase of testCases) {
        const result = toolsManager.parseToolId(testCase.toolId)
        expect(result).toEqual(testCase.expected)
      }
    })

    it("REGRESSION: should resolve original toolId ambiguity issue with underscores and hyphens", () => {
      // This test validates that the original issue is resolved:
      // The new double underscore format eliminates all ambiguity

      const problematicPaths = [
        // Original problematic case: path with underscores and hyphens
        "/user_profile-data",
        "/api_v1-user-management",
        "/service_users-authority_groups",
        // Edge cases that could cause confusion
        "/user-profile_data",
        "/api-v1_user_management",
        "/complex_path-with-mixed_separators",
      ]

      for (const originalPath of problematicPaths) {
        const method = "POST"

        // Step 1: Simulate toolId generation (as done in openapi-loader.ts)
        const cleanPath = originalPath
          .replace(/^\//, "") // Remove leading slash
          .replace(/\{([^}]+)\}/g, "$1") // Remove curly braces from path params
          .replace(/\//g, "__") // Convert slashes to double underscores
        const toolId = `${method}::${cleanPath}`

        // Step 2: Parse the toolId back (as done in tools-manager.ts and api-client.ts)
        const { method: parsedMethod, path: parsedPath } = toolsManager.parseToolId(toolId)

        // Step 3: Validate the round-trip is unambiguous
        expect(parsedMethod).toBe(method)

        // The parsed path should reconstruct the original API path structure
        const expectedPath = "/" + cleanPath.replace(/__/g, "/")
        expect(parsedPath).toBe(expectedPath)

        // Step 4: Validate that the toolId format is unambiguous
        // The :: separator ensures we can always split correctly
        expect(toolId).toContain("::")
        expect(toolId.split("::")).toHaveLength(2)
        expect(toolId.split("::")[0]).toBe(method)
        expect(toolId.split("::")[1]).toBe(cleanPath)
      }
    })

    it("REGRESSION: demonstrates that old format would have been ambiguous", () => {
      // This test demonstrates why the old format was problematic
      // and validates that the new format resolves the ambiguity

      const problematicPaths = [
        "/user_profile-data", // Could be confused with "/user/profile-data"
        "/api-v1_user", // Could be confused with "/api-v1/user"
        "/service_users-groups", // Could be confused with "/service/users-groups"
      ]

      for (const path of problematicPaths) {
        // With the OLD format (using single hyphen separator):
        // The toolId would be: "GET-user_profile-data"
        // When parsing, it's ambiguous where the method ends and path begins
        // because both method separator and path parts use hyphens

        // With the NEW format (using :: separator and __ for paths):
        const method = "GET"
        const cleanPath = path.replace(/^\//, "").replace(/\//g, "__")
        const newFormatToolId = `${method}::${cleanPath}`

        // The new format is unambiguous because :: only appears once as separator
        // and __ is used for path separators (extremely rare in real APIs)
        expect(newFormatToolId.split("::")).toHaveLength(2)
        expect(newFormatToolId.split("::")[0]).toBe(method)
        expect(newFormatToolId.split("::")[1]).toBe(cleanPath)

        // Parsing is now deterministic and reconstructs the original API path
        const { method: parsedMethod, path: parsedPath } = toolsManager.parseToolId(newFormatToolId)
        expect(parsedMethod).toBe(method)
        expect(parsedPath).toBe("/" + cleanPath.replace(/__/g, "/"))

        // The old format would have been: "GET-user_profile-data"
        // Which could be parsed as:
        // - method="GET", path="/user_profile-data" (incorrect - doesn't reconstruct API path)
        // - method="GET-user", path="/profile-data" (incorrect)
        // - method="GET-user_profile", path="/data" (incorrect)

        // The new format eliminates this ambiguity completely
      }
    })

    it("should use centralized parseToolId utility consistently", () => {
      // Verify that ToolsManager.parseToolId uses the same utility as ApiClient
      // This ensures consistency across modules

      const testToolId = "GET::api__v1__users__id__profile"
      const result = toolsManager.parseToolId(testToolId)

      // Test the utility directly to ensure consistency
      const utilityResult = parseToolIdUtil(testToolId)

      expect(result).toEqual(utilityResult)
      expect(result).toEqual({
        method: "GET",
        path: "/api/v1/users/id/profile",
      })
    })
  })
})
