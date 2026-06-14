import { describe, it, expect, vi } from "vitest"
import { ApiClient } from "../src/api-client.js"
import { StaticAuthProvider } from "../src/auth-provider.js"
import { OpenAPISpecLoader } from "../src/openapi-loader.js"

// Regression test for paths whose segments start with an underscore.
//
// Bug: an OpenAPI path like "/_meh" produced a tool that, when invoked,
// hit "/meh" on the backend instead of "/_meh". Root cause was in
// src/utils/tool-id.ts:sanitizeForToolId, which strips leading/trailing
// [_-]+ and collapses runs of underscores — so the tool ID for "/_meh"
// is "GET::meh" and parseToolId reconstructs "/meh".
//
// The fix (api-client.ts): read the original OpenAPI path from the
// tool metadata (originalPath / x-original-path, already populated in
// openapi-loader.ts) instead of reconstructing it from the lossy tool ID.
describe("Path segments starting with underscore", () => {
  it("should call '/_meh' (not '/meh') for a path starting with underscore", async () => {
    const specLoader = new OpenAPISpecLoader()
    const apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), specLoader)

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/_meh": {
          get: {
            operationId: "getMeh",
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = specLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(apiClient as any).axiosInstance = mockAxios

    const toolIds = Array.from(tools.keys())
    expect(toolIds).toHaveLength(1)

    await apiClient.executeApiCall(toolIds[0], {})

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.url).toBe("/_meh")
    expect(capturedConfig.url).not.toBe("/meh")
  })

  it("should call '/api/_meh' (not '/api/meh') for a nested underscore-prefixed segment", async () => {
    const specLoader = new OpenAPISpecLoader()
    const apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), specLoader)

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/api/_meh": {
          get: {
            operationId: "getApiMeh",
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = specLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(apiClient as any).axiosInstance = mockAxios

    const toolIds = Array.from(tools.keys())
    expect(toolIds).toHaveLength(1)

    await apiClient.executeApiCall(toolIds[0], {})

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.url).toBe("/api/_meh")
    expect(capturedConfig.url).not.toBe("/api/meh")
  })

  it("should preserve underscores alongside a path parameter", async () => {
    const specLoader = new OpenAPISpecLoader()
    const apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), specLoader)

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/_meh/{id}": {
          get: {
            operationId: "getMehById",
            parameters: [
              {
                name: "id",
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

    apiClient.setOpenApiSpec(testSpec as any)
    const tools = specLoader.parseOpenAPISpec(testSpec as any)
    apiClient.setTools(tools)

    let capturedConfig: any = null
    const mockAxios = vi.fn().mockImplementation((config) => {
      capturedConfig = config
      return Promise.resolve({ data: { success: true } })
    })
    ;(apiClient as any).axiosInstance = mockAxios

    const toolIds = Array.from(tools.keys())
    expect(toolIds).toHaveLength(1)

    await apiClient.executeApiCall(toolIds[0], { id: "42" })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.url).toBe("/_meh/42")
  })

  it("should call '/_meh' via INVOKE-API-ENDPOINT in dynamic mode", async () => {
    const specLoader = new OpenAPISpecLoader()
    const apiClient = new ApiClient("https://api.example.com", new StaticAuthProvider(), specLoader)

    const testSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/_meh": {
          get: {
            operationId: "getMeh",
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    apiClient.setOpenApiSpec(testSpec as any)
    // Dynamic mode: spec is loaded but per-endpoint tools are not in toolsMap,
    // so INVOKE-API-ENDPOINT falls through to makeDirectHttpRequest with the
    // caller-supplied endpoint string.

    let capturedConfig: any = null
    const mockAxios = {
      request: vi.fn().mockImplementation((config) => {
        capturedConfig = config
        return Promise.resolve({ data: { success: true } })
      }),
    }
    ;(apiClient as any).axiosInstance = mockAxios

    await apiClient.executeApiCall("INVOKE-API-ENDPOINT", {
      endpoint: "/_meh",
      method: "GET",
      params: {},
    })

    expect(capturedConfig).toBeDefined()
    expect(capturedConfig.url).toBe("/_meh")
  })
})
