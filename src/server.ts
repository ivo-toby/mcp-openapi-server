import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { OpenAPIMCPServerConfig } from "./config"
import { ToolsManager } from "./tools-manager"
import { ApiClient } from "./api-client"

/**
 * MCP server implementation for OpenAPI specifications
 */
export class OpenAPIServer {
  private server: Server
  private toolsManager: ToolsManager
  private apiClient: ApiClient

  constructor(config: OpenAPIMCPServerConfig) {
    this.server = new Server(
      { name: config.name, version: config.version },
      {
        capabilities: {
          tools: {},
        },
      },
    )
    this.toolsManager = new ToolsManager(config)
    this.apiClient = new ApiClient(config.apiBaseUrl, config.headers)
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
  }

  /**
   * Start the server with the given transport
   */
  async start(transport: Transport): Promise<void> {
    await this.toolsManager.initialize()
    await this.server.connect(transport)
  }
}
