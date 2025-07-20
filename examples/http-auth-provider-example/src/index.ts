#!/usr/bin/env node

import { OpenAPIServer, AuthProvider, StreamableHttpServerTransport } from "@ivotoby/openapi-mcp-server"
import { AxiosError } from "axios"

/**
 * Example AuthProvider for APIs with token expiration
 * This demonstrates how to handle dynamic authentication with HTTP transport
 */
class ExampleAuthProvider implements AuthProvider {
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null
  private apiName: string

  constructor(apiName: string = "ExampleAPI") {
    this.apiName = apiName
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    // Check if token is still valid
    if (!this.accessToken || this.isTokenExpired()) {
      throw new Error(
        `${this.apiName} token expired or not set. Please provide a valid token using updateToken() method.`
      )
    }

    return {
      Authorization: `Bearer ${this.accessToken}`,
      "X-API-Client": "MCP-OpenAPI-Server",
    }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    // Check if this is an authentication error
    if (error.response?.status === 401 || error.response?.status === 403) {
      // For this example, we don't auto-refresh, but provide clear instructions
      throw new Error(
        `${this.apiName} authentication failed. Please update your token:\n` +
          "1. Get a new access token from your API provider\n" +
          "2. Update the token using the updateToken() method\n" +
          "3. Try your request again"
      )
    }

    // Not an auth error, don't retry
    return false
  }

  /**
   * Update the access token
   * @param token - The new access token
   * @param expiresIn - Token expiry time in seconds (default: 1 hour)
   */
  updateToken(token: string, expiresIn: number = 3600): void {
    this.accessToken = token
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
    console.error(`✅ ${this.apiName} token updated successfully. Expires in ${expiresIn} seconds.`)
  }

  /**
   * Get current token status
   */
  getTokenStatus(): { hasToken: boolean; isExpired: boolean; expiresAt?: Date } {
    return {
      hasToken: !!this.accessToken,
      isExpired: this.isTokenExpired(),
      expiresAt: this.tokenExpiry || undefined,
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true
    // Add 60 second buffer
    return this.tokenExpiry <= new Date(Date.now() + 60000)
  }
}

/**
 * Advanced AuthProvider that automatically refreshes tokens
 */
class RefreshableHttpAuthProvider implements AuthProvider {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private tokenExpiry: Date | null = null
  private refreshUrl: string

  constructor(refreshUrl: string, initialAccessToken?: string, initialRefreshToken?: string) {
    this.refreshUrl = refreshUrl
    this.accessToken = initialAccessToken || null
    this.refreshToken = initialRefreshToken || null
    
    if (initialAccessToken) {
      // Assume 1 hour expiry if not specified
      this.tokenExpiry = new Date(Date.now() + 3600000)
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    // Try to refresh token if it's close to expiry
    if (this.isTokenExpired() && this.refreshToken) {
      await this.refreshAccessToken()
    }

    if (!this.accessToken) {
      throw new Error("No valid access token available. Please authenticate first.")
    }

    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    if (error.response?.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken()
        return true // Retry the request with fresh token
      } catch (refreshError) {
        throw new Error("Failed to refresh token. Please re-authenticate.")
      }
    }
    return false
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available")
    }

    // Implement your actual token refresh logic here
    // This is just an example - replace with your API's refresh endpoint
    console.error("🔄 Refreshing access token...")
    
    // Simulated refresh - replace with actual HTTP call to your refresh endpoint
    // const response = await axios.post(this.refreshUrl, {
    //   refresh_token: this.refreshToken,
    //   grant_type: 'refresh_token'
    // })
    // 
    // this.accessToken = response.data.access_token
    // this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000)
    
    throw new Error("Token refresh not implemented - please implement refreshAccessToken() for your API")
  }

  setTokens(accessToken: string, refreshToken: string, expiresIn: number = 3600): void {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true
    // Refresh 5 minutes before expiry
    return this.tokenExpiry <= new Date(Date.now() + 300000)
  }
}

/**
 * Main function demonstrating HTTP transport with AuthProvider
 */
async function main(): Promise<void> {
  try {
    // Example 1: Basic AuthProvider with HTTP transport
    // Uncomment this section for basic token management
    const authProvider = new ExampleAuthProvider("MyAPI")
    
    // Set an initial token (in real usage, you'd get this from user input, config file, etc.)
    authProvider.updateToken("your-api-token-here", 3600)

    // Example 2: Auto-refreshing AuthProvider (advanced)
    // Uncomment this section for automatic token refresh
    /*
    const authProvider = new RefreshableHttpAuthProvider(
      "https://api.example.com/oauth/token", // Your token refresh endpoint
      "initial-access-token",                // Initial access token
      "initial-refresh-token"                // Initial refresh token
    )
    */

    const config = {
      name: "http-auth-provider-example",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com", // Replace with your API base URL
      openApiSpec: "https://api.example.com/openapi.json", // Replace with your OpenAPI spec URL
      specInputMethod: "url" as const,
      authProvider: authProvider, // Use AuthProvider for dynamic authentication
      transportType: "http" as const, // Use HTTP transport instead of stdio
      httpPort: 3000, // HTTP server port
      httpHost: "127.0.0.1", // HTTP server host
      endpointPath: "/mcp", // HTTP endpoint path
      toolsMode: "all" as const,
    }

    console.error("🚀 Starting HTTP MCP Server with AuthProvider...")
    console.error(`📋 Config: ${config.apiBaseUrl} -> http://${config.httpHost}:${config.httpPort}${config.endpointPath}`)

    // Create the server with HTTP transport
    const server = new OpenAPIServer(config)
    const transport = new StreamableHttpServerTransport(
      config.httpPort,
      config.httpHost,
      config.endpointPath
    )

    await server.start(transport)
    
    console.error("✅ HTTP MCP Server with AuthProvider is running!")
    console.error("")
    console.error("📖 Usage Instructions:")
    console.error("1. Initialize a session:")
    console.error(`   curl -X POST http://${config.httpHost}:${config.httpPort}${config.endpointPath} \\`)
    console.error('     -H "Content-Type: application/json" \\')
    console.error('     -d \'{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-client","version":"1.0.0"}}}\'')
    console.error("")
    console.error("2. Use the Mcp-Session-Id from the response for subsequent requests")
    console.error("")
    console.error("3. List available tools:")
    console.error(`   curl -X POST http://${config.httpHost}:${config.httpPort}${config.endpointPath} \\`)
    console.error('     -H "Content-Type: application/json" \\')
    console.error('     -H "Mcp-Session-Id: YOUR-SESSION-ID" \\')
    console.error('     -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'')
    console.error("")
    console.error("4. Open a streaming connection for responses:")
    console.error(`   curl -N http://${config.httpHost}:${config.httpPort}${config.endpointPath} -H "Mcp-Session-Id: YOUR-SESSION-ID"`)
    console.error("")
    console.error("🔧 Token Management:")
    console.error("- AuthProvider will automatically provide fresh headers for each API request")
    console.error("- If tokens expire, you'll get clear error messages with instructions")
    console.error("- Update tokens programmatically using authProvider.updateToken()")
    console.error("")

  } catch (error) {
    console.error("❌ Failed to start server:", error)
    process.exit(1)
  }
}

// Run the server
main()