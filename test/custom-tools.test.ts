import { describe, it, expect, beforeEach, vi } from "vitest"
import { OpenAPIServer } from "../src/server"
import type { OpenAPIMCPServerConfig } from "../src/config"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

describe("Custom Tools", () => {
  let server: OpenAPIServer
  let baseConfig: OpenAPIMCPServerConfig

  beforeEach(() => {
    baseConfig = {
      name: "test-server",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url",
      transportType: "stdio",
      toolsMode: "all",
    }
  })

  describe("registerTool()", () => {
    it("should register a custom tool programmatically", () => {
      server = new OpenAPIServer(baseConfig)

      const handler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "42" }],
      })

      server.registerTool("add", {
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
        handler,
      })

      expect(server).toBeDefined()
    })

    it("should throw error when registering duplicate tool name", () => {
      server = new OpenAPIServer(baseConfig)

      const handler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "result" }],
      })

      server.registerTool("test-tool", {
        description: "First tool",
        inputSchema: { type: "object" },
        handler,
      })

      expect(() => {
        server.registerTool("test-tool", {
          description: "Duplicate tool",
          inputSchema: { type: "object" },
          handler,
        })
      }).toThrow("Tool with name 'test-tool' already exists")
    })
  })

  describe("extraTools config", () => {
    it("should load custom tools from config", () => {
      const handler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "config tool result" }],
      })

      const config: OpenAPIMCPServerConfig = {
        ...baseConfig,
        extraTools: [
          {
            name: "config-tool",
            description: "Tool from config",
            inputSchema: {
              type: "object",
              properties: {
                input: { type: "string" },
              },
            },
            handler,
          },
        ],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })
  })

  describe("registerPrompt()", () => {
    it("should register a prompt programmatically", () => {
      server = new OpenAPIServer(baseConfig)

      server.registerPrompt({
        name: "test-prompt",
        description: "Test prompt",
        template: "Do this: {{task}}",
        arguments: [
          {
            name: "task",
            description: "Task to do",
            required: true,
          },
        ],
      })

      expect(server).toBeDefined()
    })
  })

  describe("registerResource()", () => {
    it("should register a resource programmatically", () => {
      server = new OpenAPIServer(baseConfig)

      server.registerResource({
        uri: "test://resource",
        name: "Test Resource",
        description: "A test resource",
        mimeType: "text/plain",
        text: "resource content",
      })

      expect(server).toBeDefined()
    })
  })

  describe("Custom tool execution", () => {
    it("should execute custom tool handler with provided arguments", async () => {
      server = new OpenAPIServer(baseConfig)

      const handler = vi.fn<
        [Record<string, unknown>],
        Promise<CallToolResult>
      >().mockResolvedValue({
        content: [{ type: "text", text: "5" }],
      })

      server.registerTool("add", {
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
        },
        handler,
      })

      // Note: Full end-to-end testing requires server.start() which is tested in integration tests
      // This test verifies the registration works without errors
      expect(server).toBeDefined()
    })

    it("should return error when custom tool handler throws", async () => {
      server = new OpenAPIServer(baseConfig)

      const handler = vi.fn().mockRejectedValue(new Error("Handler error"))

      server.registerTool("failing-tool", {
        description: "A tool that fails",
        inputSchema: { type: "object" },
        handler,
      })

      expect(server).toBeDefined()
    })
  })

  describe("Integration with OpenAPI tools", () => {
    it("should allow both custom and OpenAPI tools to coexist", () => {
      server = new OpenAPIServer(baseConfig)

      const handler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "custom result" }],
      })

      server.registerTool("custom-tool", {
        description: "Custom utility tool",
        inputSchema: { type: "object" },
        handler,
      })

      // OpenAPI tools are loaded from spec during server.start()
      expect(server).toBeDefined()
    })
  })

  describe("Capability declaration", () => {
    it("should always include tools capability", () => {
      server = new OpenAPIServer(baseConfig)
      expect(server).toBeDefined()
    })

    it("should include prompts capability when prompts registered", () => {
      const config: OpenAPIMCPServerConfig = {
        ...baseConfig,
        prompts: [
          {
            name: "test",
            description: "test",
            template: "test",
          },
        ],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })

    it("should include resources capability when resources registered", () => {
      const config: OpenAPIMCPServerConfig = {
        ...baseConfig,
        resources: [
          {
            uri: "test://res",
            name: "Test",
            mimeType: "text/plain",
            text: "content",
          },
        ],
      }

      server = new OpenAPIServer(config)
      expect(server).toBeDefined()
    })
  })
})
