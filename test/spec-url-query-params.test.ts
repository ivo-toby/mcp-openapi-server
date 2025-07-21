import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { OpenAPISpecLoader } from "../src/openapi-loader.js"

describe("OpenAPI Spec URL Query Parameters", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("should correctly handle query parameters in OpenAPI spec URLs", async () => {
    const mockSpecResponse = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            operationId: "getUsers",
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    let capturedUrl: string | undefined
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockSpecResponse)),
      } as Response)
    })

    const loader = new OpenAPISpecLoader()
    const specUrl = "https://api.example.com/openapi.json?version=v1&format=json&auth=token123"

    const result = await loader.loadOpenAPISpec(specUrl, "url")

    // Verify the fetch was called with the exact URL including query parameters
    expect(global.fetch).toHaveBeenCalledWith(specUrl)
    expect(capturedUrl).toBe(specUrl)
    expect(result).toEqual(mockSpecResponse)
  })

  it("should handle complex query parameters with special characters", async () => {
    const mockSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {},
    }

    let capturedUrl: string | undefined
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockSpec)),
      } as Response)
    })

    const loader = new OpenAPISpecLoader()
    const complexUrl =
      "https://api.example.com/spec.json?tags=user,admin&filter[type]=public&include=deprecated&token=abc123!@#"

    await loader.loadOpenAPISpec(complexUrl, "url")

    expect(capturedUrl).toBe(complexUrl)
    expect(global.fetch).toHaveBeenCalledWith(complexUrl)
  })

  it("should handle encoded query parameters", async () => {
    const mockSpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {},
    }

    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockSpec)),
      } as Response)
    })

    const loader = new OpenAPISpecLoader()
    const encodedUrl =
      "https://api.example.com/spec.json?search=hello%20world&date=2023-01-01T10%3A00%3A00Z"

    await loader.loadOpenAPISpec(encodedUrl, "url")

    expect(global.fetch).toHaveBeenCalledWith(encodedUrl)
  })
})
