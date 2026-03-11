import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { readFileSync } from "node:fs"
import { Agent as HttpsAgent } from "node:https"
import {
  CallToolResult,
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
import { ApiClient, type ApiClientOptions } from "./api-client"
import { StaticAuthProvider } from "./auth-provider.js"
import { PromptsManager } from "./prompts-manager"
import { ResourcesManager } from "./resources-manager"
import { Logger } from "./utils/logger"
import { ExtraToolDefinition } from "./types/extra-tools"

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
  private logger: Logger
  private extraTools = new Map<string, ExtraToolDefinition>()
  private extraToolIdsLower = new Map<string, ExtraToolDefinition>()
  private extraToolNamesLower = new Map<string, ExtraToolDefinition>()

  constructor(config: OpenAPIMCPServerConfig) {
    this.config = config
    this.logger = new Logger(config.verbose)
    this.registerExtraTools(config.extraTools || [])

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

    this.server = new Server({ name: config.name, version: config.version }, { capabilities })
    this.toolsManager = new ToolsManager(config)

    // Use AuthProvider if provided, otherwise fallback to static headers
    const authProviderOrHeaders = config.authProvider || new StaticAuthProvider(config.headers)
    const apiClientOptions = this.createApiClientOptions()
    this.apiClient = apiClientOptions
      ? new ApiClient(
          config.apiBaseUrl,
          authProviderOrHeaders,
          this.toolsManager.getSpecLoader(),
          apiClientOptions,
        )
      : new ApiClient(config.apiBaseUrl, authProviderOrHeaders, this.toolsManager.getSpecLoader())

    this.initializeHandlers()
  }

  private registerExtraTools(extraTools: ExtraToolDefinition[]): void {
    for (const extraTool of extraTools) {
      const normalizedId = extraTool.id.toLowerCase()
      const normalizedName = extraTool.tool.name.toLowerCase()

      if (this.extraToolIdsLower.has(normalizedId)) {
        throw new Error(`Duplicate extra tool id: "${extraTool.id}"`)
      }

      if (this.extraToolNamesLower.has(normalizedName)) {
        throw new Error(`Duplicate extra tool name: "${extraTool.tool.name}"`)
      }

      if (this.extraToolNamesLower.has(normalizedId)) {
        throw new Error(`Extra tool id conflicts with existing extra tool name: "${extraTool.id}"`)
      }

      if (this.extraToolIdsLower.has(normalizedName)) {
        throw new Error(
          `Extra tool name conflicts with existing extra tool id: "${extraTool.tool.name}"`,
        )
      }

      this.extraTools.set(extraTool.id, extraTool)
      this.extraToolIdsLower.set(normalizedId, extraTool)
      this.extraToolNamesLower.set(normalizedName, extraTool)
    }
  }

  private getAllTools(): Tool[] {
    return [
      ...this.toolsManager.getAllTools(),
      ...Array.from(this.extraTools.values(), (tool) => tool.tool),
    ]
  }

  private async executeExtraTool(
    toolIdOrName: string,
    params: Record<string, unknown>,
  ): Promise<CallToolResult | undefined> {
    const normalizedIdOrName = toolIdOrName.toLowerCase()
    const extraTool =
      this.extraToolIdsLower.get(normalizedIdOrName) ||
      this.extraToolNamesLower.get(normalizedIdOrName)

    if (!extraTool) {
      return undefined
    }

    this.logger.error(`Executing extra tool: ${extraTool.id} (${extraTool.tool.name})`)

    try {
      return await extraTool.handler(params)
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

  private validateExtraToolConflicts(toolsWithIds: Array<[string, Tool]>): void {
    for (const [toolId, tool] of toolsWithIds) {
      const normalizedId = toolId.toLowerCase()
      const normalizedName = tool.name.toLowerCase()

      if (this.extraToolIdsLower.has(normalizedId)) {
        throw new Error(`Extra tool id conflicts with generated tool id: "${toolId}"`)
      }

      if (this.extraToolNamesLower.has(normalizedName)) {
        throw new Error(`Extra tool name conflicts with generated tool name: "${tool.name}"`)
      }

      if (this.extraToolIdsLower.has(normalizedName)) {
        throw new Error(`Extra tool id conflicts with generated tool name: "${tool.name}"`)
      }

      if (this.extraToolNamesLower.has(normalizedId)) {
        throw new Error(`Extra tool name conflicts with generated tool id: "${toolId}"`)
      }
    }
  }

  private createApiClientOptions(): ApiClientOptions | undefined {
    const hasClientCert = !!this.config.clientCertPath
    const hasClientKey = !!this.config.clientKeyPath

    if (hasClientCert !== hasClientKey) {
      throw new Error("clientCertPath and clientKeyPath must be provided together")
    }

    if (this.config.clientKeyPassphrase && !hasClientKey) {
      throw new Error("clientKeyPassphrase requires clientKeyPath and clientCertPath")
    }

    const rejectUnauthorized = this.config.rejectUnauthorized ?? true
    const shouldConfigureHttpsAgent =
      hasClientCert || hasClientKey || !!this.config.caCertPath || rejectUnauthorized === false

    if (!shouldConfigureHttpsAgent) {
      return undefined
    }

    let apiUrl: URL
    try {
      apiUrl = new URL(this.config.apiBaseUrl.trim())
    } catch {
      throw new Error("TLS options require apiBaseUrl to be a valid https:// URL")
    }

    if (apiUrl.protocol !== "https:") {
      throw new Error("TLS options require apiBaseUrl to use https://")
    }

    const httpsAgentOptions: ConstructorParameters<typeof HttpsAgent>[0] = {
      rejectUnauthorized,
    }

    if (this.config.clientCertPath) {
      httpsAgentOptions.cert = readFileSync(this.config.clientCertPath, "utf8")
    }
    if (this.config.clientKeyPath) {
      httpsAgentOptions.key = readFileSync(this.config.clientKeyPath, "utf8")
    }
    if (this.config.caCertPath) {
      httpsAgentOptions.ca = readFileSync(this.config.caCertPath, "utf8")
    }
    if (this.config.clientKeyPassphrase) {
      httpsAgentOptions.passphrase = this.config.clientKeyPassphrase
    }

    return {
      httpsAgent: new HttpsAgent(httpsAgentOptions),
    }
  }

  /**
   * Initialize request handlers
   */
  private initializeHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAllTools() as any,
      }
    })

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { id, name, arguments: params } = request.params

      this.logger.error("Received request:", request.params)
      this.logger.error("Using parameters from arguments:", params)

      // Find tool by ID or name
      const idOrName = typeof id === "string" ? id : typeof name === "string" ? name : ""
      if (!idOrName) {
        throw new Error("Tool ID or name is required")
      }

      const extraToolResult = await this.executeExtraTool(
        idOrName,
        (params || {}) as Record<string, unknown>,
      )
      if (extraToolResult) {
        return extraToolResult
      }

      const toolInfo = this.toolsManager.findTool(idOrName)
      if (!toolInfo) {
        this.logger.error(
          `Available tools: ${Array.from(this.getAllTools())
            .map((t) => t.name)
            .join(", ")}`,
        )
        throw new Error(`Tool not found: ${idOrName}`)
      }

      const { toolId, tool } = toolInfo
      this.logger.error(`Executing tool: ${toolId} (${tool.name})`)

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
        return this.promptsManager!.getPrompt(request.params.name, request.params.arguments)
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
    const toolsWithIds = this.toolsManager.getToolsWithIds()
    this.validateExtraToolConflicts(toolsWithIds)

    for (const [toolId, tool] of toolsWithIds) {
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
