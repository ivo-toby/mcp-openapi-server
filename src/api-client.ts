import axios, { AxiosInstance, AxiosError } from "axios"
import { Tool } from "@modelcontextprotocol/sdk/types.js"
import { AuthProvider, StaticAuthProvider, isAuthError } from "./auth-provider.js"
import { parseToolId as parseToolIdUtil, generateToolId } from "./utils/tool-id.js"
import { isValidHttpMethod, isGetLikeMethod, VALID_HTTP_METHODS } from "./utils/http-methods.js"
import { OpenAPISpecLoader } from "./openapi-loader.js"
import { OpenAPIV3 } from "openapi-types"

/**
 * Client for making API calls to the backend service
 */
export class ApiClient {
  private axiosInstance: AxiosInstance
  private toolsMap: Map<string, Tool> = new Map()
  private authProvider: AuthProvider
  private specLoader?: OpenAPISpecLoader
  private openApiSpec?: OpenAPIV3.Document

  /**
   * Create a new API client
   *
   * @param baseUrl - Base URL for the API
   * @param authProviderOrHeaders - AuthProvider instance or static headers for backward compatibility
   * @param specLoader - Optional OpenAPI spec loader for dynamic meta-tools
   */
  constructor(
    baseUrl: string,
    authProviderOrHeaders?: AuthProvider | Record<string, string>,
    specLoader?: OpenAPISpecLoader,
  ) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    })

    // Handle backward compatibility
    if (!authProviderOrHeaders) {
      this.authProvider = new StaticAuthProvider()
    } else if (
      typeof authProviderOrHeaders === "object" &&
      !("getAuthHeaders" in authProviderOrHeaders)
    ) {
      // It's a headers object (backward compatibility)
      this.authProvider = new StaticAuthProvider(authProviderOrHeaders)
    } else {
      // It's an AuthProvider
      this.authProvider = authProviderOrHeaders as AuthProvider
    }

    this.specLoader = specLoader
  }

  /**
   * Set the available tools for the client
   *
   * @param tools - Map of tool ID to tool definition
   */
  setTools(tools: Map<string, Tool>): void {
    this.toolsMap = tools
  }

  /**
   * Set the OpenAPI specification for dynamic meta-tools
   *
   * @param spec - The OpenAPI specification document
   */
  setOpenApiSpec(spec: OpenAPIV3.Document): void {
    this.openApiSpec = spec
  }

  /**
   * Get a tool definition by ID
   *
   * @param toolId - The tool ID
   * @returns The tool definition if found
   */
  private getToolDefinition(toolId: string): Tool | undefined {
    return this.toolsMap.get(toolId)
  }

  /**
   * Execute an API call based on the tool ID and parameters
   *
   * @param toolId - The tool ID in format METHOD-path-parts
   * @param params - Parameters for the API call
   * @returns The API response data
   */
  async executeApiCall(toolId: string, params: Record<string, any>): Promise<any> {
    return this.executeApiCallWithRetry(toolId, params, false)
  }

  /**
   * Execute an API call with optional retry on auth error
   *
   * @param toolId - The tool ID in format METHOD-path-parts
   * @param params - Parameters for the API call
   * @param isRetry - Whether this is a retry attempt
   * @returns The API response data
   */
  private async executeApiCallWithRetry(
    toolId: string,
    params: Record<string, any>,
    isRetry: boolean,
  ): Promise<any> {
    try {
      // Handle dynamic meta-tools that don't follow the standard HTTP method::path format
      if (toolId === "LIST-API-ENDPOINTS") {
        return await this.handleListApiEndpoints()
      }

      if (toolId === "GET-API-ENDPOINT-SCHEMA") {
        return this.handleGetApiEndpointSchema(toolId, params)
      }

      if (toolId === "INVOKE-API-ENDPOINT") {
        return this.handleInvokeApiEndpoint(toolId, params)
      }

      // Parse method and path from the tool ID
      const { method, path } = this.parseToolId(toolId)

      // Get the tool definition, if available
      const toolDef = this.getToolDefinition(toolId)

      // Interpolate path parameters into the URL and remove them from params
      const paramsCopy: Record<string, any> = { ...params }
      let resolvedPath = path

      // Helper function to escape regex special characters
      const escapeRegExp = (str: string): string => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // $& means the whole matched string
      }

      // Handle path, query, and header parameters
      const headerParams: Record<string, string> = {}
      const queryParams: Record<string, any> = {}

      if (toolDef?.inputSchema?.properties) {
        // Check each parameter to see if it's a path, query, or header parameter
        for (const [key, value] of Object.entries(paramsCopy)) {
          const paramDef = toolDef.inputSchema.properties[key]
          // Get the parameter location from the extended schema
          const paramDef_any = paramDef as any
          const paramLocation = paramDef_any?.["x-parameter-location"]

          // If it's a path parameter, interpolate it into the URL and remove from params
          if (paramLocation === "path") {
            // Escape key before using it in regex patterns
            const escapedKey = escapeRegExp(key)
            // Try standard OpenAPI, Express-style parameters, and unique markers
            const paramRegex = new RegExp(
              `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|$)`,
              "g",
            )

            // If specific parameter style was found, use it
            if (paramRegex.test(resolvedPath)) {
              resolvedPath = resolvedPath.replace(
                paramRegex,
                (match) => encodeURIComponent(value) + (match.endsWith("/") ? "/" : ""),
              )
            } else {
              // Fall back to the original simple replacement for backward compatibility
              resolvedPath = resolvedPath.replace(`/${key}`, `/${encodeURIComponent(value)}`)
            }
            delete paramsCopy[key]
          }
          // If it's a query parameter, add to query params and remove from params
          else if (paramLocation === "query") {
            queryParams[key] = value
            delete paramsCopy[key]
          }
          // If it's a header parameter, add to headers and remove from params
          else if (paramLocation === "header") {
            headerParams[key] = String(value)
            delete paramsCopy[key]
          }
        }
      } else {
        // Fallback behavior if tool definition is not available
        for (const key of Object.keys(paramsCopy)) {
          const value = paramsCopy[key]
          // Escape key before using it in regex patterns
          const escapedKey = escapeRegExp(key)
          // First try standard OpenAPI, Express-style parameters, and unique markers
          const paramRegex = new RegExp(
            `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|$)`,
            "g",
          )

          // If found, replace using regex
          if (paramRegex.test(resolvedPath)) {
            resolvedPath = resolvedPath.replace(
              paramRegex,
              (match) => encodeURIComponent(value) + (match.endsWith("/") ? "/" : ""),
            )
            delete paramsCopy[key]
          }
          // Fall back to original simple replacement for backward compatibility
          else if (resolvedPath.includes(`/${key}`)) {
            resolvedPath = resolvedPath.replace(`/${key}`, `/${encodeURIComponent(value)}`)
            delete paramsCopy[key]
          }
        }
      }

      // Get fresh authentication headers
      const authHeaders = await this.authProvider.getAuthHeaders()

      // Prepare request configuration
      const config: any = {
        method: method.toLowerCase(),
        url: resolvedPath,
        headers: { ...authHeaders, ...headerParams },
      }

      // Add query parameters if any exist
      if (Object.keys(queryParams).length > 0) {
        config.params = this.processQueryParams(queryParams)
      }

      // Handle remaining parameters (body parameters) based on HTTP method
      if (isGetLikeMethod(method)) {
        // For GET-like methods, remaining parameters also go in the query string
        if (Object.keys(paramsCopy).length > 0) {
          config.params = {
            ...config.params,
            ...this.processQueryParams(paramsCopy),
          }
        }
      } else {
        // For POST-like methods, remaining parameters go in the request body
        if (Object.keys(paramsCopy).length > 0) {
          config.data = paramsCopy
        }
      }

      // Execute the request
      const response = await this.axiosInstance(config)
      return response.data
    } catch (error) {
      // Handle errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError

        // Check if it's an authentication error and we haven't already retried
        if (!isRetry && isAuthError(axiosError)) {
          const shouldRetry = await this.authProvider.handleAuthError(axiosError)
          if (shouldRetry) {
            // Retry the request once
            return this.executeApiCallWithRetry(toolId, params, true)
          }
          // If auth handler throws, use that error instead
        }

        throw new Error(
          `API request failed: ${axiosError.message}${
            axiosError.response
              ? ` (${axiosError.response.status}: ${
                  typeof axiosError.response.data === "object"
                    ? JSON.stringify(axiosError.response.data)
                    : axiosError.response.data
                })`
              : ""
          }`,
        )
      }
      throw error
    }
  }

  /**
   * Parse a tool ID into HTTP method and path
   *
   * @param toolId - Tool ID in format METHOD::pathPart
   * @returns Object containing method and path
   */
  private parseToolId(toolId: string): { method: string; path: string } {
    return parseToolIdUtil(toolId)
  }

  /**
   * Process query parameters for GET requests
   * Converts arrays to comma-separated strings
   *
   * @param params - The original parameters
   * @returns Processed parameters
   */
  private processQueryParams(
    params: Record<string, any>,
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {}

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        result[key] = value.join(",")
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Handle the LIST-API-ENDPOINTS meta-tool
   * Returns a list of all available API endpoints from the loaded tools
   */
  private async handleListApiEndpoints(): Promise<any> {
    const endpoints: any[] = []

    // If we have the OpenAPI spec, use it to get all available endpoints
    if (this.openApiSpec) {
      for (const [path, pathItem] of Object.entries(this.openApiSpec.paths)) {
        if (!pathItem) continue

        for (const [method, operation] of Object.entries(pathItem)) {
          if (method === "parameters" || !operation) continue

          // Skip invalid HTTP methods
          if (!isValidHttpMethod(method)) {
            continue
          }

          const op = operation as any
          endpoints.push({
            method: method.toUpperCase(),
            path,
            summary: op.summary || "",
            description: op.description || "",
            operationId: op.operationId || "",
            tags: op.tags || [],
          })
        }
      }
    } else {
      // Fallback: use the current toolsMap
      for (const [toolId, tool] of this.toolsMap.entries()) {
        // Skip other meta-tools in the listing
        if (
          toolId.startsWith("LIST-API-ENDPOINTS") ||
          toolId.startsWith("GET-API-ENDPOINT-SCHEMA") ||
          toolId.startsWith("INVOKE-API-ENDPOINT")
        ) {
          continue
        }

        try {
          const { method, path } = this.parseToolId(toolId)
          endpoints.push({
            toolId,
            name: tool.name,
            description: tool.description,
            method: method.toUpperCase(),
            path,
          })
        } catch (error) {
          // Skip tools that don't follow the standard format
          continue
        }
      }
    }

    return {
      endpoints,
      total: endpoints.length,
      note: this.openApiSpec
        ? "Use INVOKE-API-ENDPOINT to call specific endpoints with the path parameter"
        : "Limited endpoint information - OpenAPI spec not available",
    }
  }

  /**
   * Handle the GET-API-ENDPOINT-SCHEMA meta-tool
   * Returns the JSON schema for a specified API endpoint
   */
  private handleGetApiEndpointSchema(toolId: string, params: Record<string, any>): any {
    const { endpoint } = params

    if (!endpoint) {
      throw new Error(`Missing required parameter 'endpoint' for tool '${toolId}'`)
    }

    // If we have the OpenAPI spec, use it to get detailed schema information
    if (this.openApiSpec) {
      const pathItem = this.openApiSpec.paths[endpoint]
      if (!pathItem) {
        throw new Error(`No endpoint found for path '${endpoint}' in tool '${toolId}'`)
      }

      const operations: any[] = []
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue

        // Skip invalid HTTP methods
        if (!isValidHttpMethod(method)) {
          continue
        }

        const op = operation as any
        operations.push({
          method: method.toUpperCase(),
          operationId: op.operationId || "",
          summary: op.summary || "",
          description: op.description || "",
          parameters: op.parameters || [],
          requestBody: op.requestBody || null,
          responses: op.responses || {},
          tags: op.tags || [],
        })
      }

      if (operations.length === 0) {
        throw new Error(`No valid HTTP operations found for path '${endpoint}' in tool '${toolId}'`)
      }

      return {
        path: endpoint,
        operations,
        pathParameters: pathItem.parameters || [],
      }
    } else {
      // Fallback: find the tool that matches the requested endpoint path
      let matchingTool: Tool | undefined
      let matchingToolId: string | undefined

      for (const [toolId, tool] of this.toolsMap.entries()) {
        try {
          const { path } = this.parseToolId(toolId)
          if (path === endpoint) {
            matchingTool = tool
            matchingToolId = toolId
            break
          }
        } catch (error) {
          // Skip tools that don't follow the standard format
          continue
        }
      }

      if (!matchingTool || !matchingToolId) {
        throw new Error(`No endpoint found for path: ${endpoint}`)
      }

      return {
        toolId: matchingToolId,
        name: matchingTool.name,
        description: matchingTool.description,
        inputSchema: matchingTool.inputSchema,
        note: "Limited schema information - using tool definition instead of OpenAPI spec",
      }
    }
  }

  /**
   * Handle the INVOKE-API-ENDPOINT meta-tool
   * Dynamically invokes an API endpoint with the provided parameters
   */
  private async handleInvokeApiEndpoint(toolId: string, params: Record<string, any>): Promise<any> {
    const { endpoint, method, params: endpointParams = {} } = params

    if (!endpoint) {
      throw new Error(`Missing required parameter 'endpoint' for tool '${toolId}'`)
    }

    // If method is specified, construct the tool ID directly
    if (method) {
      const toolId = generateToolId(method, endpoint)

      // Check if this tool exists in our toolsMap or if we can derive it from the OpenAPI spec
      if (this.toolsMap.has(toolId)) {
        return this.executeApiCall(toolId, endpointParams)
      } else if (this.openApiSpec) {
        // Check if the endpoint and method exist in the OpenAPI spec
        const pathItem = this.openApiSpec.paths[endpoint]
        if (pathItem && (pathItem as any)[method.toLowerCase()]) {
          // Make the HTTP request directly since we have the spec but not the tool
          const { method: httpMethod, path } = { method: method.toUpperCase(), path: endpoint }
          return this.makeDirectHttpRequest(httpMethod, path, endpointParams)
        } else {
          throw new Error(
            `No endpoint found for path '${endpoint}' with method '${method}' in tool '${toolId}'`,
          )
        }
      } else {
        throw new Error(`Tool not found: ${toolId}`)
      }
    }

    // If no method is specified, try to find the first available method for this endpoint
    if (this.openApiSpec) {
      const pathItem = this.openApiSpec.paths[endpoint]
      if (pathItem) {
        // Find the first available HTTP method for this path
        for (const method of VALID_HTTP_METHODS) {
          if ((pathItem as any)[method]) {
            return this.makeDirectHttpRequest(method.toUpperCase(), endpoint, endpointParams)
          }
        }
        throw new Error(`No HTTP operations found for endpoint '${endpoint}' in tool '${toolId}'`)
      } else {
        throw new Error(`No endpoint found for path '${endpoint}' in tool '${toolId}'`)
      }
    }

    // Fallback: try to find a tool that matches this endpoint path
    throw new Error(`No endpoint found for path '${endpoint}' in tool '${toolId}'`)
  }

  /**
   * Make a direct HTTP request without going through the tool system
   * Used by dynamic meta-tools when we have OpenAPI spec but no corresponding tool
   */
  private async makeDirectHttpRequest(
    method: string,
    path: string,
    params: Record<string, any>,
  ): Promise<any> {
    // Get fresh authentication headers
    const authHeaders = await this.authProvider.getAuthHeaders()

    // Prepare request configuration
    const config: any = {
      method: method.toLowerCase(),
      url: path,
      headers: authHeaders,
    }

    // Handle parameters based on HTTP method
    if (isGetLikeMethod(method)) {
      // For GET-like methods, parameters go in the query string
      config.params = this.processQueryParams(params)
    } else {
      // For POST-like methods, parameters go in the request body
      config.data = params
    }

    try {
      // Execute the request
      const response = await this.axiosInstance.request(config)
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError
        throw new Error(
          `API request failed: ${axiosError.message}${
            axiosError.response
              ? ` (${axiosError.response.status}: ${
                  typeof axiosError.response.data === "object"
                    ? JSON.stringify(axiosError.response.data)
                    : axiosError.response.data
                })`
              : ""
          }`,
        )
      }
      throw error
    }
  }
}
