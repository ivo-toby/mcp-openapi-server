import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { readFile } from "fs/promises"
import { OpenAPISpecLoader, ExtendedTool } from "../src/openapi-loader"
import { OpenAPIV3 } from "openapi-types"
import { Tool } from "@modelcontextprotocol/sdk/types.js"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios")
  // Mock requests but keep the real AxiosError, which AuthProvider.handleAuthError receives
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn() },
  }
})

import axios, { AxiosError } from "axios"
import type { AuthProvider } from "../src/auth-provider"
import { Agent as HttpsAgent } from "node:https"

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
    CORE_SCHEMA: actualJsYamlMod.CORE_SCHEMA, // Required for secure YAML parsing
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

  describe("Issue #110: auth headers on spec requests", () => {
    const apiOrigin = "https://api.example.com"
    const url = `${apiOrigin}/openapi.json`
    const authHeaders = { Authorization: "Bearer secret-token" }
    let authProvider: AuthProvider & {
      getAuthHeaders: ReturnType<typeof vi.fn>
      handleAuthError: ReturnType<typeof vi.fn>
    }

    const ok = () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      data: JSON.stringify(mockOpenAPISpec),
    })
    const okFetch = () =>
      ({
        ok: true,
        text: async () => JSON.stringify(mockOpenAPISpec),
      }) as Response
    const loaderWith = (
      options: Partial<ConstructorParameters<typeof OpenAPISpecLoader>[0]> = {},
    ) => new OpenAPISpecLoader({ authProvider, authScope: `${apiOrigin}/v1`, ...options })

    beforeEach(() => {
      authProvider = {
        getAuthHeaders: vi.fn().mockResolvedValue(authHeaders),
        handleAuthError: vi.fn().mockResolvedValue(false),
      }
    })

    it("should send auth headers to a spec URL on the API origin", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce(ok())

      const result = await loaderWith().loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).not.toHaveBeenCalled()
      expect(axios.get).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          headers: authHeaders,
          httpsAgent: undefined,
          proxy: false,
          maxRedirects: 0,
        }),
      )
    })

    it("should match the API origin case-insensitively and ignore the API path", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce(ok())

      await loaderWith({ authScope: "  HTTPS://API.EXAMPLE.COM:443/v1/  " }).loadOpenAPISpec(
        url,
        "url",
      )

      expect(axios.get).toHaveBeenCalledWith(url, expect.objectContaining({ headers: authHeaders }))
    })

    it("should not send auth headers to a spec URL on a different origin", async () => {
      const otherUrl = "https://raw.githubusercontent.com/example/api/main/openapi.json"
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loaderWith().loadOpenAPISpec(otherUrl, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).toHaveBeenCalledWith(otherUrl)
      expect(axios.get).not.toHaveBeenCalled()
      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should treat a different scheme or port as a different origin", async () => {
      vi.mocked(fetch).mockResolvedValue(okFetch())
      const loader = loaderWith()

      await loader.loadOpenAPISpec("http://api.example.com/openapi.json", "url")
      await loader.loadOpenAPISpec("https://api.example.com:8443/openapi.json", "url")

      expect(axios.get).not.toHaveBeenCalled()
      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should keep auth headers across same-origin redirects", async () => {
      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 302,
          statusText: "Found",
          headers: { location: "/v2/openapi.json" },
          data: "",
        })
        .mockResolvedValueOnce(ok())

      await loaderWith().loadOpenAPISpec(url, "url")

      expect(axios.get).toHaveBeenNthCalledWith(
        2,
        `${apiOrigin}/v2/openapi.json`,
        expect.objectContaining({ headers: authHeaders }),
      )
      expect(fetch).not.toHaveBeenCalled()
    })

    it("should drop auth headers when redirected to another origin", async () => {
      const target = "https://specs-bucket.s3.amazonaws.com/openapi.json?X-Amz-Signature=abc"
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 307,
        statusText: "Temporary Redirect",
        headers: { location: target },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loaderWith().loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(axios.get).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(target)
    })

    it("should drop auth headers on an https -> http downgrade redirect", async () => {
      const target = "http://api.example.com/openapi.json"
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 301,
        statusText: "Moved Permanently",
        headers: { location: target },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith().loadOpenAPISpec(url, "url")

      expect(axios.get).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(target)
    })

    it("should use dynamic headers from the AuthProvider for every request", async () => {
      authProvider.getAuthHeaders
        .mockResolvedValueOnce({ Authorization: "Bearer first" })
        .mockResolvedValueOnce({ Authorization: "Bearer second" })
      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 302,
          statusText: "Found",
          headers: { location: "/v2/openapi.json" },
          data: "",
        })
        .mockResolvedValueOnce(ok())

      await loaderWith().loadOpenAPISpec(url, "url")

      expect(vi.mocked(axios.get).mock.calls[0][1]?.headers).toEqual({
        Authorization: "Bearer first",
      })
      expect(vi.mocked(axios.get).mock.calls[1][1]?.headers).toEqual({
        Authorization: "Bearer second",
      })
    })

    it("should retry once with fresh headers when handleAuthError returns true", async () => {
      authProvider.getAuthHeaders
        .mockResolvedValueOnce({ Authorization: "Bearer expired" })
        .mockResolvedValueOnce({ Authorization: "Bearer refreshed" })
      authProvider.handleAuthError.mockResolvedValueOnce(true)
      vi.mocked(axios.get)
        .mockResolvedValueOnce({ status: 401, statusText: "Unauthorized", headers: {}, data: "" })
        .mockResolvedValueOnce(ok())

      const result = await loaderWith().loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(authProvider.handleAuthError).toHaveBeenCalledTimes(1)
      const error = authProvider.handleAuthError.mock.calls[0][0]
      expect(error).toBeInstanceOf(AxiosError)
      expect(error.response?.status).toBe(401)
      expect(vi.mocked(axios.get).mock.calls[1][1]?.headers).toEqual({
        Authorization: "Bearer refreshed",
      })
    })

    it("should fail with the HTTP status when handleAuthError returns false", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 403,
        statusText: "Forbidden",
        headers: {},
        data: "",
      })

      await expect(loaderWith().loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: HTTP 403: Forbidden",
      )
      expect(authProvider.handleAuthError).toHaveBeenCalledTimes(1)
      expect(axios.get).toHaveBeenCalledTimes(1)
    })

    it("should only retry once when the retried request is also rejected", async () => {
      authProvider.handleAuthError.mockResolvedValue(true)
      vi.mocked(axios.get).mockResolvedValue({
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        data: "",
      })

      await expect(loaderWith().loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: HTTP 401: Unauthorized",
      )
      expect(authProvider.handleAuthError).toHaveBeenCalledTimes(1)
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it("should still load a public spec when getAuthHeaders throws, with a warning", async () => {
      authProvider.getAuthHeaders.mockRejectedValue(new Error("Token expired or not set"))
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loaderWith().loadOpenAPISpec(url, "url")
      const warnings = warnSpy.mock.calls.map((call) => String(call[0]))
      warnSpy.mockRestore()

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).toHaveBeenCalledWith(url)
      expect(axios.get).not.toHaveBeenCalled()
      expect(warnings).toEqual([
        `Warning: auth headers unavailable for ${url} (Token expired or not set); sending the spec request without them`,
      ])
    })

    it("should include the provider's error when an unauthenticated spec request is rejected", async () => {
      authProvider.getAuthHeaders.mockRejectedValue(new Error("Token expired or not set"))
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response)

      const error = await loaderWith()
        .loadOpenAPISpec(url, "url")
        .catch((e: Error) => e)
      warnSpy.mockRestore()

      expect((error as Error).message).toBe(
        `Failed to load OpenAPI spec from url: HTTP 401: Unauthorized (auth headers unavailable for ${url} (Token expired or not set); sending the spec request without them)`,
      )
      expect(authProvider.handleAuthError).not.toHaveBeenCalled()
    })

    it("should surface errors thrown by handleAuthError", async () => {
      authProvider.handleAuthError.mockRejectedValueOnce(new Error("Re-login required"))
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        data: "",
      })

      await expect(loaderWith().loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: Re-login required",
      )
    })

    it("should not add auth headers to spec URLs that embed credentials", async () => {
      const credentialUrl = "https://user:pass@api.example.com/openapi.json"
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith().loadOpenAPISpec(credentialUrl, "url")

      expect(axios.get).not.toHaveBeenCalled()
      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should never match a non-http(s) auth scope", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith({ authScope: "localhost:3000" }).loadOpenAPISpec(
        "data:application/json,{}",
        "url",
      )

      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should drop auth headers on a protocol-relative redirect to another host", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: { location: "//evil.example.net/openapi.json" },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith().loadOpenAPISpec(url, "url")

      expect(axios.get).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith("https://evil.example.net/openapi.json")
    })

    it("should cap redirects on the auth-only path", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        status: 302,
        statusText: "Found",
        headers: { location: "/loop" },
        data: "",
      })

      await expect(loaderWith().loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: Too many redirects (more than 5)",
      )
      expect(axios.get).toHaveBeenCalledTimes(6)
    })

    it("should keep using fetch when the auth provider returns no headers", async () => {
      authProvider.getAuthHeaders.mockResolvedValue({})
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith().loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(axios.get).not.toHaveBeenCalled()
    })

    it("should never send auth headers in 'never' mode", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith({ specAuth: "never" }).loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(axios.get).not.toHaveBeenCalled()
      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should send auth headers to the spec URL's own origin in 'always' mode", async () => {
      const otherUrl = "https://specs.example.org/api/openapi.json"
      vi.mocked(axios.get).mockResolvedValueOnce(ok())

      await loaderWith({ specAuth: "always" }).loadOpenAPISpec(otherUrl, "url")

      expect(axios.get).toHaveBeenCalledWith(
        otherUrl,
        expect.objectContaining({ headers: authHeaders }),
      )
    })

    it("should drop auth headers on a cross-origin redirect in 'always' mode", async () => {
      const otherUrl = "https://specs.example.org/api/openapi.json"
      const target = "https://cdn.example.net/openapi.json"
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: { location: target },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loaderWith({ specAuth: "always" }).loadOpenAPISpec(otherUrl, "url")

      expect(axios.get).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(target)
    })

    it("should send no auth headers in 'same-origin' mode without an auth scope", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await new OpenAPISpecLoader({ authProvider }).loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(authProvider.getAuthHeaders).not.toHaveBeenCalled()
    })

    it("should log the TLS-skip warning only once across an auth retry", async () => {
      const httpsAgent = new HttpsAgent()
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      authProvider.handleAuthError.mockResolvedValueOnce(true)
      vi.mocked(axios.get)
        .mockResolvedValueOnce({ status: 401, statusText: "Unauthorized", headers: {}, data: "" })
        .mockResolvedValueOnce(ok())

      // TLS scoped to another origin, auth sent to the spec URL's origin ("always")
      await loaderWith({
        httpsAgent,
        httpsAgentScope: "https://tls-only.example.com",
        specAuth: "always",
      }).loadOpenAPISpec(url, "url")
      const tlsWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes("TLS options"),
      )
      warnSpy.mockRestore()
      httpsAgent.destroy()

      expect(axios.get).toHaveBeenCalledTimes(2)
      expect(tlsWarnings).toHaveLength(1)
    })

    it("should combine auth headers with the HTTPS agent on the API origin", async () => {
      const httpsAgent = new HttpsAgent()
      vi.mocked(axios.get).mockResolvedValueOnce(ok())

      await loaderWith({ httpsAgent, httpsAgentScope: apiOrigin }).loadOpenAPISpec(url, "url")

      expect(axios.get).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ headers: authHeaders, httpsAgent }),
      )
      httpsAgent.destroy()
    })
  })

  describe("Issue #96: loading spec from URL behind mTLS", () => {
    const apiOrigin = "https://secure.example.com"
    const url = `${apiOrigin}/openapi`
    let httpsAgent: HttpsAgent
    let loader: OpenAPISpecLoader

    const okFetch = () =>
      ({
        ok: true,
        text: async () => JSON.stringify(mockOpenAPISpec),
      }) as Response

    beforeEach(() => {
      httpsAgent = new HttpsAgent({ rejectUnauthorized: true })
      loader = new OpenAPISpecLoader({ httpsAgent, httpsAgentScope: `${apiOrigin}/api/v1` })
    })

    afterEach(() => {
      httpsAgent.destroy()
    })

    it("should fetch same-origin https spec URLs through the HTTPS agent, directly", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: JSON.stringify(mockOpenAPISpec),
      })

      const result = await loader.loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).not.toHaveBeenCalled()
      expect(axios.get).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          httpsAgent,
          proxy: false,
          maxRedirects: 0,
          responseType: "text",
        }),
      )
    })

    it("should parse YAML specs fetched through the HTTPS agent", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: "openapi: 3.0.0\ninfo:\n  title: Secure API\n  version: 1.0.0\npaths: {}\n",
      })

      const result = await loader.loadOpenAPISpec(url, "url")

      expect(result.info.title).toBe("Secure API")
    })

    it("should report non-2xx responses with status details", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 403,
        statusText: "Forbidden",
        headers: {},
        data: "",
      })

      await expect(loader.loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: HTTP 403: Forbidden",
      )
    })

    it("should surface TLS errors from the HTTPS request without trailing whitespace", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error("certificate required\n"))

      const error = await loader.loadOpenAPISpec(url, "url").catch((e: Error) => e)

      expect((error as Error).message).toBe(
        "Failed to load OpenAPI spec from url: certificate required",
      )
    })

    it("should not use the HTTPS agent for spec URLs on a different origin", async () => {
      const otherUrl = "https://raw.githubusercontent.com/example/api/main/openapi.json"
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loader.loadOpenAPISpec(otherUrl, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).toHaveBeenCalledWith(otherUrl)
      expect(axios.get).not.toHaveBeenCalled()
    })

    it("should treat a different port on the same host as a different origin", async () => {
      const otherPortUrl = "https://secure.example.com:8443/openapi"
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loader.loadOpenAPISpec(otherPortUrl, "url")

      expect(fetch).toHaveBeenCalledWith(otherPortUrl)
      expect(axios.get).not.toHaveBeenCalled()
    })

    it("should keep using the HTTPS agent across same-origin redirects", async () => {
      vi.mocked(axios.get)
        .mockResolvedValueOnce({
          status: 302,
          statusText: "Found",
          headers: { location: "/specs/v2/openapi.json" },
          data: "",
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: JSON.stringify(mockOpenAPISpec),
        })

      const result = await loader.loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(axios.get).toHaveBeenNthCalledWith(
        2,
        `${apiOrigin}/specs/v2/openapi.json`,
        expect.objectContaining({ httpsAgent }),
      )
      expect(fetch).not.toHaveBeenCalled()
    })

    it("should drop the HTTPS agent when redirected to another origin", async () => {
      const target = "https://cdn.example.net/openapi.json"
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 301,
        statusText: "Moved Permanently",
        headers: { location: target },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loader.loadOpenAPISpec(url, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(axios.get).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(target)
    })

    it("should stop after too many same-origin redirects", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        status: 302,
        statusText: "Found",
        headers: { location: "/loop" },
        data: "",
      })

      await expect(loader.loadOpenAPISpec(url, "url")).rejects.toThrow(
        "Failed to load OpenAPI spec from url: Too many redirects (more than 5)",
      )
      expect(axios.get).toHaveBeenCalledTimes(6)
    })

    it("should keep using fetch for http:// spec URLs even when an agent is configured", async () => {
      const httpUrl = "http://secure.example.com/openapi.json"
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      const result = await loader.loadOpenAPISpec(httpUrl, "url")

      expect(result).toEqual(mockOpenAPISpec)
      expect(fetch).toHaveBeenCalledWith(httpUrl)
      expect(axios.get).not.toHaveBeenCalled()
    })

    it("should never use the HTTPS agent when its scope is not a valid URL", async () => {
      const invalidScopeLoader = new OpenAPISpecLoader({ httpsAgent, httpsAgentScope: "not a url" })
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await invalidScopeLoader.loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(axios.get).not.toHaveBeenCalled()
    })

    it("should use the HTTPS agent for any https URL when no scope is given", async () => {
      const unscopedLoader = new OpenAPISpecLoader({ httpsAgent })
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: JSON.stringify(mockOpenAPISpec),
      })

      await unscopedLoader.loadOpenAPISpec("https://elsewhere.example.org/openapi", "url")

      expect(axios.get).toHaveBeenCalledWith(
        "https://elsewhere.example.org/openapi",
        expect.objectContaining({ httpsAgent }),
      )
    })

    it("should warn when TLS options are configured but the spec URL is off-origin", async () => {
      const otherUrl = "https://secure.example.com:8443/openapi"
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await loader.loadOpenAPISpec(otherUrl, "url")

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `TLS options (client certificate, CA, reject-unauthorized) were not applied to ${otherUrl}; they only apply to https:// spec URLs on the API base URL origin (${apiOrigin})`,
        ),
      )
      warnSpy.mockRestore()
    })

    it("should explain skipped TLS options when an off-origin fetch fails", async () => {
      const otherUrl = "https://secure.example.com:8443/openapi"
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"))

      const error = await loader.loadOpenAPISpec(otherUrl, "url").catch((e: Error) => e)
      warnSpy.mockRestore()

      expect((error as Error).message).toBe(
        `Failed to load OpenAPI spec from url: fetch failed (TLS options (client certificate, CA, reject-unauthorized) were not applied to ${otherUrl}; they only apply to https:// spec URLs on the API base URL origin (${apiOrigin}))`,
      )
    })

    it("should explain skipped TLS options when a cross-origin redirect target fails", async () => {
      const target = "https://cdn.example.net/openapi.json"
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(axios.get).mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: { location: target },
        data: "",
      })
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)

      await expect(loader.loadOpenAPISpec(url, "url")).rejects.toThrow(
        `HTTP 404: Not Found (TLS options (client certificate, CA, reject-unauthorized) were not applied to ${target};`,
      )
      warnSpy.mockRestore()
    })

    it("should not warn or annotate errors when no TLS options are configured", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"))

      await expect(openAPILoader.loadOpenAPISpec(url, "url")).rejects.toThrow(
        /^Failed to load OpenAPI spec from url: fetch failed$/,
      )
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it("should keep using fetch when no HTTPS agent is configured", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okFetch())

      await openAPILoader.loadOpenAPISpec(url, "url")

      expect(fetch).toHaveBeenCalledWith(url)
      expect(axios.get).not.toHaveBeenCalled()
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
      expect((tool.inputSchema as any)["x-body-wrapper"]).toBe("body")
    })

    it("Issue #102: does not rename body properties that shadow Object.prototype members", () => {
      const spec = {
        openapi: "3.0.0",
        info: { title: "Proto API", version: "1.0.0" },
        paths: {
          "/x": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { constructor: { type: "string" }, toString: { type: "string" } },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }
      const tool = openAPILoader
        .parseOpenAPISpec(spec as unknown as OpenAPIV3.Document)
        .get("POST::x")!
      expect(Object.keys(tool.inputSchema.properties!)).toEqual(["constructor", "toString"])
      expect((tool.inputSchema as any)["x-body-property-map"]).toBeUndefined()
    })

    it("Issue #102: records body properties renamed due to a parameter name collision", () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.0",
        info: { title: "Collision API", version: "1.0.0" },
        paths: {
          "/things/{id}": {
            put: {
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "integer" }, title: { type: "string" } },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }
      const tool = openAPILoader.parseOpenAPISpec(spec).get("PUT::things__---id")!
      expect(tool.inputSchema.properties).toHaveProperty("body_id")
      expect((tool.inputSchema as any)["x-body-property-map"]).toEqual({ body_id: "id" })
      expect((tool.inputSchema as any)["x-body-wrapper"]).toBeUndefined()
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

  describe("Issue #103: unique tool names", () => {
    const op = (summary: string, operationId?: string): OpenAPIV3.OperationObject => ({
      ...(operationId ? { operationId } : {}),
      summary,
      responses: { "200": { description: "ok" } },
    })

    it("should give operations whose names sanitize to the same value distinct names", () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/t/consume": { post: op("检查并消耗 Ticket") },
          "/t/verify": { post: op("验证 Ticket") },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(spec)
      const consume = tools.get("POST::t__consume")!
      const verify = tools.get("POST::t__verify")!

      // First operation keeps the base name (backward compatible)
      expect(consume.name).toBe("ticket")
      expect(verify.name).not.toBe("ticket")
      expect(verify.name).toMatch(/^ticket-[0-9a-f]{4}$/)
    })

    it("should give unique names to several operations that collide after normalization", () => {
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/a": { get: op("x", "getThing"), post: op("x", "get_thing") },
          "/b": { get: op("x", "GetThing") },
          "/c": { get: op("x", "get-thing") },
        },
      }

      const names = Array.from(openAPILoader.parseOpenAPISpec(spec).values()).map((t) =>
        t.name.toLowerCase(),
      )
      expect(names).toHaveLength(4)
      expect(new Set(names).size).toBe(4)
      for (const name of names) {
        expect(name).toMatch(/^[a-z0-9-]+$/)
      }
    })

    it("should not collide with an operationId that equals a generated suffixed name", () => {
      const loader = new OpenAPISpecLoader({ disableAbbreviation: true, verbose: false })
      const base: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/t/consume": { post: op("检查并消耗 Ticket") },
          "/t/verify": { post: op("验证 Ticket") },
        },
      }
      const suffixed = loader.parseOpenAPISpec(base).get("POST::t__verify")!.name
      expect(suffixed).toMatch(/^ticket-[0-9a-f]{4}$/)

      // An operation listed first that already claims the suffixed name
      const spec: OpenAPIV3.Document = {
        ...base,
        paths: { "/z": { get: op("x", suffixed) }, ...base.paths },
      }
      const tools = loader.parseOpenAPISpec(spec)
      expect(tools.get("GET::z")!.name).toBe(suffixed)
      expect(tools.get("POST::t__consume")!.name).toBe("ticket")
      expect(tools.get("POST::t__verify")!.name).toBe(`${suffixed}-2`)
    })

    it("should keep suffixed names within the 64 character limit", () => {
      const longId = "a".repeat(80)
      const spec: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/one": { get: op("x", longId) },
          "/two": { get: op("x", longId) },
        },
      }

      const tools = openAPILoader.parseOpenAPISpec(spec)
      const first = tools.get("GET::one")!.name
      const second = tools.get("GET::two")!.name

      // First keeps the (already hashed/truncated) base name unchanged
      expect(first).toBe(openAPILoader.abbreviateOperationId(longId))
      expect(second).not.toBe(first)
      for (const name of [first, second]) {
        expect(name.length).toBeLessThanOrEqual(64)
        expect(name).toMatch(/^[a-z0-9-]+$/)
      }
      expect(second).toMatch(/-[0-9a-f]{4}$/)
    })

    it("should leave unique names untouched", () => {
      const tools = openAPILoader.parseOpenAPISpec(mockOpenAPISpec)
      expect(tools.get("GET::users")!.name).toBe("get-usrs")
    })
  })
})
