import { describe, it, expect, vi, beforeEach } from "vitest"
import { ApiClient } from "../src/api-client.js"
import { StaticAuthProvider } from "../src/auth-provider.js"
import { OpenAPISpecLoader } from "../src/openapi-loader.js"
import { Tool } from "@modelcontextprotocol/sdk/types.js"

describe("ApiClient Dynamic Meta-Tools", () => {
  let apiClient: ApiClient
  let mockAxios: any
  let mockSpecLoader: OpenAPISpecLoader

  beforeEach(() => {
    mockAxios = {
      create: vi.fn().mockReturnThis(),
      request: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
    }

    mockSpecLoader = new OpenAPISpecLoader()
    apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), mockSpecLoader)

    // Mock the axios instance
    ;(apiClient as any).axiosInstance = mockAxios
  })

  describe("LIST-API-ENDPOINTS", () => {
    it("should handle LIST-API-ENDPOINTS meta-tool without making HTTP request", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "Get users",
              description: "Retrieve all users",
              responses: {},
            },
            post: {
              summary: "Create user",
              description: "Create a new user",
              responses: {},
            },
          },
          "/users/{id}": {
            get: {
              summary: "Get user by ID",
              description: "Retrieve a specific user",
              responses: {},
            },
          },
        },
      }

      apiClient.setOpenApiSpec(openApiSpec)

      const result = await apiClient.executeApiCall("LIST-API-ENDPOINTS", {})

      expect(result).toEqual({
        endpoints: [
          {
            method: "GET",
            path: "/users",
            summary: "Get users",
            description: "Retrieve all users",
            operationId: "",
            tags: [],
          },
          {
            method: "POST",
            path: "/users",
            summary: "Create user",
            description: "Create a new user",
            operationId: "",
            tags: [],
          },
          {
            method: "GET",
            path: "/users/{id}",
            summary: "Get user by ID",
            description: "Retrieve a specific user",
            operationId: "",
            tags: [],
          },
        ],
        total: 3,
        note: "Use INVOKE-API-ENDPOINT to call specific endpoints with the path parameter",
      })

      // Verify no HTTP request was made
      expect(mockAxios.request).not.toHaveBeenCalled()
      expect(mockAxios.get).not.toHaveBeenCalled()
      expect(mockAxios.post).not.toHaveBeenCalled()
    })

    it("should work without OpenAPI spec using fallback", async () => {
      const tools = new Map<string, Tool>([
        [
          "GET::users",
          {
            name: "Get Users",
            description: "List all users",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        [
          "POST::users",
          {
            name: "Create User",
            description: "Create a user",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      ])

      apiClient.setTools(tools)

      const result = await apiClient.executeApiCall("LIST-API-ENDPOINTS", {})

      expect(result.endpoints).toHaveLength(2)
      expect(result.note).toContain("Limited endpoint information")
    })
  })

  describe("GET-API-ENDPOINT-SCHEMA", () => {
    it("should handle GET-API-ENDPOINT-SCHEMA meta-tool", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "Get users",
              description: "Retrieve all users",
              parameters: [
                {
                  name: "page",
                  in: "query",
                  schema: { type: "integer" },
                },
              ],
              responses: {},
            },
          },
        },
      }

      apiClient.setOpenApiSpec(openApiSpec as any)

      const result = await apiClient.executeApiCall("GET-API-ENDPOINT-SCHEMA", {
        endpoint: "/users",
      })

      expect(result.path).toBe("/users")
      expect(result.operations).toHaveLength(1)
      expect(result.operations[0].method).toBe("GET")
      expect(result.operations[0].summary).toBe("Get users")
    })
  })

  describe("INVOKE-API-ENDPOINT", () => {
    it("should handle INVOKE-API-ENDPOINT meta-tool with direct HTTP request", async () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "Get users",
            },
          },
        },
      }

      apiClient.setOpenApiSpec(openApiSpec as any)
      mockAxios.request.mockResolvedValue({ data: [{ id: 1, name: "John" }] })

      const result = await apiClient.executeApiCall("INVOKE-API-ENDPOINT", {
        endpoint: "/users",
        method: "GET",
        params: { page: 1 },
      })

      expect(result).toEqual([{ id: 1, name: "John" }])
      expect(mockAxios.request).toHaveBeenCalledWith({
        method: "get",
        url: "/users",
        headers: {},
        params: { page: 1 },
      })
    })
  })

  it("should provide specific error messages for GET-API-ENDPOINT-SCHEMA with missing endpoint", async () => {
    const tools = new Map([
      [
        "GET-API-ENDPOINT-SCHEMA",
        {
          name: "get-api-endpoint-schema",
          description: "Get schema",
          inputSchema: { type: "object" as const, properties: {} },
        } as any,
      ],
    ])
    apiClient.setTools(tools)

    await expect(apiClient.executeApiCall("GET-API-ENDPOINT-SCHEMA", {})).rejects.toThrow(
      "Missing required parameter 'endpoint' for tool 'GET-API-ENDPOINT-SCHEMA'",
    )
  })

  it("should provide specific error messages for INVOKE-API-ENDPOINT with missing endpoint", async () => {
    const tools = new Map([
      [
        "INVOKE-API-ENDPOINT",
        {
          name: "invoke-api-endpoint",
          description: "Invoke endpoint",
          inputSchema: { type: "object" as const, properties: {} },
        } as any,
      ],
    ])
    apiClient.setTools(tools)

    await expect(apiClient.executeApiCall("INVOKE-API-ENDPOINT", {})).rejects.toThrow(
      "Missing required parameter 'endpoint' for tool 'INVOKE-API-ENDPOINT'",
    )
  })

  it("should provide specific error messages for GET-API-ENDPOINT-SCHEMA with invalid endpoint", async () => {
    const tools = new Map([
      [
        "GET-API-ENDPOINT-SCHEMA",
        {
          name: "get-api-endpoint-schema",
          description: "Get schema",
          inputSchema: { type: "object" as const, properties: {} },
        } as any,
      ],
    ])
    apiClient.setTools(tools)

    // Mock OpenAPI spec with no matching endpoint
    const mockSpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
    } as any
    apiClient.setOpenApiSpec(mockSpec)

    await expect(
      apiClient.executeApiCall("GET-API-ENDPOINT-SCHEMA", { endpoint: "/invalid" }),
    ).rejects.toThrow("No endpoint found for path '/invalid' in tool 'GET-API-ENDPOINT-SCHEMA'")
  })
})

// Regression test for Issue #33: Path parameter replacement bug
describe("Issue #33 Regression Test", () => {
  it("should correctly replace path parameters without affecting similar text in path segments", async () => {
    // This test specifically addresses the bug described in issue #33:
    // Original bug: /inputs/{input} with input=00000 would result in /00000s/input
    // Expected behavior: /inputs/{input} with input=00000 should result in /inputs/00000

    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    // Create a mock OpenAPI spec with the problematic path structure
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/inputs/{input}": {
          get: {
            operationId: "getInput",
            parameters: [
              {
                name: "input",
                in: "path",
                required: true,
                schema: { type: "string" as const },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    // Set the spec and generate tools
    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    // Mock axios to capture the actual request URL
    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    // Execute the API call with the problematic parameter value from issue #33
    const toolId = "GET::inputs__---input"
    await mockApiClient.executeApiCall(toolId, { input: "00000" })

    // Verify the URL was correctly constructed
    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.url).toBe("/inputs/00000")

    // Explicitly verify the bug is NOT present
    expect(capturedConfig.url).not.toBe("/00000s/input")
  })

  it("should handle multiple path parameters without substring replacement issues", async () => {
    // Additional test to ensure the fix works with multiple parameters
    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{userId}/posts/{postId}": {
          get: {
            operationId: "getUserPost",
            parameters: [
              {
                name: "userId",
                in: "path",
                required: true,
                schema: { type: "string" as const },
              },
              {
                name: "postId",
                in: "path",
                required: true,
                schema: { type: "string" as const },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "GET::users__---userId__posts__---postId"
    await mockApiClient.executeApiCall(toolId, { userId: "123", postId: "456" })

    expect(capturedConfig.url).toBe("/users/123/posts/456")
  })
})

/*
 * Issue #33 Fix: Path Parameter Replacement Bug
 *
 * The bug was in the tool ID generation and path parameter replacement:
 *
 * OLD BEHAVIOR:
 * - Path: /inputs/{input} with parameter input=00000
 * - Tool ID generation removed braces: /inputs/input
 * - Parameter replacement: /inputs/input -> /00000s/input (WRONG!)
 *
 * NEW BEHAVIOR:
 * - Path: /inputs/{input} with parameter input=00000
 * - Tool ID generation transforms braces to markers: /inputs/---input
 * - Parameter replacement: /inputs/---input -> /inputs/00000 (CORRECT!)
 *
 * The fix transforms {param} to ---param in tool IDs to preserve parameter
 * location information, then updates the parameter replacement logic to
 * handle these markers correctly.
 */

// Tests for Issue #33 and PR #38 review comment edge cases
describe("PR #38 Review Comment Fixes", () => {
  describe("Parameter Matching Precision in API Client", () => {
    it("should not partially match parameter names that are substrings of path segments", async () => {
      const mockSpecLoader = new OpenAPISpecLoader()
      const mockApiClient = new ApiClient(
        "https://api.example.com",
        new StaticAuthProvider(),
        mockSpecLoader,
      )

      // Test case where parameter names could cause substring collisions
      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/api/users/{userid}/info/{user}": {
            get: {
              operationId: "getUserInfo",
              parameters: [
                {
                  name: "userid",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
                {
                  name: "user",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      }

      mockApiClient.setOpenApiSpec(testSpec as any)
      const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
      mockApiClient.setTools(tools)

      let capturedConfig: any = null
      const mockAxios = vi.fn().mockImplementation((config) => {
        capturedConfig = config
        return Promise.resolve({ data: { success: true } })
      })
      ;(mockApiClient as any).axiosInstance = mockAxios

      // This should NOT cause substring replacement issues
      const toolId = "GET::api__users__---userid__info__---user"
      await mockApiClient.executeApiCall(toolId, { userid: "456", user: "123" })

      expect(capturedConfig.url).toBe("/api/users/456/info/123")
      // Verify no partial matches occurred
      expect(capturedConfig.url).not.toContain("456id") // Would indicate partial match of "user" in "userid"
      expect(capturedConfig.url).not.toContain("123id")
    })

    it("should handle parameters with similar names without cross-contamination", async () => {
      const mockSpecLoader = new OpenAPISpecLoader()
      const mockApiClient = new ApiClient(
        "https://api.example.com",
        new StaticAuthProvider(),
        mockSpecLoader,
      )

      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/api/{id}/data/{idNum}": {
            get: {
              operationId: "getIdData",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
                {
                  name: "idNum",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      }

      mockApiClient.setOpenApiSpec(testSpec as any)
      const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
      mockApiClient.setTools(tools)

      let capturedConfig: any = null
      const mockAxios = vi.fn().mockImplementation((config) => {
        capturedConfig = config
        return Promise.resolve({ data: { success: true } })
      })
      ;(mockApiClient as any).axiosInstance = mockAxios

      const toolId = "GET::api__---id__data__---idNum"
      await mockApiClient.executeApiCall(toolId, { id: "ABC", idNum: "789" })

      expect(capturedConfig.url).toBe("/api/ABC/data/789")
      // Ensure no cross-contamination between similar parameter names
      expect(capturedConfig.url).not.toContain("ABCNum")
      expect(capturedConfig.url).not.toContain("789Num")
    })

    it("should properly handle parameter replacement with double underscore boundaries", async () => {
      const mockSpecLoader = new OpenAPISpecLoader()
      const mockApiClient = new ApiClient(
        "https://api.example.com",
        new StaticAuthProvider(),
        mockSpecLoader,
      )

      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/api/v1/{param}/nested/{param2}": {
            get: {
              operationId: "getNestedParam",
              parameters: [
                {
                  name: "param",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
                {
                  name: "param2",
                  in: "path",
                  required: true,
                  schema: { type: "string" as const },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      }

      mockApiClient.setOpenApiSpec(testSpec as any)
      const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
      mockApiClient.setTools(tools)

      let capturedConfig: any = null
      const mockAxios = vi.fn().mockImplementation((config) => {
        capturedConfig = config
        return Promise.resolve({ data: { success: true } })
      })
      ;(mockApiClient as any).axiosInstance = mockAxios

      const toolId = "GET::api__v1__---param__nested__---param2"
      await mockApiClient.executeApiCall(toolId, { param: "VALUE1", param2: "VALUE2" })

      expect(capturedConfig.url).toBe("/api/v1/VALUE1/nested/VALUE2")
      // Verify boundaries are respected and no partial replacement occurs
      expect(capturedConfig.url).not.toContain("VALUE12") // param2 should not be affected by param replacement
    })
  })

  describe("Sanitization Edge Cases", () => {
    it("should handle paths with consecutive hyphens correctly in API calls", async () => {
      const mockSpecLoader = new OpenAPISpecLoader()
      const mockApiClient = new ApiClient(
        "https://api.example.com",
        new StaticAuthProvider(),
        mockSpecLoader,
      )

      // Create a spec with a path that has consecutive hyphens that should be preserved
      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/api/resource---name/items": {
            get: {
              operationId: "getResourceItems",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      }

      mockApiClient.setOpenApiSpec(testSpec as any)
      const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
      mockApiClient.setTools(tools)

      let capturedConfig: any = null
      const mockAxios = vi.fn().mockImplementation((config) => {
        capturedConfig = config
        return Promise.resolve({ data: { success: true } })
      })
      ;(mockApiClient as any).axiosInstance = mockAxios

      // The tool ID should preserve the triple hyphens properly
      const toolId = "GET::api__resource---name__items"
      await mockApiClient.executeApiCall(toolId, {})

      expect(capturedConfig.url).toBe("/api/resource---name/items")
    })
  })
})

// Tests for Issue #50: Support for header parameters
describe("Issue #50: Header Parameter Support", () => {
  it("should send header parameters in request headers for GET requests", async () => {
    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/api/data": {
          get: {
            operationId: "getData",
            parameters: [
              {
                name: "authorization",
                in: "header",
                required: true,
                schema: { type: "string" as const },
              },
              {
                name: "x-api-key",
                in: "header",
                required: false,
                schema: { type: "string" as const },
              },
              {
                name: "page",
                in: "query",
                required: false,
                schema: { type: "integer" as const },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "GET::api__data"
    await mockApiClient.executeApiCall(toolId, {
      authorization: "Bearer token123",
      "x-api-key": "secret-key",
      page: 1,
    })

    // Verify header parameters are in headers
    expect(capturedConfig.headers).toEqual({
      authorization: "Bearer token123",
      "x-api-key": "secret-key",
    })

    // Verify query parameters are in params (not headers)
    expect(capturedConfig.params).toEqual({ page: 1 })

    // Verify header parameters are NOT in params
    expect(capturedConfig.params.authorization).toBeUndefined()
    expect(capturedConfig.params["x-api-key"]).toBeUndefined()
  })

  it("should send header parameters in request headers for POST requests", async () => {
    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/api/resources": {
          post: {
            operationId: "createResource",
            parameters: [
              {
                name: "x-request-id",
                in: "header",
                required: true,
                schema: { type: "string" as const },
              },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object" as const,
                    properties: {
                      name: { type: "string" as const },
                      value: { type: "string" as const },
                    },
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { id: 1, name: "test" } })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "POST::api__resources"
    await mockApiClient.executeApiCall(toolId, {
      "x-request-id": "req-12345",
      name: "test-resource",
      value: "test-value",
    })

    // Verify header parameter is in headers
    expect(capturedConfig.headers).toEqual({
      "x-request-id": "req-12345",
    })

    // Verify body parameters are in data (not headers)
    expect(capturedConfig.data).toEqual({
      name: "test-resource",
      value: "test-value",
    })

    // Verify header parameter is NOT in data
    expect(capturedConfig.data["x-request-id"]).toBeUndefined()
  })

  it("should handle query parameters in POST requests (Issue #44)", async () => {
    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/upload": {
          post: {
            operationId: "uploadFile",
            parameters: [
              {
                name: "overwrite",
                in: "query",
                required: false,
                schema: { type: "boolean" as const },
                description: "Whether to overwrite existing file",
              },
              {
                name: "notify",
                in: "query",
                required: false,
                schema: { type: "boolean" as const },
                description: "Whether to send notifications",
              },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object" as const,
                    properties: {
                      filename: { type: "string" as const },
                      data: { type: "string" as const },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Upload successful" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "POST::upload"
    await mockApiClient.executeApiCall(toolId, {
      overwrite: true,
      notify: false,
      filename: "test.txt",
      data: "file content here",
    })

    // Verify query parameters are in params (query string)
    expect(capturedConfig.params).toEqual({
      overwrite: true,
      notify: false,
    })

    // Verify body parameters are in data (request body)
    expect(capturedConfig.data).toEqual({
      filename: "test.txt",
      data: "file content here",
    })

    // Verify query parameters are NOT in body
    expect(capturedConfig.data.overwrite).toBeUndefined()
    expect(capturedConfig.data.notify).toBeUndefined()

    // Verify body parameters are NOT in query string
    expect(capturedConfig.params.filename).toBeUndefined()
    expect(capturedConfig.params.data).toBeUndefined()
  })

  it("should handle mixed path, query, and header parameters", async () => {
    const mockSpecLoader = new OpenAPISpecLoader()
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/api/users/{userId}/posts": {
          get: {
            operationId: "getUserPosts",
            parameters: [
              {
                name: "userId",
                in: "path",
                required: true,
                schema: { type: "string" as const },
              },
              {
                name: "authorization",
                in: "header",
                required: true,
                schema: { type: "string" as const },
              },
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" as const },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: [] })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "GET::api__users__---userId__posts"
    await mockApiClient.executeApiCall(toolId, {
      userId: "user-123",
      authorization: "Bearer xyz789",
      limit: 10,
    })

    // Verify path parameter is in URL
    expect(capturedConfig.url).toBe("/api/users/user-123/posts")

    // Verify header parameter is in headers
    expect(capturedConfig.headers).toEqual({
      authorization: "Bearer xyz789",
    })

    // Verify query parameter is in params
    expect(capturedConfig.params).toEqual({ limit: 10 })

    // Verify no parameters leaked into wrong locations
    expect(capturedConfig.params.userId).toBeUndefined()
    expect(capturedConfig.params.authorization).toBeUndefined()
    expect(capturedConfig.headers.limit).toBeUndefined()
  })

  it("should merge header parameters with auth headers", async () => {
    const mockSpecLoader = new OpenAPISpecLoader()
    const authHeaders = { Authorization: "Bearer auth-token" }
    const mockApiClient = new ApiClient(
      "https://api.example.com",
      new StaticAuthProvider(authHeaders),
      mockSpecLoader,
    )

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/api/data": {
          get: {
            operationId: "getData",
            parameters: [
              {
                name: "x-custom-header",
                in: "header",
                required: true,
                schema: { type: "string" as const },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    mockApiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    mockApiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: {} })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "GET::api__data"
    await mockApiClient.executeApiCall(toolId, {
      "x-custom-header": "custom-value",
    })

    // Verify both auth headers and custom header parameters are present
    expect(capturedConfig.headers).toEqual({
      Authorization: "Bearer auth-token",
      "x-custom-header": "custom-value",
    })
  })

  it("should handle header parameters without tool definition (fallback mode)", async () => {
    // This test ensures the fallback behavior doesn't break when tool definition is unavailable
    const mockApiClient = new ApiClient("https://api.example.com", new StaticAuthProvider())

    // Don't set tools, forcing fallback behavior
    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: {} })
    })
    ;(mockApiClient as any).axiosInstance = mockAxios

    const toolId = "GET::api__data"
    await mockApiClient.executeApiCall(toolId, {
      page: 1,
    })

    // In fallback mode without tool definition, parameters go to query/body as before
    expect(capturedConfig.params).toEqual({ page: 1 })
  })
})
