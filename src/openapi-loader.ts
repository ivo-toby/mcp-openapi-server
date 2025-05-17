import { OpenAPIV3 } from "openapi-types"
import axios from "axios"
import { readFile } from "fs/promises"
import { Tool } from "@modelcontextprotocol/sdk/types.js"

/**
 * Class to load and parse OpenAPI specifications
 */
export class OpenAPISpecLoader {
  /**
   * Load an OpenAPI specification from a file or URL
   */
  async loadOpenAPISpec(specPath: string): Promise<OpenAPIV3.Document> {
    if (specPath.startsWith("http")) {
      // Load from URL
      const response = await axios.get(specPath)
      return response.data as OpenAPIV3.Document
    } else {
      // Load from local file
      const content = await readFile(specPath, "utf-8")
      return JSON.parse(content) as OpenAPIV3.Document
    }
  }

  /**
   * Parse an OpenAPI specification into a map of tools
   */
  parseOpenAPISpec(spec: OpenAPIV3.Document): Map<string, Tool> {
    const tools = new Map<string, Tool>()

    // Convert each OpenAPI path to an MCP tool
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue

        const op = operation as OpenAPIV3.OperationObject
        // Create a clean tool ID by removing the leading slash and replacing special chars
        const cleanPath = path.replace(/^\//, "").replace(/\{([^}]+)\}/g, "$1")
        const toolId = `${method.toUpperCase()}-${cleanPath}`.replace(/[^a-zA-Z0-9-]/g, "-")

        const name = (op.operationId || op.summary || `${method.toUpperCase()} ${path}`).replace(
          /[^a-zA-Z0-9-]/g,
          "-",
        )

        const tool: Tool = {
          name,
          description: op.description || `Make a ${method.toUpperCase()} request to ${path}`,
          inputSchema: {
            type: "object",
            properties: {},
          },
        }

        // Add parameters from operation
        if (op.parameters) {
          const requiredParams: string[] = []

          for (const param of op.parameters) {
            if ("name" in param && "in" in param) {
              const paramSchema = param.schema as OpenAPIV3.SchemaObject
              if (tool.inputSchema && tool.inputSchema.properties) {
                tool.inputSchema.properties[param.name] = {
                  type: paramSchema.type || "string",
                  description: param.description || `${param.name} parameter`,
                }
              }
              // Add required parameters to our temporary array
              if (param.required === true) {
                requiredParams.push(param.name)
              }
            }
          }

          // Only add the required array if there are required parameters
          if (requiredParams.length > 0 && tool.inputSchema) {
            tool.inputSchema.required = requiredParams
          }
        }
        tools.set(toolId, tool)
      }
    }

    return tools
  }
}
