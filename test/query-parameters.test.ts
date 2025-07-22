import { describe, it, expect, vi, beforeEach } from "vitest"
import { ApiClient } from "../src/api-client.js"
import { StaticAuthProvider } from "../src/auth-provider.js"
import { OpenAPISpecLoader } from "../src/openapi-loader.js"

describe("Query Parameters Handling", () => {
  let apiClient: ApiClient
  let mockAxios: any
  let mockSpecLoader: OpenAPISpecLoader

  beforeEach(() => {
    mockAxios = vi.fn()
    mockAxios.request = vi.fn()

    mockSpecLoader = new OpenAPISpecLoader()
    apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), mockSpecLoader)

    // Mock the axios instance
    ;(apiClient as any).axiosInstance = mockAxios
  })

  it("should properly handle query parameters in GET requests", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            operationId: "getUsers",
            parameters: [
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" },
              },
              {
                name: "filter",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
              {
                name: "sort",
                in: "query",
                required: false,
                schema: { type: "array", items: { type: "string" } },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: { users: [] } })
    })

    const toolId = "GET::users"
    await apiClient.executeApiCall(toolId, {
      limit: 10,
      filter: "active",
      sort: ["name", "created_at"],
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.method).toBe("get")
    expect(capturedConfig.url).toBe("/users")

    // Check that query parameters are properly set
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.limit).toBe(10)
    expect(capturedConfig.params.filter).toBe("active")
    expect(capturedConfig.params.sort).toBe("name,created_at") // Arrays should be joined with commas
  })

  it("should handle query parameters with path parameters", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{userId}/posts": {
          get: {
            operationId: "getUserPosts",
            parameters: [
              {
                name: "userId",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" },
              },
              {
                name: "published",
                in: "query",
                required: false,
                schema: { type: "boolean" },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: { posts: [] } })
    })

    const toolId = "GET::users__---userId__posts"
    await apiClient.executeApiCall(toolId, {
      userId: "123",
      limit: 5,
      published: true,
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.method).toBe("get")
    expect(capturedConfig.url).toBe("/users/123/posts") // Path parameter should be interpolated

    // Check that query parameters are properly set (path parameter should be removed)
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.limit).toBe(5)
    expect(capturedConfig.params.published).toBe(true)
    expect(capturedConfig.params.userId).toBeUndefined() // Path parameter should not be in query
  })

  it("should handle query parameters in POST/PUT requests in request body", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            parameters: [
              {
                name: "notify",
                in: "query",
                required: false,
                schema: { type: "boolean" },
              },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
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

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: { id: 1 } })
    })

    const toolId = "POST::users"
    await apiClient.executeApiCall(toolId, {
      name: "John Doe",
      email: "john@example.com",
      notify: true,
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.method).toBe("post")
    expect(capturedConfig.url).toBe("/users")

    // For POST requests, all parameters should go in the body (including query params)
    expect(capturedConfig.data).toBeDefined()
    expect(capturedConfig.data.name).toBe("John Doe")
    expect(capturedConfig.data.email).toBe("john@example.com")
    expect(capturedConfig.data.notify).toBe(true)

    // Query params should NOT be in the params field for POST requests
    expect(capturedConfig.params).toBeUndefined()
  })

  it("should handle DELETE requests with query parameters", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{userId}": {
          delete: {
            operationId: "deleteUser",
            parameters: [
              {
                name: "userId",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "force",
                in: "query",
                required: false,
                schema: { type: "boolean" },
              },
              {
                name: "reason",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "204": { description: "Deleted" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: null })
    })

    const toolId = "DELETE::users__---userId"
    await apiClient.executeApiCall(toolId, {
      userId: "123",
      force: true,
      reason: "inactive",
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.method).toBe("delete")
    expect(capturedConfig.url).toBe("/users/123") // Path parameter should be interpolated

    // DELETE is a GET-like method, so query parameters should be in params
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.force).toBe(true)
    expect(capturedConfig.params.reason).toBe("inactive")
    expect(capturedConfig.params.userId).toBeUndefined() // Path parameter should not be in query
  })

  it("should process array query parameters correctly", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/search": {
          get: {
            operationId: "search",
            parameters: [
              {
                name: "tags",
                in: "query",
                required: false,
                schema: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              {
                name: "categories",
                in: "query",
                required: false,
                schema: {
                  type: "array",
                  items: { type: "integer" },
                },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: { results: [] } })
    })

    const toolId = "GET::search"
    await apiClient.executeApiCall(toolId, {
      tags: ["javascript", "typescript", "node"],
      categories: [1, 2, 5],
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.tags).toBe("javascript,typescript,node")
    expect(capturedConfig.params.categories).toBe("1,2,5")
  })

  it("should not include undefined or null query parameters", async () => {
    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            operationId: "getUsers",
            parameters: [
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" },
              },
              {
                name: "filter",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = mockSpecLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    mockAxios.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: { users: [] } })
    })

    const toolId = "GET::users"
    await apiClient.executeApiCall(toolId, {
      limit: 10,
      filter: undefined,
      notInSpec: "should be ignored",
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.limit).toBe(10)
    expect(capturedConfig.params.filter).toBeUndefined()
    expect(capturedConfig.params.notInSpec).toBe("should be ignored") // Not filtered by spec since we're not validating
  })

  it("should work with dynamic meta-tools INVOKE-API-ENDPOINT", async () => {
    const openApiSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            summary: "Get users",
            parameters: [
              {
                name: "limit",
                in: "query",
                schema: { type: "integer" },
              },
              {
                name: "search",
                in: "query",
                schema: { type: "string" },
              },
            ],
          },
        },
      },
    }

    apiClient.setOpenApiSpec(openApiSpec as any)

    let capturedConfig: any = null
    mockAxios.request.mockImplementation((config: any) => {
      capturedConfig = config
      return Promise.resolve({ data: [{ id: 1, name: "John" }] })
    })

    const result = await apiClient.executeApiCall("INVOKE-API-ENDPOINT", {
      endpoint: "/users",
      method: "GET",
      params: { limit: 10, search: "test" },
    })

    expect(result).toEqual([{ id: 1, name: "John" }])
    expect(capturedConfig.method).toBe("get")
    expect(capturedConfig.url).toBe("/users")
    expect(capturedConfig.params).toBeDefined()
    expect(capturedConfig.params.limit).toBe(10)
    expect(capturedConfig.params.search).toBe("test")
  })
})
