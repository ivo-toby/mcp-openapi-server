import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { OpenAPIMCPServerConfig } from "./config"
import { ToolsManager } from "./tools-manager"
import { ApiClient } from "./api-client"
import { StaticAuthProvider } from "./auth-provider.js"
import { PromptsManager } from "./prompts-manager"
import { ResourcesManager } from "./resources-manager"
import type { PromptDefinition } from "./prompt-types"
import type { ResourceDefinition } from "./resource-types"
import type { CustomToolDefinition } from "./types/custom-primitives"

/**
 * MCP server implementation for OpenAPI specifications
 */
export class OpenAPIServer {
  private server: Server
  private toolsManager: ToolsManager
  private apiClient: ApiClient
  private promptsManager: PromptsManager
  private resourcesManager: ResourcesManager
  private customTools: Map<string, CustomToolDefinition>
  private config: OpenAPIMCPServerConfig

  constructor(config: OpenAPIMCPServerConfig) {
    this.config = config

    // Always initialize managers (even if config is empty) to allow later registration
    this.promptsManager = new PromptsManager({ prompts: config.prompts || [] })
    this.resourcesManager = new ResourcesManager({ resources: config.resources || [] })
    this.customTools = new Map()

    // Load extraTools from config if provided
    if (config.extraTools) {
      for (const tool of config.extraTools) {
        this.customTools.set(tool.name, tool)
      }
    }

    // Build capabilities based on what's configured
    const capabilities: Record<string, any> = {
      tools: {
        list: true,
        execute: true,
      },
      // Always declare prompts and resources capabilities
      // since they can be registered dynamically after construction
      prompts: {},
      resources: {},
    }

    this.server = new Server(
      { name: config.name, version: config.version },
      { capabilities },
    )
    this.toolsManager = new ToolsManager(config)

    // Use AuthProvider if provided, otherwise fallback to static headers
    const authProviderOrHeaders = config.authProvider || new StaticAuthProvider(config.headers)
    this.apiClient = new ApiClient(
      config.apiBaseUrl,
      authProviderOrHeaders,
      this.toolsManager.getSpecLoader(),
    )

    this.initializeHandlers()
  }

  /**
   * Initialize request handlers
   */
  private initializeHandlers(): void {
    // Handle tool listing - merge OpenAPI + custom tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const openApiTools = this.toolsManager.getAllTools()
      const customTools = Array.from(this.customTools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }))
      return {
        tools: [...openApiTools, ...customTools] as any,
      }
    })

    // Handle tool execution - check OpenAPI tools first, then custom tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { id, name, arguments: params } = request.params

      console.error("Received request:", request.params)
      console.error("Using parameters from arguments:", params)

      // Find tool by ID or name
      const idOrName = typeof id === "string" ? id : typeof name === "string" ? name : ""
      if (!idOrName) {
        throw new Error("Tool ID or name is required")
      }

      // First, try OpenAPI tools
      const toolInfo = this.toolsManager.findTool(idOrName)
      if (toolInfo) {
        const { toolId, tool } = toolInfo
        console.error(`Executing OpenAPI tool: ${toolId} (${tool.name})`)

        try {
          // Execute the API call
          const result = await this.apiClient.executeApiCall(toolId, params || {})

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          }
        } catch (error) {
          if (error instanceof Error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error.message}`,
                },
              ],
              isError: true,
            }
          }
          throw error
        }
      }

      // If not found in OpenAPI tools, check custom tools
      const customTool = this.customTools.get(idOrName)
      if (customTool) {
        console.error(`Executing custom tool: ${customTool.name}`)
        try {
          return await customTool.handler(params || {})
        } catch (error) {
          if (error instanceof Error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error.message}`,
                },
              ],
              isError: true,
            }
          }
          throw error
        }
      }

      // Tool not found in either category
      const availableTools = [
        ...Array.from(this.toolsManager.getAllTools()).map((t) => t.name),
        ...Array.from(this.customTools.keys()),
      ]
      console.error(`Available tools: ${availableTools.join(", ")}`)
      throw new Error(`Tool not found: ${idOrName}`)
    })

    // Prompt handlers (always available)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.promptsManager.getAllPrompts(),
    }))

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return this.promptsManager.getPrompt(
        request.params.name,
        request.params.arguments,
      )
    })

    // Resource handlers (always available)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.resourcesManager.getAllResources(),
    }))

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.resourcesManager.readResource(request.params.uri)
    })
  }

  /**
   * Register a custom tool
   */
  registerTool(name: string, definition: Omit<CustomToolDefinition, "name">): void {
    if (this.customTools.has(name)) {
      throw new Error(`Tool with name '${name}' already exists`)
    }
    this.customTools.set(name, { name, ...definition })
  }

  /**
   * Register a prompt
   */
  registerPrompt(prompt: PromptDefinition): void {
    this.promptsManager.addPrompt(prompt)
  }

  /**
   * Register a resource
   */
  registerResource(resource: ResourceDefinition): void {
    this.resourcesManager.addResource(resource)
  }

  /**
   * Start the server with the given transport
   */
  async start(transport: Transport): Promise<void> {
    await this.toolsManager.initialize()

    // Pass the tools to the API client
    const toolsMap = new Map<string, Tool>()
    for (const [toolId, tool] of this.toolsManager.getToolsWithIds()) {
      toolsMap.set(toolId, tool)
    }
    this.apiClient.setTools(toolsMap)

    // Pass the OpenAPI spec to the API client for dynamic meta-tools
    const spec = this.toolsManager.getOpenApiSpec()
    if (spec) {
      this.apiClient.setOpenApiSpec(spec)
    }

    await this.server.connect(transport)
  }

  /**
   * Get the prompts manager (for library users to add prompts dynamically)
   */
  getPromptsManager(): PromptsManager | undefined {
    return this.promptsManager
  }

  /**
   * Get the resources manager (for library users to add resources dynamically)
   */
  getResourcesManager(): ResourcesManager | undefined {
    return this.resourcesManager
  }
}

