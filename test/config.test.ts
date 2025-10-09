import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseHeaders } from "../src/config"
// We'll import loadConfig dynamically in each test after setting up mocks

describe("parseHeaders", () => {
  it("should parse header string into a record", () => {
    const headerStr = "key1:value1,key2:value2"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      key1: "value1",
      key2: "value2",
    })
  })

  it("should handle whitespace in header string", () => {
    const headerStr = "key1: value1 , key2 :value2"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      key1: "value1",
      key2: "value2",
    })
  })

  it("should return empty object for undefined input", () => {
    const result = parseHeaders(undefined)
    expect(result).toEqual({})
  })

  it("should handle empty string input", () => {
    const result = parseHeaders("")
    expect(result).toEqual({})
  })

  it("should skip malformed headers", () => {
    const headerStr = "key1:value1,malformed,key2:value2"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      key1: "value1",
      key2: "value2",
    })
  })

  it("should handle header values containing colons", () => {
    const headerStr = "Authorization:Bearer V:fffff,X-API-Key:key123"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      Authorization: "Bearer V:fffff",
      "X-API-Key": "key123",
    })
  })

  it("should handle multiple colons in header values", () => {
    const headerStr =
      "Content-Type:application/json,Authorization:Bearer token:with:multiple:colons"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token:with:multiple:colons",
    })
  })

  it("should handle empty header values", () => {
    const headerStr = "X-Custom-Header:,Authorization:Bearer token,X-Empty:"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      "X-Custom-Header": "",
      Authorization: "Bearer token",
      "X-Empty": "",
    })
  })

  it("should skip headers with empty or whitespace-only keys", () => {
    const headerStr = ":empty-key,   :whitespace-key,Valid-Key:value"
    const result = parseHeaders(headerStr)
    expect(result).toEqual({
      "Valid-Key": "value",
    })
  })
})

describe("loadConfig", () => {
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]

  beforeEach(() => {
    vi.resetModules()
    process.argv = ["node", "script.js"]
    // Clear environment variables that might affect tests
    delete process.env.API_BASE_URL
    delete process.env.OPENAPI_SPEC_PATH
    delete process.env.OPENAPI_SPEC_FROM_STDIN
    delete process.env.OPENAPI_SPEC_INLINE
    delete process.env.API_HEADERS
    delete process.env.SERVER_NAME
    delete process.env.SERVER_VERSION
    delete process.env.TRANSPORT_TYPE
    delete process.env.HTTP_PORT
    delete process.env.HTTP_HOST
    delete process.env.ENDPOINT_PATH
    delete process.env.TOOLS_MODE
    delete process.env.DISABLE_ABBREVIATION

    // Reset mocks before each test
    vi.clearAllMocks()

    // Clear all mocks
    vi.doMock("yargs", () => ({}))
    vi.doMock("yargs/helpers", () => ({}))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.argv = [...originalArgv]
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("should load config from command line arguments", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
          headers: "Authorization:Bearer token",
          name: "test-server",
          "server-version": "1.2.3",
          transport: "stdio",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config).toEqual({
      name: "test-server",
      version: "1.2.3",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "./spec.json",
      specInputMethod: "file",
      inlineSpecContent: undefined,
      headers: {
        Authorization: "Bearer token",
      },
      transportType: "stdio",
      httpPort: 3000,
      httpHost: "127.0.0.1",
      endpointPath: "/mcp",
      includeTools: undefined,
      includeTags: undefined,
      includeResources: undefined,
      includeOperations: undefined,
      toolsMode: "all",
      disableAbbreviation: undefined,
    })
  })

  it("should throw error if API base URL is missing", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    expect(() => loadConfig()).toThrow("API base URL is required")
  })

  it("should throw error if OpenAPI spec is missing", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    expect(() => loadConfig()).toThrow("OpenAPI spec is required")
  })

  it("should use environment variables as fallback", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          // empty object
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Set environment variables
    process.env.API_BASE_URL = "https://env.example.com"
    process.env.OPENAPI_SPEC_PATH = "./env-spec.json"
    process.env.API_HEADERS = "X-API-Key:12345"
    process.env.SERVER_NAME = "env-server"
    process.env.SERVER_VERSION = "3.2.1"
    process.env.TRANSPORT_TYPE = "stdio"

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config).toEqual({
      name: "env-server",
      version: "3.2.1",
      apiBaseUrl: "https://env.example.com",
      openApiSpec: "./env-spec.json",
      specInputMethod: "file",
      inlineSpecContent: undefined,
      headers: {
        "X-API-Key": "12345",
      },
      transportType: "stdio",
      httpPort: 3000,
      httpHost: "127.0.0.1",
      endpointPath: "/mcp",
      includeTools: undefined,
      includeTags: undefined,
      includeResources: undefined,
      includeOperations: undefined,
      toolsMode: "all",
      disableAbbreviation: undefined,
    })
  })

  it("should use default values for name and version if not provided", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.name).toBe("mcp-openapi-server")
    expect(config.version).toBe("1.0.0")
    expect(config.transportType).toBe("stdio")
  })

  it("should handle disableAbbreviation from command line and environment", async () => {
    // Test with command line argument
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
          "disable-abbreviation": true,
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    let { loadConfig } = await import("../src/config")
    let config = loadConfig()
    expect(config.disableAbbreviation).toBe(true)

    // Reset modules for next test
    vi.resetModules()

    // Test with environment variable (string 'true')
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    process.env.DISABLE_ABBREVIATION = "true"

    // Import the module again after resetting
    const configModule = await import("../src/config")
    loadConfig = configModule.loadConfig
    config = loadConfig()
    expect(config.disableAbbreviation).toBe(true)

    // Reset modules for next test
    vi.resetModules()

    // Test with environment variable (string 'false')
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    process.env.DISABLE_ABBREVIATION = "false"

    // Import the module again after resetting
    const configModule2 = await import("../src/config")
    loadConfig = configModule2.loadConfig
    config = loadConfig()
    expect(config.disableAbbreviation).toBeUndefined()

    // Test default value (undefined)
    vi.resetModules()
    delete process.env.DISABLE_ABBREVIATION

    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const configModule3 = await import("../src/config")
    loadConfig = configModule3.loadConfig
    config = loadConfig()
    expect(config.disableAbbreviation).toBeUndefined()
  })

  it("should load config with URL spec", async () => {
    // Setup mocks before importing the module
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "https://api.example.com/openapi.json",
          headers: "Authorization:Bearer token",
          name: "test-server",
          "server-version": "1.2.3",
          transport: "stdio",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    // Import the module after setting up mocks
    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config).toEqual({
      name: "test-server",
      version: "1.2.3",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      inlineSpecContent: undefined,
      headers: {
        Authorization: "Bearer token",
      },
      transportType: "stdio",
      httpPort: 3000,
      httpHost: "127.0.0.1",
      endpointPath: "/mcp",
      includeTools: undefined,
      includeTags: undefined,
      includeResources: undefined,
      includeOperations: undefined,
      toolsMode: "all",
      disableAbbreviation: undefined,
    })
  })

  it("should load config with local file spec", async () => {
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.specInputMethod).toBe("file")
    expect(config.openApiSpec).toBe("./spec.json")
  })

  it("should load config with stdin spec", async () => {
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "spec-from-stdin": true,
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.specInputMethod).toBe("stdin")
    expect(config.openApiSpec).toBe("stdin")
  })

  it("should load config with inline spec", async () => {
    const inlineSpec =
      '{"openapi": "3.0.0", "info": {"title": "Test", "version": "1.0.0"}, "paths": {}}'

    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "spec-inline": inlineSpec,
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.specInputMethod).toBe("inline")
    expect(config.openApiSpec).toBe("inline")
    expect(config.inlineSpecContent).toBe(inlineSpec)
  })

  it("should load config with environment variables for stdin", async () => {
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({}),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    process.env.API_BASE_URL = "https://env.example.com"
    process.env.OPENAPI_SPEC_FROM_STDIN = "true"

    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.specInputMethod).toBe("stdin")
    expect(config.openApiSpec).toBe("stdin")
  })

  it("should load config with environment variables for inline spec", async () => {
    const inlineSpec = '{"openapi": "3.0.0"}'

    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({}),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    process.env.API_BASE_URL = "https://env.example.com"
    process.env.OPENAPI_SPEC_INLINE = inlineSpec

    const { loadConfig } = await import("../src/config")

    const config = loadConfig()
    expect(config.specInputMethod).toBe("inline")
    expect(config.inlineSpecContent).toBe(inlineSpec)
  })

  it("should throw error if no spec input method is provided", async () => {
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const { loadConfig } = await import("../src/config")

    expect(() => loadConfig()).toThrow(
      "OpenAPI spec is required. Use one of: --openapi-spec, --spec-from-stdin, or --spec-inline",
    )
  })

  it("should throw error if multiple spec input methods are provided", async () => {
    vi.doMock("yargs", () => ({
      default: vi.fn().mockReturnValue({
        option: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        parseSync: vi.fn().mockReturnValue({
          "api-base-url": "https://api.example.com",
          "openapi-spec": "./spec.json",
          "spec-from-stdin": true,
        }),
      }),
    }))

    vi.doMock("yargs/helpers", () => ({
      hideBin: vi.fn((arr) => arr),
    }))

    const { loadConfig } = await import("../src/config")

    expect(() => loadConfig()).toThrow(
      "Only one OpenAPI spec input method can be specified at a time",
    )
  })

  describe("Array Options Handling", () => {
    it("should handle array options for tools, tags, resources, and operations", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tool: ["tool1", "tool2", "tool3"],
            tag: ["auth", "users"],
            resource: ["api/v1/users", "api/v1/posts"],
            operation: ["get", "post", "put"],
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")

      const config = loadConfig()
      expect(config.includeTools).toEqual(["tool1", "tool2", "tool3"])
      expect(config.includeTags).toEqual(["auth", "users"])
      expect(config.includeResources).toEqual(["api/v1/users", "api/v1/posts"])
      expect(config.includeOperations).toEqual(["get", "post", "put"])
    })

    it("should handle single values for array options", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tool: ["single-tool"],
            tag: ["single-tag"],
            resource: ["single-resource"],
            operation: ["get"],
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")

      const config = loadConfig()
      expect(config.includeTools).toEqual(["single-tool"])
      expect(config.includeTags).toEqual(["single-tag"])
      expect(config.includeResources).toEqual(["single-resource"])
      expect(config.includeOperations).toEqual(["get"])
    })

    it("should handle empty arrays for array options", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tool: [],
            tag: [],
            resource: [],
            operation: [],
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")

      const config = loadConfig()
      expect(config.includeTools).toEqual([])
      expect(config.includeTags).toEqual([])
      expect(config.includeResources).toEqual([])
      expect(config.includeOperations).toEqual([])
    })

    it("should handle undefined array options", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            // No array options provided
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")

      const config = loadConfig()
      expect(config.includeTools).toBeUndefined()
      expect(config.includeTags).toBeUndefined()
      expect(config.includeResources).toBeUndefined()
      expect(config.includeOperations).toBeUndefined()
    })
  })

  describe("Enum Validation", () => {
    it("should handle valid transportType choices", async () => {
      // Test stdio
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            transport: "stdio",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      let { loadConfig } = await import("../src/config")
      let config = loadConfig()
      expect(config.transportType).toBe("stdio")

      // Reset and test http
      vi.resetModules()
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            transport: "http",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const configModule = await import("../src/config")
      loadConfig = configModule.loadConfig
      config = loadConfig()
      expect(config.transportType).toBe("http")
    })

    it("should handle valid toolsMode choices", async () => {
      // Test all
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tools: "all",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      let { loadConfig } = await import("../src/config")
      let config = loadConfig()
      expect(config.toolsMode).toBe("all")

      // Reset and test dynamic
      vi.resetModules()
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tools: "dynamic",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      let configModule = await import("../src/config")
      loadConfig = configModule.loadConfig
      config = loadConfig()
      expect(config.toolsMode).toBe("dynamic")

      // Reset and test explicit
      vi.resetModules()
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tools: "explicit",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      configModule = await import("../src/config")
      loadConfig = configModule.loadConfig
      config = loadConfig()
      expect(config.toolsMode).toBe("explicit")
    })

    it("should handle toolsMode from environment variable", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      process.env.TOOLS_MODE = "dynamic"

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.toolsMode).toBe("dynamic")
    })

    it("should normalize toolsMode input to lowercase", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tools: "DYNAMIC",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.toolsMode).toBe("dynamic")
    })

    it("should normalize toolsMode from environment variables", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      process.env.TOOLS_MODE = "EXPLICIT"

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.toolsMode).toBe("explicit")
    })

    it("should throw on invalid toolsMode input", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            tools: "invalid-mode",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      expect(() => loadConfig()).toThrow(
        "Invalid tools mode. Expected one of: all, dynamic, explicit",
      )
    })

    it("should default to 'all' for toolsMode when not specified", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.toolsMode).toBe("all")
    })

    it("should handle transportType from environment variable", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      process.env.TRANSPORT_TYPE = "http"

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.transportType).toBe("http")
    })

    it("should default to 'stdio' for transportType when not specified", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()
      expect(config.transportType).toBe("stdio")
    })

    // Note: Testing invalid enum values would require testing yargs validation directly,
    // which would happen at the yargs level before our code runs. Since we're mocking
    // yargs, we can't test the actual validation behavior. In a real scenario, yargs
    // would throw an error for invalid choices before loadConfig() is called.
    // The validation is handled by yargs' .choices() method in the actual implementation.
  })

  describe("HTTP Configuration", () => {
    it("should handle HTTP transport configuration", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            transport: "http",
            port: 8080,
            host: "0.0.0.0",
            path: "/custom-mcp",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()

      expect(config.transportType).toBe("http")
      expect(config.httpPort).toBe(8080)
      expect(config.httpHost).toBe("0.0.0.0")
      expect(config.endpointPath).toBe("/custom-mcp")
    })

    it("should use default HTTP configuration values", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
            transport: "http",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()

      expect(config.transportType).toBe("http")
      expect(config.httpPort).toBe(3000)
      expect(config.httpHost).toBe("127.0.0.1")
      expect(config.endpointPath).toBe("/mcp")
    })

    it("should handle HTTP configuration from environment variables", async () => {
      vi.doMock("yargs", () => ({
        default: vi.fn().mockReturnValue({
          option: vi.fn().mockReturnThis(),
          help: vi.fn().mockReturnThis(),
          parseSync: vi.fn().mockReturnValue({
            "api-base-url": "https://api.example.com",
            "openapi-spec": "./spec.json",
          }),
        }),
      }))

      vi.doMock("yargs/helpers", () => ({
        hideBin: vi.fn((arr) => arr),
      }))

      process.env.TRANSPORT_TYPE = "http"
      process.env.HTTP_PORT = "9000"
      process.env.HTTP_HOST = "localhost"
      process.env.ENDPOINT_PATH = "/api/mcp"

      const { loadConfig } = await import("../src/config")
      const config = loadConfig()

      expect(config.transportType).toBe("http")
      expect(config.httpPort).toBe(9000)
      expect(config.httpHost).toBe("localhost")
      expect(config.endpointPath).toBe("/api/mcp")
    })
  })
})
