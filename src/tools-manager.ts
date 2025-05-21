import { Tool } from "@modelcontextprotocol/sdk/types.js"
import { OpenAPISpecLoader } from "./openapi-loader"
import { OpenAPIMCPServerConfig } from "./config"

/**
 * Manages the tools available in the MCP server
 */
export class ToolsManager {
  private tools: Map<string, Tool> = new Map()
  private specLoader: OpenAPISpecLoader

  constructor(private config: OpenAPIMCPServerConfig) {
    this.specLoader = new OpenAPISpecLoader()
  }

  /**
   * Initialize tools from the OpenAPI specification
   */
  async initialize(): Promise<void> {
    const spec = await this.specLoader.loadOpenAPISpec(this.config.openApiSpec)
    // Determine tools loading mode
    if (this.config.toolsMode === "dynamic") {
      // Dynamic discovery meta-tools
      const dynamicTools: [string, Tool][] = []
      // list_api_endpoints
      dynamicTools.push([
        "list_api_endpoints",
        {
          name: "list_api_endpoints",
          description: "List all available API endpoints",
          inputSchema: { type: "object", properties: {} },
        },
      ])
      // get_api_endpoint_schema
      dynamicTools.push([
        "get_api_endpoint_schema",
        {
          name: "get_api_endpoint_schema",
          description: "Get the JSON schema for a specified API endpoint",
          inputSchema: {
            type: "object",
            properties: {
              endpoint: { type: "string", description: "Endpoint path (e.g. /users/{id})" },
            },
            required: ["endpoint"],
          },
        },
      ])
      // invoke_api_endpoint
      dynamicTools.push([
        "invoke_api_endpoint",
        {
          name: "invoke_api_endpoint",
          description: "Invoke an API endpoint with provided parameters",
          inputSchema: {
            type: "object",
            properties: {
              endpoint: { type: "string", description: "Endpoint path to invoke" },
              params: {
                type: "object",
                description: "Parameters for the API call",
                properties: {},
              },
            },
            required: ["endpoint"],
          },
        },
      ])
      this.tools = new Map(dynamicTools)
      return
    }
    // Load and filter standard tools
    const rawTools = this.specLoader.parseOpenAPISpec(spec)
    const filtered = new Map<string, Tool>()
    // Helper to parse toolId into method and path
    const parse = (id: string) => {
      const [method, ...parts] = id.split("-")
      const path = "/" + parts.join("/").replace(/-/g, "/")
      return { method: method.toLowerCase(), path }
    }
    for (const [toolId, tool] of rawTools.entries()) {
      // includeTools filter
      if (this.config.includeTools && this.config.includeTools.length > 0) {
        if (
          !this.config.includeTools.includes(toolId) &&
          !this.config.includeTools.includes(tool.name)
        ) {
          continue
        }
      }
      // includeOperations filter
      if (this.config.includeOperations && this.config.includeOperations.length > 0) {
        const { method } = parse(toolId)
        if (!this.config.includeOperations.map((op) => op.toLowerCase()).includes(method)) {
          continue
        }
      }
      // includeResources filter
      if (this.config.includeResources && this.config.includeResources.length > 0) {
        const { path } = parse(toolId)
        // Match exact resource prefix (after leading slash)
        const match = this.config.includeResources.some(
          (res) => path === `/${res}` || path.startsWith(`/${res}/`),
        )
        if (!match) continue
      }
      // includeTags filter
      if (this.config.includeTags && this.config.includeTags.length > 0) {
        // Attempt to read tags from original spec paths
        const { method, path } = parse(toolId)
        // @ts-ignore: dynamic indexing of PathItemObject by method
        const opObj: any = (spec.paths[path] as any)?.[method]
        const tags: string[] = Array.isArray(opObj?.tags) ? (opObj.tags as string[]) : []
        if (!tags.some((t: string) => this.config.includeTags!.includes(t))) continue
      }
      filtered.set(toolId, tool)
    }
    this.tools = filtered

    // Log the registered tools
    for (const [toolId, tool] of this.tools.entries()) {
      console.error(`Registered tool: ${toolId} (${tool.name})`)
    }
  }

  /**
   * Get all available tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Find a tool by ID or name
   */
  findTool(idOrName: string): { toolId: string; tool: Tool } | undefined {
    // Try to find by ID first
    if (this.tools.has(idOrName)) {
      return { toolId: idOrName, tool: this.tools.get(idOrName)! }
    }

    // Then try to find by name
    for (const [toolId, tool] of this.tools.entries()) {
      if (tool.name === idOrName) {
        return { toolId, tool }
      }
    }

    return undefined
  }

  /**
   * Get the path and method from a tool ID
   */
  parseToolId(toolId: string): { method: string; path: string } {
    const [method, ...pathParts] = toolId.split("-")
    const path = "/" + pathParts.join("/").replace(/-/g, "/")
    return { method, path }
  }
}
