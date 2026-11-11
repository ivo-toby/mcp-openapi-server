import { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { Agent as HttpsAgent } from "node:https"
import { OpenAPISpecLoader, ExtendedTool } from "./openapi-loader"
import { AuthProvider, StaticAuthProvider } from "./auth-provider.js"
import { OpenAPIMCPServerConfig } from "./config"
import { OpenAPIV3 } from "openapi-types"
import { parseToolId as parseToolIdUtil } from "./utils/tool-id.js"
import { Logger } from "./utils/logger"

/**
 * Manages the tools available in the MCP server
 */
export class ToolsManager {
  private tools: Map<string, Tool> = new Map()
  private specLoader: OpenAPISpecLoader
  private loadedSpec?: OpenAPIV3.Document
  private logger: Logger

  constructor(
    private config: OpenAPIMCPServerConfig,
    options?: { httpsAgent?: HttpsAgent; authProvider?: AuthProvider },
  ) {
    // Ensure toolsMode has a default value of 'all'
    this.config.toolsMode = this.config.toolsMode || "all"
    this.specLoader = new OpenAPISpecLoader({
      disableAbbreviation: this.config.disableAbbreviation,
      verbose: this.config.verbose,
      httpsAgent: options?.httpsAgent,
      // TLS settings are configured for the API; only use them for a spec on the API's origin
      httpsAgentScope: this.config.apiBaseUrl,
      // Auth headers follow the same rule by default (see specAuth)
      authProvider: options?.authProvider ?? this.resolveAuthProvider(),
      specAuth: this.config.specAuth,
      authScope: this.config.apiBaseUrl,
    })
    this.logger = new Logger(this.config.verbose)
  }

  /**
   * Auth provider for spec requests when none is passed explicitly: the configured
   * AuthProvider, or the static headers
   */
  private resolveAuthProvider(): AuthProvider | undefined {
    if (this.config.authProvider) {
      return this.config.authProvider
    }
    if (this.config.headers && Object.keys(this.config.headers).length > 0) {
      return new StaticAuthProvider(this.config.headers)
    }
    return undefined
  }

  private toolHasMatchingTag(tool: ExtendedTool, tagsLower: string[]): boolean {
    if (tagsLower.length === 0) {
      return false
    }

    const toolTags = Array.isArray(tool.tags) ? tool.tags : []
    return toolTags.some((tag) => typeof tag === "string" && tagsLower.includes(tag.toLowerCase()))
  }

  /**
   * Get the OpenAPI spec loader instance
   */
  getSpecLoader(): OpenAPISpecLoader {
    return this.specLoader
  }

  /**
   * Get the loaded OpenAPI specification
   */
  getOpenApiSpec(): OpenAPIV3.Document | undefined {
    return this.loadedSpec
  }

  /**
   * Create dynamic discovery meta-tools
   */
  private createDynamicTools(): Map<string, Tool> {
    const dynamicTools = new Map<string, Tool>()

    // LIST-API-ENDPOINTS
    dynamicTools.set("LIST-API-ENDPOINTS", {
      name: "list-api-endpoints",
      description: "List all available API endpoints",
      inputSchema: { type: "object", properties: {} },
    })

    // GET-API-ENDPOINT-SCHEMA
    dynamicTools.set("GET-API-ENDPOINT-SCHEMA", {
      name: "get-api-endpoint-schema",
      description: "Get the JSON schema for a specified API endpoint",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: {
            type: "string",
            description:
              "Endpoint path, as a template (e.g. /users/{id}) or concrete (e.g. /users/123)",
          },
        },
        required: ["endpoint"],
      },
    })

    // INVOKE-API-ENDPOINT
    dynamicTools.set("INVOKE-API-ENDPOINT", {
      name: "invoke-api-endpoint",
      description: "Invoke an API endpoint with provided parameters",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: {
            type: "string",
            description:
              "Endpoint path to invoke, either a template with path parameters supplied in params (e.g. /users/{id}) or a concrete path (e.g. /users/123)",
          },
          method: {
            type: "string",
            description: "HTTP method to use (optional, e.g. GET, POST, PUT, DELETE)",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
          },
          params: {
            type: "object",
            description:
              "Parameters for the API call. Object request bodies are passed as their properties. " +
              "Non-object bodies (strings, arrays) go in params.body; binary bodies " +
              "(e.g. application/octet-stream) go in params.body as base64. " +
              "See bodyParameter in get-api-endpoint-schema.",
            properties: {},
          },
        },
        required: ["endpoint"],
      },
    })

    return dynamicTools
  }

  /**
   * Initialize tools from the OpenAPI specification
   */
  async initialize(): Promise<void> {
    const spec = await this.specLoader.loadOpenAPISpec(
      this.config.openApiSpec,
      this.config.specInputMethod,
      this.config.inlineSpecContent,
    )
    this.loadedSpec = spec // Store the loaded spec

    // Determine tools loading mode
    if (this.config.toolsMode === "dynamic") {
      // Use dynamic discovery meta-tools
      this.tools = this.createDynamicTools()
      return
    }

    if (this.config.toolsMode === "explicit") {
      // Only load tools explicitly listed in includeTools
      const rawTools = this.specLoader.parseOpenAPISpec(spec)
      const filtered = new Map<string, Tool>()
      const excludeTagsLower = this.config.excludeTags?.map((tag) => tag.toLowerCase()) || []

      if (this.config.includeTools && this.config.includeTools.length > 0) {
        const includeToolsLower = this.config.includeTools.map((t) => t.toLowerCase())

        for (const [toolId, tool] of rawTools.entries()) {
          const extendedTool = tool as ExtendedTool
          const toolIdLower = toolId.toLowerCase()
          const toolNameLower = tool.name.toLowerCase()

          // Include tool if it matches by ID or name
          if (
            includeToolsLower.includes(toolIdLower) ||
            includeToolsLower.includes(toolNameLower)
          ) {
            if (this.toolHasMatchingTag(extendedTool, excludeTagsLower)) {
              continue
            }
            filtered.set(toolId, tool)
          }
        }
      }
      // If includeTools is empty or undefined, no tools are loaded in explicit mode

      this.tools = filtered

      // Log the registered tools
      for (const [toolId, tool] of this.tools.entries()) {
        this.logger.error(`Registered tool: ${toolId} (${tool.name})`)
      }
      return
    }

    // Load and filter standard tools (for "all" mode)
    const rawTools = this.specLoader.parseOpenAPISpec(spec)
    const filtered = new Map<string, Tool>()

    // Precompute lowercase filter arrays for better performance
    const includeToolsLower = this.config.includeTools?.map((t) => t.toLowerCase()) || []
    const includeOperationsLower =
      this.config.includeOperations?.map((op) => op.toLowerCase()) || []
    const includeResourcesLower =
      this.config.includeResources?.map((res) => res.toLowerCase()) || []
    const includeTagsLower = this.config.includeTags?.map((tag) => tag.toLowerCase()) || []
    const excludeTagsLower = this.config.excludeTags?.map((tag) => tag.toLowerCase()) || []

    for (const [toolId, tool] of rawTools.entries()) {
      const extendedTool = tool as ExtendedTool

      // excludeTags filter - always wins over include filters
      if (this.toolHasMatchingTag(extendedTool, excludeTagsLower)) {
        continue
      }

      // includeTools filter - takes highest priority
      if (includeToolsLower.length > 0) {
        const toolIdLower = toolId.toLowerCase()
        const toolNameLower = tool.name.toLowerCase()
        if (
          !includeToolsLower.includes(toolIdLower) &&
          !includeToolsLower.includes(toolNameLower)
        ) {
          continue
        }
        // If tool is explicitly included, skip other filters and add it
        filtered.set(toolId, tool)
        continue
      }

      // includeOperations filter
      if (includeOperationsLower.length > 0) {
        const httpMethod =
          typeof extendedTool.httpMethod === "string"
            ? extendedTool.httpMethod.toLowerCase()
            : undefined
        if (!httpMethod || !includeOperationsLower.includes(httpMethod)) {
          continue
        }
      }

      // includeResources filter
      if (includeResourcesLower.length > 0) {
        const resourceName =
          typeof extendedTool.resourceName === "string"
            ? extendedTool.resourceName.toLowerCase()
            : undefined
        if (!resourceName || !includeResourcesLower.includes(resourceName)) {
          continue
        }
      }

      // includeTags filter
      if (includeTagsLower.length > 0) {
        if (!this.toolHasMatchingTag(extendedTool, includeTagsLower)) {
          continue
        }
      }

      filtered.set(toolId, tool)
    }
    this.tools = filtered

    // Log the registered tools
    for (const [toolId, tool] of this.tools.entries()) {
      this.logger.error(`Registered tool: ${toolId} (${tool.name})`)
    }
  }

  /**
   * Get all available tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get all available tools with their IDs
   * Returns array of [toolId, tool] pairs
   */
  getToolsWithIds(): [string, Tool][] {
    return Array.from(this.tools.entries())
  }

  /**
   * Find a tool by ID or name
   */
  findTool(idOrName: string): { toolId: string; tool: Tool } | undefined {
    const lowerIdOrName = idOrName.toLowerCase()

    // Try to find by ID first (case-insensitive)
    for (const [toolId, tool] of this.tools.entries()) {
      if (toolId.toLowerCase() === lowerIdOrName) {
        return { toolId, tool }
      }
    }

    // Then try to find by name (case-insensitive)
    for (const [toolId, tool] of this.tools.entries()) {
      if (tool.name.toLowerCase() === lowerIdOrName) {
        return { toolId, tool }
      }
    }

    return undefined
  }

  /**
   * Get the path and method from a tool ID
   *
   * Note: This converts hyphens back to slashes to reconstruct the original API path.
   * This is consistent with ApiClient.parseToolId() which needs the actual path for HTTP requests.
   */
  parseToolId(toolId: string): { method: string; path: string } {
    return parseToolIdUtil(toolId)
  }
}
