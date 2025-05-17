import axios, { AxiosInstance, AxiosError } from "axios"

/**
 * Client for making API calls to the backend service
 */
export class ApiClient {
  private axiosInstance: AxiosInstance

  /**
   * Create a new API client
   *
   * @param baseUrl - Base URL for the API
   * @param headers - Optional headers to include with every request
   */
  constructor(
    baseUrl: string,
    private headers: Record<string, string> = {},
  ) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    })
  }

  /**
   * Execute an API call based on the tool ID and parameters
   *
   * @param toolId - The tool ID in format METHOD-path-parts
   * @param params - Parameters for the API call
   * @returns The API response data
   */
  async executeApiCall(toolId: string, params: Record<string, any>): Promise<any> {
    try {
      // Parse method and path from the tool ID
      const { method, path } = this.parseToolId(toolId)

      // Prepare request configuration
      const config: any = {
        method: method.toLowerCase(),
        url: path,
        headers: this.headers,
      }

      // Handle parameters based on HTTP method
      if (["get", "delete", "head", "options"].includes(method.toLowerCase())) {
        // For GET-like methods, parameters go in the query string
        config.params = this.processQueryParams(params)
      } else {
        // For POST-like methods, parameters go in the request body
        config.data = params
      }

      // Execute the request
      const response = await this.axiosInstance(config)
      return response.data
    } catch (error) {
      // Handle errors
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

  /**
   * Parse a tool ID into HTTP method and path
   *
   * @param toolId - Tool ID in format METHOD-path-parts
   * @returns Object containing method and path
   */
  private parseToolId(toolId: string): { method: string; path: string } {
    const [method, ...pathParts] = toolId.split("-")
    const path = "/" + pathParts.join("/").replace(/-/g, "/")
    return { method, path }
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
}
