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

/**
 * MCP server implementation for OpenAPI specifications
 */
export class OpenAPIServer {
  private server: Server
  private toolsManager: ToolsManager
  private apiClient: ApiClient
  private promptsManager?: PromptsManager
  private resourcesManager?: ResourcesManager
  private config: OpenAPIMCPServerConfig

  constructor(config: OpenAPIMCPServerConfig) {
    this.config = config

    // Initialize optional managers
    if (config.prompts?.length) {
      this.promptsManager = new PromptsManager({ prompts: config.prompts })
    }
    if (config.resources?.length) {
      this.resourcesManager = new ResourcesManager({ resources: config.resources })
    }

    // Build capabilities based on what's configured
    const capabilities: Record<string, any> = {
      tools: {
        list: true,
        execute: true,
      },
    }
    if (this.promptsManager) {
      capabilities.prompts = {}
    }
    if (this.resourcesManager) {
      capabilities.resources = {}
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
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.toolsManager.getAllTools() as any,
      }
    })

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { id, name, arguments: params } = request.params

      console.error("Received request:", request.params)
      console.error("Using parameters from arguments:", params)

      // Find tool by ID or name
      const idOrName = typeof id === "string" ? id : typeof name === "string" ? name : ""
      if (!idOrName) {
        throw new Error("Tool ID or name is required")
      }

      const toolInfo = this.toolsManager.findTool(idOrName)
      if (!toolInfo) {
        console.error(
          `Available tools: ${Array.from(this.toolsManager.getAllTools())
            .map((t) => t.name)
            .join(", ")}`,
        )
        throw new Error(`Tool not found: ${idOrName}`)
      }

      const { toolId, tool } = toolInfo
      console.error(`Executing tool: ${toolId} (${tool.name})`)

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
    })

    // Prompt handlers
    if (this.promptsManager) {
      this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: this.promptsManager!.getAllPrompts(),
      }))

      this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        return this.promptsManager!.getPrompt(
          request.params.name,
          request.params.arguments,
        )
      })
    }

    // Resource handlers
    if (this.resourcesManager) {
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: this.resourcesManager!.getAllResources(),
      }))

      this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        return this.resourcesManager!.readResource(request.params.uri)
      })
    }
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

