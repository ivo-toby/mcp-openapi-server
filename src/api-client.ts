import axios, { AxiosInstance, AxiosError } from "axios"
import { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { Agent as HttpsAgent } from "node:https"
import { AuthProvider, StaticAuthProvider, isAuthError } from "./auth-provider.js"
import { parseToolId as parseToolIdUtil, generateToolId } from "./utils/tool-id.js"
import { isValidHttpMethod, isGetLikeMethod, VALID_HTTP_METHODS } from "./utils/http-methods.js"
import { OpenAPISpecLoader } from "./openapi-loader.js"
import { OpenAPIV3 } from "openapi-types"
import {
  BinaryResponse,
  binaryRequestContentType,
  decodeBase64Body,
  decodeResponseBody,
  isBinaryRequestBody,
} from "./utils/media-types.js"

/**
 * How the `body` tool argument maps onto the HTTP request body (set by OpenAPISpecLoader)
 * - "binary": `body` is base64 and is sent as raw bytes
 * - "wrapped": `body` is the whole (non-object) request body, not a property of it
 */
type BodyEncoding = "binary" | "wrapped" | undefined

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

  private getRequestBodyInfo(
    method: string,
    path: string,
  ): { contentType: string; schema?: OpenAPIV3.SchemaObject } | undefined {
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

    const contentType = content["application/json"] ? "application/json" : Object.keys(content)[0]
    if (!contentType) {
      return undefined
    }

    let schema = content[contentType]?.schema
    if (schema && "$ref" in schema) {
      const refPrefix = "#/components/schemas/"
      const resolved = schema.$ref.startsWith(refPrefix)
        ? this.openApiSpec?.components?.schemas?.[schema.$ref.slice(refPrefix.length)]
        : undefined
      schema = resolved && !("$ref" in resolved) ? resolved : undefined
    }

    return { contentType, schema: schema as OpenAPIV3.SchemaObject | undefined }
  }

  /**
   * How a dynamic-mode caller must pass the request body of an operation (see {@link BodyEncoding}).
   */
  private getSpecBodyEncoding(
    bodyInfo: { contentType: string; schema?: OpenAPIV3.SchemaObject } | undefined,
  ): BodyEncoding {
    if (!bodyInfo) {
      return undefined
    }
    if (isBinaryRequestBody(bodyInfo.contentType, bodyInfo.schema)) {
      return "binary"
    }
    const schemaType = bodyInfo.schema?.type
    if (schemaType && schemaType !== "object") {
      return "wrapped"
    }
    return undefined
  }

  /**
   * Build a binary request body (Issue #105): the payload is passed base64-encoded in the
   * wrapper argument and sent as raw bytes with the declared Content-Type.
   *
   * @param params - Tool arguments left over after path/query/header extraction
   * @param wrapperKey - Name of the argument that carries the base64 payload
   * @param contentType - Content-Type declared by the OpenAPI spec (if any)
   */
  private buildBinaryRequestBody(
    params: Record<string, any>,
    wrapperKey: string,
    contentType: string | undefined,
  ): { data: Buffer | undefined; contentType: string } {
    const hasBody = Object.prototype.hasOwnProperty.call(params, wrapperKey)
    if (!hasBody && Object.keys(params).length > 0) {
      throw new Error(
        `This endpoint expects a binary request body: pass it base64-encoded in the "${wrapperKey}" ` +
          `parameter (got: ${Object.keys(params).join(", ")})`,
      )
    }
    return {
      data:
        hasBody && params[wrapperKey] !== undefined
          ? decodeBase64Body(params[wrapperKey], wrapperKey)
          : undefined,
      contentType: binaryRequestContentType(contentType),
    }
  }

  /**
   * Execute a request, reading the body as raw bytes and decoding it by Content-Type.
   * Binary payloads are returned as {@link BinaryResponse} instead of a corrupted string.
   */
  private async sendRequest(config: Record<string, any>, useRequestMethod: boolean): Promise<any> {
    config.responseType = "arraybuffer"
    const response = useRequestMethod
      ? await this.axiosInstance.request(config)
      : await this.axiosInstance(config)
    return decodeResponseBody(
      response.data,
      this.getHeader(response.headers, "content-type"),
      this.getResponseUri(config),
    )
  }

  private getHeader(headers: unknown, name: string): unknown {
    if (!headers || typeof headers !== "object") {
      return undefined
    }
    const getter = (headers as { get?: unknown }).get
    if (typeof getter === "function") {
      const value = getter.call(headers, name)
      if (value !== undefined && value !== null) {
        return value
      }
    }
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
    return entry?.[1]
  }

  /**
   * URI identifying a binary response for MCP embedded resources.
   * Uses only the request path: the upstream host, credentials in the base URL
   * and query string are never exposed to the MCP client.
   */
  private getResponseUri(config: Record<string, any>): string | undefined {
    let fullUrl: string | undefined
    try {
      if (typeof (this.axiosInstance as any).getUri === "function") {
        fullUrl = this.axiosInstance.getUri(config)
      }
    } catch {
      // Fall back to the relative URL below
    }
    fullUrl ??= typeof config.url === "string" ? config.url : undefined
    if (!fullUrl) {
      return undefined
    }
    try {
      return `api-response://${new URL(fullUrl, "http://placeholder/").pathname}`
    } catch {
      return undefined
    }
  }

  /**
   * Error responses are also read as raw bytes; decode them so error messages and
   * AuthProvider.handleAuthError() see text/JSON rather than a Buffer.
   */
  private decodeErrorResponse(error: AxiosError): void {
    if (!error.response) {
      return
    }
    const decoded = decodeResponseBody(
      error.response.data,
      this.getHeader(error.response.headers, "content-type"),
    )
    error.response.data =
      decoded instanceof BinaryResponse
        ? `[binary response: ${decoded.mimeType}, ${decoded.size} bytes]`
        : decoded
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
        const inputSchema = toolDef?.inputSchema as Record<string, any> | undefined

        if (inputSchema?.["x-body-encoding"] === "binary") {
          // Issue #105: base64 argument → raw bytes
          const { data, contentType } = this.buildBinaryRequestBody(
            paramsCopy,
            inputSchema["x-body-wrapper"] || "body",
            inputSchema["x-content-type"],
          )
          config.headers["Content-Type"] = contentType
          if (data !== undefined) {
            config.data = data
          }
        } else {
          // Set Content-Type from OpenAPI spec metadata, defaulting to application/json
          const contentType = inputSchema?.["x-content-type"] || "application/json"
          config.headers["Content-Type"] = contentType

          config.data = this.buildRequestBody(inputSchema, paramsCopy, contentType)
        }
      }

      // Execute the request
      return await this.sendRequest(config, false)
    } catch (error) {
      // Handle errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError
        this.decodeErrorResponse(axiosError)

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
   * Build the request body from the remaining (non path/query/header) arguments,
   * reversing the renames applied when the tool input schema was generated (Issue #102):
   * - a non-object body exposed as a `body` wrapper property is sent as the bare value
   * - body properties prefixed with `body_` due to a name collision get their original name
   *
   * @param inputSchema - The tool's input schema (may carry x-body-* metadata)
   * @param params - Remaining arguments after extracting path/query/header parameters
   * @returns The request body to send
   */
  private buildRequestBody(
    inputSchema: Record<string, any> | undefined,
    params: Record<string, any>,
    contentType: string,
  ): any {
    const wrapperKey = inputSchema?.["x-body-wrapper"]
    if (
      typeof wrapperKey === "string" &&
      Object.prototype.hasOwnProperty.call(params, wrapperKey) &&
      params[wrapperKey] !== undefined
    ) {
      const value = params[wrapperKey]
      // Serialize bare values explicitly. axios only JSON-encodes non-objects for a literal
      // "application/json" content type: it sends JSON-parseable strings (e.g. "123") unquoted,
      // and throws on numbers/booleans for other types (e.g. application/vnd.api+json, text/plain).
      if (/\bjson\b/i.test(contentType)) {
        return JSON.stringify(value)
      }
      if (value === null || typeof value !== "object") {
        return String(value)
      }
      return value
    }

    const propertyMap = inputSchema?.["x-body-property-map"] as Record<string, string> | undefined
    if (propertyMap && typeof propertyMap === "object") {
      const body: Record<string, any> = {}
      // Unmapped keys first, then renamed body fields, so a renamed field always wins over
      // a leftover argument with the same name (e.g. an unextracted cookie parameter)
      for (const [key, value] of Object.entries(params)) {
        if (!Object.prototype.hasOwnProperty.call(propertyMap, key)) {
          body[key] = value
        }
      }
      for (const [key, value] of Object.entries(params)) {
        if (Object.prototype.hasOwnProperty.call(propertyMap, key)) {
          body[propertyMap[key]] = value
        }
      }
      return body
    }

    return Object.keys(params).length > 0 ? params : {}
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
        if (this.operationHasExcludedTag(operation)) {
          continue
        }

        const operationInfo: Record<string, any> = {
          method: method.toUpperCase(),
          operationId: op.operationId || "",
          summary: op.summary || "",
          description: op.description || "",
          parameters: op.parameters || [],
          requestBody: op.requestBody || null,
          responses: op.responses || {},
          tags: op.tags || [],
        }

        // Tell callers how to pass non-object bodies through INVOKE-API-ENDPOINT
        const bodyEncoding = this.getSpecBodyEncoding(this.getRequestBodyInfo(method, endpoint))
        if (bodyEncoding === "binary") {
          operationInfo.bodyParameter = {
            name: "body",
            encoding: "base64",
            note: 'Pass the request body base64-encoded as params.body; it is sent as raw bytes.',
          }
        } else if (bodyEncoding === "wrapped") {
          operationInfo.bodyParameter = {
            name: "body",
            note: "Pass the whole (non-object) request body as params.body.",
          }
        }

        operations.push(operationInfo)
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
        const operation = pathItem ? (pathItem as any)[method.toLowerCase()] : undefined
        if (pathItem && operation) {
          if (this.operationHasExcludedTag(operation)) {
            throw new Error(
              `Endpoint '${endpoint}' with method '${method.toUpperCase()}' is excluded by tag filter`,
            )
          }

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
          const operation = (pathItem as any)[method]
          if (operation && !this.operationHasExcludedTag(operation)) {
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
      headers: { ...authHeaders },
    }

    // Handle parameters based on HTTP method
    if (isGetLikeMethod(method)) {
      // For GET-like methods, parameters go in the query string
      config.params = this.processQueryParams(params)
    } else {
      // For POST-like methods, parameters go in the request body
      const bodyInfo = this.getRequestBodyInfo(method, path)
      let encoding = this.getSpecBodyEncoding(bodyInfo)
      if (
        encoding === "wrapped" &&
        !(Object.keys(params).length === 1 && Object.prototype.hasOwnProperty.call(params, "body"))
      ) {
        // Only unwrap when the caller passed the non-object body as { body: ... }
        encoding = undefined
      }

      if (encoding === "binary") {
        const { data, contentType } = this.buildBinaryRequestBody(
          params,
          "body",
          bodyInfo?.contentType,
        )
        if (data !== undefined) {
          config.data = data
        }
        config.headers["Content-Type"] = contentType
      } else if (encoding === "wrapped") {
        const contentType = bodyInfo?.contentType || "application/json"
        config.data = this.buildRequestBody({ "x-body-wrapper": "body" }, params, contentType)
        config.headers["Content-Type"] = contentType
      } else {
        config.data = params
        config.headers["Content-Type"] = bodyInfo?.contentType || "application/json"
      }
    }

    try {
      // Execute the request
      return await this.sendRequest(config, true)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError
        this.decodeErrorResponse(axiosError)
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

export interface ApiClientOptions {
  excludeTags?: string[]
  httpsAgent?: HttpsAgent
}
