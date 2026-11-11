import axios, { AxiosInstance, AxiosError } from "axios"
import { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { Agent as HttpsAgent } from "node:https"
import { AuthProvider, StaticAuthProvider, isAuthError } from "./auth-provider.js"
import { parseToolId as parseToolIdUtil, generateToolId } from "./utils/tool-id.js"
import { isValidHttpMethod, isGetLikeMethod, VALID_HTTP_METHODS } from "./utils/http-methods.js"
import { OpenAPISpecLoader } from "./openapi-loader.js"
import { OpenAPIV3 } from "openapi-types"

/**
 * System-controlled HTTP headers that should NEVER be set via user parameters
 * These headers are managed by the HTTP client/server and allowing user control
 * could break HTTP protocol semantics or create security issues
 */
const SYSTEM_CONTROLLED_HEADERS = new Set([
  "host", // Controlled by HTTP client based on URL
  "content-type", // Set automatically based on OpenAPI spec or defaults
  "content-length", // Calculated by HTTP client from body
  "transfer-encoding", // Managed by HTTP client for chunked encoding
  "connection", // HTTP connection management
  "upgrade", // Protocol upgrade (WebSocket, HTTP/2)
  "te", // Transfer encoding preferences
  "trailer", // Trailer fields in chunked transfer
  "proxy-connection", // Proxy connection management
  "keep-alive", // Connection keep-alive settings
])

/**
 * Reject resolved request paths containing dot segments (`.` / `..`).
 * HTTP clients normalise these away, which would send the request to a different
 * endpoint than the one that was matched (and e.g. tag-filtered).
 */
function assertNoDotSegments(path: string): void {
  const hasDotSegment = path.split("/").some((segment) => {
    let decoded = segment
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      // keep raw segment
    }
    return decoded === "." || decoded === ".."
  })
  if (hasDotSegment) {
    throw new Error(
      `Invalid request path '${path}': path parameters must not resolve to '.' or '..' segments`,
    )
  }
}

/**
 * Split an endpoint supplied to a dynamic meta-tool into its path and query parameters.
 * A fragment (`#...`) is dropped.
 */
function splitEndpoint(endpoint: string): { path: string; query: Record<string, any> } {
  const withoutFragment = endpoint.split("#", 1)[0]
  const queryIndex = withoutFragment.indexOf("?")
  if (queryIndex === -1) {
    return { path: withoutFragment, query: {} }
  }

  const query: Record<string, any> = {}
  for (const [key, value] of new URLSearchParams(withoutFragment.slice(queryIndex + 1))) {
    if (key in query) {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value]
    } else {
      query[key] = value
    }
  }
  return { path: withoutFragment.slice(0, queryIndex), query }
}

/**
 * Client for making API calls to the backend service
 */
export class ApiClient {
  private axiosInstance: AxiosInstance
  private toolsMap: Map<string, Tool> = new Map()
  private authProvider: AuthProvider
  private specLoader?: OpenAPISpecLoader
  private openApiSpec?: OpenAPIV3.Document
  private excludeTagsLower: string[]

  /**
   * Create a new API client
   *
   * @param baseUrl - Base URL for the API
   * @param authProviderOrHeaders - AuthProvider instance or static headers for backward compatibility
   * @param specLoader - Optional OpenAPI spec loader for dynamic meta-tools
   * @param options - Optional HTTP client configuration
   */
  constructor(
    baseUrl: string,
    authProviderOrHeaders?: AuthProvider | Record<string, string>,
    specLoader?: OpenAPISpecLoader,
    options?: ApiClientOptions,
  ) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
      timeout: 30000, // 30 second timeout to prevent indefinite hangs
      maxContentLength: 50 * 1024 * 1024, // 50MB response body limit
      maxBodyLength: 50 * 1024 * 1024, // 50MB request body limit
      maxRedirects: 5, // Limit redirect chains to prevent abuse
      httpsAgent: options?.httpsAgent,
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
    this.excludeTagsLower = options?.excludeTags?.map((tag) => tag.toLowerCase()) || []
  }

  private operationHasExcludedTag(operation: unknown): boolean {
    if (
      this.excludeTagsLower.length === 0 ||
      !operation ||
      typeof operation !== "object" ||
      "$ref" in operation
    ) {
      return false
    }

    const tags = Array.isArray((operation as { tags?: unknown }).tags)
      ? (operation as { tags: unknown[] }).tags
      : []
    return tags.some(
      (tag) => typeof tag === "string" && this.excludeTagsLower.includes(tag.toLowerCase()),
    )
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

  private resolveRequestBodyObject(
    requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined,
  ): OpenAPIV3.RequestBodyObject | undefined {
    if (!requestBody || !("$ref" in requestBody)) {
      return requestBody
    }

    const refPrefix = "#/components/requestBodies/"
    if (!requestBody.$ref.startsWith(refPrefix)) {
      return undefined
    }

    const requestBodyName = requestBody.$ref.slice(refPrefix.length)
    const resolvedRequestBody = this.openApiSpec?.components?.requestBodies?.[requestBodyName]

    if (!resolvedRequestBody || "$ref" in resolvedRequestBody) {
      return undefined
    }

    return resolvedRequestBody
  }

  /**
   * Check whether a path item has a (valid HTTP) operation, optionally for a specific method
   */
  private pathItemHasOperation(pathItem: OpenAPIV3.PathItemObject, method?: string): boolean {
    if (method) {
      const normalizedMethod = method.toLowerCase()
      return isValidHttpMethod(normalizedMethod) && !!(pathItem as any)[normalizedMethod]
    }
    return VALID_HTTP_METHODS.some((m) => !!(pathItem as any)[m])
  }

  /**
   * Resolve an endpoint supplied to a dynamic meta-tool to a path in the OpenAPI spec.
   *
   * Accepts either a spec path template (`/users/{id}`) or a concrete path
   * (`/users/123`). Concrete paths are matched against the spec's path templates and the
   * path parameter values are extracted. Literal paths win over templates, and among
   * templates the most specific one (fewest parameters, most literal characters) wins.
   *
   * @param endpoint - The endpoint path supplied by the caller
   * @param method - Optional HTTP method the resolved path must support
   * Segments of the endpoint that are themselves placeholders (e.g. a partially filled
   * `/users/123/posts/{postId}`) are not treated as values; they are reported in
   * `placeholderNames` (template name -> name used by the caller) so the value can be
   * taken from the caller's params.
   *
   * @returns The matched spec path, its path item and the extracted path parameters
   */
  private resolveEndpoint(endpoint: string, method?: string): ResolvedEndpoint | undefined {
    const paths = this.openApiSpec?.paths
    if (!paths) {
      return undefined
    }

    const normalize = (p: string): string => {
      const withLeadingSlash = p.startsWith("/") ? p : `/${p}`
      return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") || "/" : "/"
    }
    const concrete = normalize(endpoint)

    const exactPath = paths[endpoint] ? endpoint : paths[concrete] ? concrete : undefined
    const exact = exactPath ? paths[exactPath] : undefined
    if (exactPath && exact && this.pathItemHasOperation(exact, method)) {
      return { path: exactPath, pathItem: exact, pathParams: {}, placeholderNames: {} }
    }

    const candidates: Array<
      ResolvedEndpoint & {
        paramCount: number
        literalLength: number
      }
    > = []

    for (const [templatePath, pathItem] of Object.entries(paths)) {
      if (!pathItem || !templatePath.includes("{")) continue
      if (!this.pathItemHasOperation(pathItem, method)) continue

      const template = normalize(templatePath)
      const paramNames: string[] = []
      const pattern = template
        .split(/(\{[^}/]+\})/)
        .map((part) => {
          const paramMatch = /^\{([^}/]+)\}$/.exec(part)
          if (paramMatch) {
            paramNames.push(paramMatch[1])
            return "([^/]+)"
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        })
        .join("")

      const match = new RegExp(`^${pattern}$`).exec(concrete)
      if (!match) continue

      const pathParams: Record<string, string> = {}
      const placeholderNames: Record<string, string> = {}
      paramNames.forEach((name, index) => {
        const raw = match[index + 1]
        const placeholder = /^\{([^{}/]+)\}$/.exec(raw)
        if (placeholder) {
          placeholderNames[name] = placeholder[1]
          return
        }
        try {
          pathParams[name] = decodeURIComponent(raw)
        } catch {
          pathParams[name] = raw
        }
      })

      candidates.push({
        path: templatePath,
        pathItem,
        pathParams,
        placeholderNames,
        paramCount: paramNames.length,
        literalLength: template.replace(/\{[^}/]+\}/g, "").length,
      })
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.paramCount - b.paramCount || b.literalLength - a.literalLength)
      const { path, pathItem, pathParams, placeholderNames } = candidates[0]
      return { path, pathItem, pathParams, placeholderNames }
    }

    // Keep the literal path (even without the requested method) so callers can
    // report a precise error
    if (exactPath && exact) {
      return { path: exactPath, pathItem: exact, pathParams: {}, placeholderNames: {} }
    }

    return undefined
  }

  /**
   * Interpolate `{param}` placeholders in a spec path template using the given params.
   * Consumed params are removed from the returned params object.
   */
  private interpolatePathParams(
    path: string,
    params: Record<string, any>,
  ): { url: string; remainingParams: Record<string, any> } {
    const remainingParams = { ...params }
    const url = path.replace(/\{([^}/]+)\}/g, (_placeholder, name: string) => {
      const value = remainingParams[name]
      if (value === undefined || value === null || value === "") {
        throw new Error(`Missing required path parameter '${name}' for endpoint '${path}'`)
      }
      delete remainingParams[name]
      return encodeURIComponent(String(value))
    })
    assertNoDotSegments(url)
    return { url, remainingParams }
  }

  /**
   * Build the params for a request to a resolved endpoint: query string from the
   * endpoint, then caller params, then path values extracted from a concrete endpoint.
   */
  private buildEndpointParams(
    resolved: ResolvedEndpoint,
    query: Record<string, any>,
    endpointParams: Record<string, any>,
  ): Record<string, any> {
    const merged: Record<string, any> = { ...query, ...endpointParams }

    // Map placeholders the caller left in the endpoint under a different name
    // (e.g. `/users/{user_id}` for spec `/users/{id}`) onto the spec's name
    for (const [templateName, callerName] of Object.entries(resolved.placeholderNames)) {
      if (callerName !== templateName && callerName in merged && !(templateName in merged)) {
        merged[templateName] = merged[callerName]
        delete merged[callerName]
      }
    }

    // Path values taken from a concrete endpoint take precedence over params
    return { ...merged, ...resolved.pathParams }
  }

  private getRequestContentType(method: string, path: string): string | undefined {
    const pathItem = this.openApiSpec?.paths[path]
    const normalizedMethod = method.toLowerCase()

    if (!isValidHttpMethod(normalizedMethod)) {
      return undefined
    }

    const operation = (pathItem as any)?.[normalizedMethod] as
      | OpenAPIV3.OperationObject
      | OpenAPIV3.ReferenceObject
      | undefined

    if (!operation || "$ref" in operation) {
      return undefined
    }

    const requestBody = this.resolveRequestBodyObject(operation.requestBody)
    const content = requestBody?.content

    if (!content) {
      return undefined
    }

    if (content["application/json"]) {
      return "application/json"
    }

    return Object.keys(content)[0]
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

      const originalPath =
        ((toolDef as any)?.originalPath as string | undefined) ||
        ((toolDef as any)?.["x-original-path"] as string | undefined)

      // Interpolate path parameters into the URL and remove them from params
      const paramsCopy: Record<string, any> = { ...params }
      let resolvedPath = originalPath || path

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
            const headerName = key.toLowerCase()

            // Block system-controlled headers that should never be user-controlled
            if (SYSTEM_CONTROLLED_HEADERS.has(headerName)) {
              throw new Error(
                `Cannot set system-controlled header "${key}". ` +
                  `This header is managed by the HTTP client and cannot be overridden.`,
              )
            }

            // Prevent CRLF injection
            const headerValue = String(value)
            if (headerValue.includes("\r") || headerValue.includes("\n")) {
              throw new Error(`Header value for "${key}" contains invalid characters (CR/LF)`)
            }

            headerParams[key] = headerValue
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

      assertNoDotSegments(resolvedPath)

      // Get fresh authentication headers
      const authHeaders = await this.authProvider.getAuthHeaders()

      // Verify no header params conflict with auth headers
      // Only check if auth headers are actually set (non-empty)
      if (authHeaders && Object.keys(authHeaders).length > 0) {
        const authHeadersLower = Object.keys(authHeaders).map((k) => k.toLowerCase())
        for (const headerKey of Object.keys(headerParams)) {
          if (authHeadersLower.includes(headerKey.toLowerCase())) {
            throw new Error(
              `Cannot override authentication header "${headerKey}". ` +
                `This header is set by the authentication provider.`,
            )
          }
        }
      }

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
        config.data = Object.keys(paramsCopy).length > 0 ? paramsCopy : {}

        // Set Content-Type from OpenAPI spec metadata, defaulting to application/json
        const contentType = (toolDef?.inputSchema as any)?.["x-content-type"] || "application/json"
        config.headers["Content-Type"] = contentType
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
              ? ` (${axiosError.response.status}: ${this.sanitizeErrorData(
                  axiosError.response.data,
                  axiosError.response.status,
                )})`
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
   * Sanitize error data to prevent information disclosure
   * Redacts sensitive data from authentication errors and truncates large responses
   *
   * @param data - The error response data
   * @param statusCode - The HTTP status code
   * @returns Sanitized error data string
   */
  private sanitizeErrorData(data: any, statusCode: number): string {
    // Don't expose auth error details - they may contain sensitive information
    if (statusCode === 401 || statusCode === 403) {
      return "[Authentication/Authorization error - details redacted for security]"
    }

    const dataStr = typeof data === "object" ? JSON.stringify(data) : String(data)

    // Truncate large responses to prevent log flooding and memory issues
    const MAX_ERROR_LENGTH = 1000
    if (dataStr.length > MAX_ERROR_LENGTH) {
      return dataStr.substring(0, MAX_ERROR_LENGTH) + "... [truncated]"
    }

    return dataStr
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
          if (this.operationHasExcludedTag(operation)) {
            continue
          }

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
      const resolved = this.resolveEndpoint(splitEndpoint(endpoint).path)
      if (!resolved) {
        throw new Error(`No endpoint found for path '${endpoint}' in tool '${toolId}'`)
      }
      const { path: resolvedPath, pathItem } = resolved

      const operations: any[] = []
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue

        // Skip invalid HTTP methods
        if (!isValidHttpMethod(method)) {
          continue
        }

        const op = operation as any
        if (this.operationHasExcludedTag(operation)) {
          continue
        }

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
        path: resolvedPath,
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

    // Accept a query string on the endpoint (e.g. /users/123?verbose=true); explicit
    // params win over it
    const { path: endpointPath, query } = splitEndpoint(String(endpoint))

    // If method is specified, construct the tool ID directly
    if (method) {
      if (typeof method !== "string" || !isValidHttpMethod(method)) {
        throw new Error(`Invalid HTTP method '${method}' for tool '${toolId}'`)
      }

      const directToolId = generateToolId(method, endpointPath)
      if (this.toolsMap.has(directToolId)) {
        return this.executeApiCall(directToolId, { ...query, ...endpointParams })
      }

      // Resolve the endpoint against the spec; accepts templates (/users/{id}) and
      // concrete paths (/users/123)
      const resolved = this.resolveEndpoint(endpointPath, method)
      const operation = resolved ? (resolved.pathItem as any)[method.toLowerCase()] : undefined

      if (resolved && operation) {
        const mergedParams = this.buildEndpointParams(resolved, query, endpointParams)

        const resolvedToolId = generateToolId(method, resolved.path)
        if (this.toolsMap.has(resolvedToolId)) {
          return this.executeApiCall(resolvedToolId, mergedParams)
        }

        if (this.operationHasExcludedTag(operation)) {
          throw new Error(
            `Endpoint '${endpoint}' with method '${method.toUpperCase()}' is excluded by tag filter`,
          )
        }

        // Make the HTTP request directly since we have the spec but not the tool
        return this.makeDirectHttpRequest(method.toUpperCase(), resolved.path, mergedParams)
      }

      if (this.openApiSpec) {
        throw new Error(
          `No endpoint found for path '${endpoint}' with method '${method}' in tool '${directToolId}'`,
        )
      }
      throw new Error(`Tool not found: ${directToolId}`)
    }

    // If no method is specified, try to find the first available method for this endpoint
    if (this.openApiSpec) {
      const resolved = this.resolveEndpoint(endpointPath)
      if (resolved) {
        const mergedParams = this.buildEndpointParams(resolved, query, endpointParams)
        // Find the first available HTTP method for this path
        for (const method of VALID_HTTP_METHODS) {
          const operation = (resolved.pathItem as any)[method]
          if (operation && !this.operationHasExcludedTag(operation)) {
            return this.makeDirectHttpRequest(method.toUpperCase(), resolved.path, mergedParams)
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
   *
   * @param method - HTTP method
   * @param path - Spec path template; `{param}` placeholders are filled from params
   * @param params - Request parameters; path parameters are consumed, the rest go to
   *   the query string (GET-like) or request body
   */
  private async makeDirectHttpRequest(
    method: string,
    path: string,
    allParams: Record<string, any>,
  ): Promise<any> {
    const { url, remainingParams: params } = this.interpolatePathParams(path, allParams)

    // Get fresh authentication headers
    const authHeaders = await this.authProvider.getAuthHeaders()

    // Prepare request configuration
    const config: any = {
      method: method.toLowerCase(),
      url,
      headers: { ...authHeaders },
    }

    // Handle parameters based on HTTP method
    if (isGetLikeMethod(method)) {
      // For GET-like methods, parameters go in the query string
      config.params = this.processQueryParams(params)
    } else {
      // For POST-like methods, parameters go in the request body
      config.data = params
      config.headers["Content-Type"] =
        this.getRequestContentType(method, path) || "application/json"
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
              ? ` (${axiosError.response.status}: ${this.sanitizeErrorData(
                  axiosError.response.data,
                  axiosError.response.status,
                )})`
              : ""
          }`,
        )
      }
      throw error
    }
  }
}

interface ResolvedEndpoint {
  path: string
  pathItem: OpenAPIV3.PathItemObject
  pathParams: Record<string, string>
  placeholderNames: Record<string, string>
}

export interface ApiClientOptions {
  excludeTags?: string[]
  httpsAgent?: HttpsAgent
}
