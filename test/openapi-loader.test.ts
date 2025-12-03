import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { readFile } from "fs/promises"
import { OpenAPISpecLoader, ExtendedTool } from "../src/openapi-loader"
import { OpenAPIV3 } from "openapi-types"
import { Tool } from "@modelcontextprotocol/sdk/types.js"

// Mock dependencies
vi.mock("fs/promises")

vi.mock("js-yaml", async () => {
  const actualJsYamlMod = await vi.importActual<typeof import("js-yaml")>("js-yaml")

  // The SUT (System Under Test) uses "import yaml from 'js-yaml'",
  // which means it expects 'js-yaml' to have a default export.
  // The mocked 'load' function for this default export should call the actual 'load' from js-yaml.
  // According to @types/js-yaml, the 'load' function is a direct export of the module.
  const realLoadFn = actualJsYamlMod.load

  if (typeof realLoadFn !== "function") {
    // This would be unexpected if @types/js-yaml is correct and js-yaml is installed.
    console.error(
      "Vitest mock issue: js-yaml .load function not found on actualJsYamlMod as per types.",
      actualJsYamlMod,
    )
    throw new Error("Vitest mock setup: actualJsYamlMod.load is not a function")
  }

  return {
    default: {
      load: vi.fn((content: string) => realLoadFn(content)),
    },
    // Provide other exports as well, consistent with the actual module, in case they are ever used.
    load: vi.fn((content: string) => realLoadFn(content)),
    // safeLoad: vi.fn((content: string) => actualJsYamlMod.safeLoad(content)), // Temporarily remove if causing type issues
    // Add other js-yaml exports if necessary for full fidelity, though 'load' is the key one here.
  }
})

// Mock fetch globally for tests that might use it
global.fetch = vi.fn()

describe("OpenAPISpecLoader", () => {
  let openAPILoader: OpenAPISpecLoader
  const mockOpenAPISpec: OpenAPIV3.Document = {
    openapi: "3.0.0",
    info: {
      title: "Test API",
      version: "1.0.0",
    },
    paths: {
      "/users": {
        get: {
          operationId: "getUsers",
          summary: "Get all users",
          description: "Returns a list of users",
          parameters: [
            {
              name: "limit",
              in: "query",
              description: "Maximum number of users to return",
              required: false,
              schema: {
                type: "integer",
              },
            },
          ],
          responses: {},
        },
        post: {
          operationId: "createUser",
          summary: "Create a user",
          description: "Creates a new user",
          responses: {},
        },
      },
      "/users/{id}": {
        get: {
          operationId: "getUserById",
          summary: "Get user by ID",
          description: "Returns a user by ID",
          parameters: [
            {
              name: "id",
              in: "path",
              description: "User ID",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {},
        },
      },
    },
  }

  beforeEach(() => {
    openAPILoader = new OpenAPISpecLoader()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe("loadOpenAPISpec", () => {
    it("should load spec from URL", async () => {
      const url = "https://example.com/api-spec.json"
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockOpenAPISpec),
        json: async () => mockOpenAPISpec, // Though text() is used in implementation
      } as Response)

      const result = await openAPILoader.loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(result).toEqual(mockOpenAPISpec)
    })

    it("should load spec from local file (JSON)", async () => {
      const filePath = "./api-spec.json"
      const fileContent = JSON.stringify(mockOpenAPISpec)
      vi.mocked(readFile).mockResolvedValueOnce(fileContent)

      const result = await openAPILoader.loadOpenAPISpec(filePath, "file")

      expect(readFile).toHaveBeenCalledWith(filePath, "utf-8")
      expect(result).toEqual(mockOpenAPISpec)
    })

    it("should load spec from local file (YAML)", async () => {
      const filePath = "./api-spec.yaml"
      const yamlContent = `
openapi: 3.0.0
info:
  title: Test API YAML
  version: 1.0.0
paths:
  /test:
    get:
      summary: Test YAML endpoint
      responses:
        '200':
          description: Successful response
`
      const expectedSpecObject = {
        openapi: "3.0.0",
        info: {
          title: "Test API YAML",
          version: "1.0.0",
        },
        paths: {
          "/test": {
            get: {
              summary: "Test YAML endpoint",
              responses: {
                "200": {
                  description: "Successful response",
                },
              },
            },
          },
        },
      }

      vi.mocked(readFile).mockResolvedValueOnce(yamlContent)

      const result = await openAPILoader.loadOpenAPISpec(filePath, "file")

      expect(readFile).toHaveBeenCalledWith(filePath, "utf-8")
      expect(result).toEqual(expectedSpecObject)
    })

    it("should load spec from inline content (JSON)", async () => {
      const inlineContent = JSON.stringify(mockOpenAPISpec)

      const result = await openAPILoader.loadOpenAPISpec("inline", "inline", inlineContent)

      expect(result).toEqual(mockOpenAPISpec)
    })

    it("should load spec from inline content (YAML)", async () => {
      const yamlContent = `
openapi: 3.0.0
info:
  title: Inline YAML API
  version: 1.0.0
paths:
  /inline:
    get:
      summary: Inline endpoint
      responses:
        '200':
          description: Success
`
      const expectedSpec = {
        openapi: "3.0.0",
        info: {
          title: "Inline YAML API",
          version: "1.0.0",
        },
        paths: {
          "/inline": {
            get: {
              summary: "Inline endpoint",
              responses: {
                "200": {
                  description: "Success",
                },
              },
            },
          },
        },
      }

      const result = await openAPILoader.loadOpenAPISpec("inline", "inline", yamlContent)

      expect(result).toEqual(expectedSpec)
    })

    it("should load spec from stdin", async () => {
      const stdinContent = JSON.stringify(mockOpenAPISpec)

      // Mock process.stdin
      const mockStdin = {
        setEncoding: vi.fn(),
        on: vi.fn(),
        resume: vi.fn(),
      }

      // Replace process.stdin temporarily
      const originalStdin = process.stdin
      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      })

      // Set up the stdin mock to simulate data flow
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === "data") {
          setTimeout(() => callback(stdinContent), 0)
        } else if (event === "end") {
          setTimeout(() => callback(), 10)
        }
        return mockStdin
      })

      const result = await openAPILoader.loadOpenAPISpec("stdin", "stdin")

      expect(mockStdin.setEncoding).toHaveBeenCalledWith("utf8")
      expect(mockStdin.resume).toHaveBeenCalled()
      expect(result).toEqual(mockOpenAPISpec)

      // Restore original stdin
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      })
    })

    it("should throw error if URL fetch fails", async () => {
      const url = "https://example.com/api-spec.json"
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)

      await expect(openAPILoader.loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: HTTP 404: Not Found",
      )
    })

    it("should throw error if file reading fails", async () => {
      const filePath = "./api-spec.json"
      const error = new Error("File not found")
      vi.mocked(readFile).mockRejectedValueOnce(error)

      await expect(openAPILoader.loadOpenAPISpec(filePath, "file")).rejects.toThrow(
        "Failed to load OpenAPI spec from file: File not found",
      )
    })

    it("should throw error if inline content is missing", async () => {
      await expect(openAPILoader.loadOpenAPISpec("inline", "inline")).rejects.toThrow(
        "Inline content is required when using 'inline' input method",
      )
    })

    it("should throw error if stdin provides empty content", async () => {
      // Mock process.stdin for empty content
      const mockStdin = {
        setEncoding: vi.fn(),
        on: vi.fn(),
        resume: vi.fn(),
      }

      const originalStdin = process.stdin
      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      mockStdin.on.mockImplementation((event: string, callback: Function) => {
        if (event === "end") {
          setTimeout(() => callback(), 0)
        }
        return mockStdin
      })

      await expect(openAPILoader.loadOpenAPISpec("stdin", "stdin")).rejects.toThrow(
        "Failed to load OpenAPI spec from stdin: No data received from stdin",
      )

      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      })
    })

    it("should throw error for invalid JSON/YAML content", async () => {
      const invalidContent = "{ invalid json content"

      await expect(
        openAPILoader.loadOpenAPISpec("inline", "inline", invalidContent),
      ).rejects.toThrow(/Failed to parse as JSON or YAML/)
    })

    it("should throw error for empty content", async () => {
      await expect(openAPILoader.loadOpenAPISpec("inline", "inline", "")).rejects.toThrow(
        "Failed to load OpenAPI spec from inline",
      )
    })

    it("should throw error for unsupported input method", async () => {
      await expect(openAPILoader.loadOpenAPISpec("test", "unsupported" as any)).rejects.toThrow(
        "Unsupported input method: unsupported",
      )
    })

    // Backward compatibility test
    it("should maintain backward compatibility with old interface", async () => {
      const url = "https://example.com/api-spec.json"
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockOpenAPISpec),
      } as Response)

      // Test the old interface (without specifying input method)
      const result = await openAPILoader.loadOpenAPISpec(url)

      expect(fetch).toHaveBeenCalledWith(url)
      expect(result).toEqual(mockOpenAPISpec)
    })
  })

  describe("parseOpenAPISpec with disableAbbreviation", () => {
    it("should not abbreviate tool names when disableAbbreviation is true", () => {
      const loader = new OpenAPISpecLoader({ disableAbbreviation: true })
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users/management/authorization-groups": {
            get: {
              operationId: "getUserManagementAuthorizationGroups",
              summary: "Get all user management authorization groups",
              responses: {},
            },
          },
        },
      }

      const tools = loader.parseOpenAPISpec(spec)
      const toolId = Array.from(tools.keys())[0]

      // Should not be abbreviated
      expect(toolId).toContain("GET::users__management__authorization-groups")
      const tool = tools.get(toolId)!
      expect(tool.name).toContain("get-user-management-authorization-groups")
    })

    it("should handle various number-letter combinations when disableAbbreviation is true", () => {
      const loader = new OpenAPISpecLoader({ disableAbbreviation: true })

      expect(loader.abbreviateOperationId("api2DataProcessor")).toBe("api2-data-processor")
      expect(loader.abbreviateOperationId("blockchain2Handler")).toBe("blockchain2-handler")
      expect(loader.abbreviateOperationId("v1ApiService")).toBe("v1-api-service")
      expect(loader.abbreviateOperationId("oauth2TokenManager")).toBe("oauth2-token-manager")
    })
  })

  describe("parseOpenAPISpec", () => {
    it("should convert OpenAPI paths to MCP tools", () => {
      const tools = openAPILoader.parseOpenAPISpec(mockOpenAPISpec)

      expect(tools.size).toBe(3)
      expect(tools.has("GET::users")).toBe(true)
      expect(tools.has("POST::users")).toBe(true)
      expect(tools.has("GET::users__---id")).toBe(true)
    })

    it("should set correct tool properties", () => {
      const tools = openAPILoader.parseOpenAPISpec(mockOpenAPISpec)
      const getUsersTool = tools.get("GET::users") as Tool

      expect(getUsersTool).toBeDefined()
      expect(getUsersTool.name).toBe("get-usrs")
      expect(getUsersTool.description).toBe("Returns a list of users")
      expect(getUsersTool.inputSchema).toEqual({
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Maximum number of users to return",
            "x-parameter-location": "query",
          },
        },
      })
    })

    it("should handle required parameters", () => {
      const tools = openAPILoader.parseOpenAPISpec(mockOpenAPISpec)
      const getUserByIdTool = tools.get("GET::users__---id") as Tool

      expect(getUserByIdTool).toBeDefined()
      expect(getUserByIdTool.inputSchema).toEqual({
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "User ID",
            "x-parameter-location": "path",
          },
        },
        required: ["id"],
      })
    })

    it("should use operationId as tool name when available", () => {
      const tools = openAPILoader.parseOpenAPISpec(mockOpenAPISpec)
      const getUsersTool = tools.get("GET::users") as Tool

      expect(getUsersTool.name).toBe("get-usrs")
    })

    it("should fallback to summary when operationId is missing", () => {
      const specWithoutOperationId: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "Get all users from the system",
              description: "Returns a list of users",
              responses: {},
            },
          },
          "/orders": {
            post: {
              summary: "Create new order",
              description: "Creates a new order in the system",
              responses: {},
            },
          },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(specWithoutOperationId)

      const getUsersTool = tools.get("GET::users") as Tool
      expect(getUsersTool).toBeDefined()
      expect(getUsersTool.name).toBe("get-all-users-from-the-system")

      const createOrderTool = tools.get("POST::orders") as Tool
      expect(createOrderTool).toBeDefined()
      expect(createOrderTool.name).toBe("create-new-order")
    })

    it("should fallback to method and path when both operationId and summary are missing", () => {
      const specWithoutOperationIdOrSummary: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              description: "Returns a list of users",
              responses: {},
            },
          },
          "/users/{id}": {
            delete: {
              description: "Deletes a user by ID",
              responses: {},
            },
          },
          "/api/v1/products": {
            post: {
              description: "Creates a new product",
              responses: {},
            },
          },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(specWithoutOperationIdOrSummary)

      const getUsersTool = tools.get("GET::users") as Tool
      expect(getUsersTool).toBeDefined()
      expect(getUsersTool.name).toBe("get-users")

      const deleteUserTool = tools.get("DELETE::users__---id") as Tool
      expect(deleteUserTool).toBeDefined()
      expect(deleteUserTool.name).toBe("delete-users-id")

      const createProductTool = tools.get("POST::api__v1__products") as Tool
      expect(createProductTool).toBeDefined()
      expect(createProductTool.name).toBe("post-api-v-1-products")
    })

    it("should handle complex path structures in fallback names", () => {
      const specWithComplexPaths: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/service/health-check": {
            get: {
              responses: {},
            },
          },
          "/api/v2/user-management/profiles/{userId}/settings": {
            put: {
              responses: {},
            },
          },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(specWithComplexPaths)

      const updateSettingsTool = tools.get(
        "PUT::api__v2__user-management__profiles__---userId__settings",
      ) as Tool
      expect(updateSettingsTool).toBeDefined()
      expect(updateSettingsTool.name).toBe("put-api-v-2-user-management-profiles-user-id-settings")

      const healthCheckTool = tools.get("GET::service__health-check") as Tool
      expect(healthCheckTool).toBeDefined()
      expect(healthCheckTool.name).toBe("get-service-health-check")
    })

    // New tests for Input Schema Composition and $ref inlining
    it("should merge primitive request bodies into a 'body' property and mark required", () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Primitive API", version: "1.0.0" },
        paths: {
          "/echo": {
            post: {
              summary: "Echo primitive",
              requestBody: {
                content: { "application/json": { schema: { type: "string" } } },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }
      const tools = openAPILoader.parseOpenAPISpec(spec)
      const tool = tools.get("POST::echo")!
      expect(tool.inputSchema.properties).toHaveProperty("body")
      expect((tool.inputSchema.properties! as any).body.type).toBe("string")
      expect(tool.inputSchema.required).toEqual(["body"])
    })

    it("should handle requestBody with $ref", () => {
      const specWithRequestBodyRef: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            post: {
              operationId: "createUser",
              requestBody: {
                $ref: "#/components/requestBodies/UserBody",
              },
              responses: {},
            },
          },
        },
        components: {
          requestBodies: {
            UserBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                    },
                    required: ["name"],
                  },
                },
              },
            },
          },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(specWithRequestBodyRef)
      const tool = Array.from(tools.values())[0]

      expect(tool.inputSchema.properties).toHaveProperty("name")
      expect(tool.inputSchema.required).toContain("name")
    })
  })
})
