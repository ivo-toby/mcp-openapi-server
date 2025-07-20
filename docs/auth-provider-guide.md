# AuthProvider Usage Guide

The `@ivotoby/openapi-mcp-server` now supports dynamic authentication through the `AuthProvider` interface. This is particularly useful for APIs that require token refresh or have authentication tokens that expire.

## Basic Usage

### Static Authentication (Backward Compatible)

```typescript
import { OpenAPIServer } from '@ivotoby/openapi-mcp-server'

const config = {
  name: 'my-api-server',
  version: '1.0.0',
  apiBaseUrl: 'https://api.example.com',
  openApiSpec: './api-spec.yaml',
  specInputMethod: 'file',
  headers: {
    'Authorization': 'Bearer your-static-token',
    'X-API-Key': 'your-api-key'
  },
  transportType: 'stdio',
  toolsMode: 'all'
}

const server = new OpenAPIServer(config)
```

### Dynamic Authentication with AuthProvider

```typescript
import { OpenAPIServer, AuthProvider } from '@ivotoby/openapi-mcp-server'
import { AxiosError } from 'axios'

class MyAuthProvider implements AuthProvider {
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null

  async getAuthHeaders(): Promise<Record<string, string>> {
    // Check if token is still valid
    if (!this.accessToken || this.isTokenExpired()) {
      throw new Error('Token expired. Please provide a new token.')
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'X-Client-Version': '1.0.0'
    }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    // Check if this is an authentication error
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Try to refresh the token (if you have refresh logic)
      try {
        await this.refreshToken()
        return true // Retry the request
      } catch (refreshError) {
        // If refresh fails, ask user for new token
        throw new Error('Authentication failed. Please provide a new access token.')
      }
    }
    
    // Not an auth error, don't retry
    return false
  }

  setToken(token: string, expiresIn: number = 3600) {
    this.accessToken = token
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
  }

  private isTokenExpired(): boolean {
    return !this.tokenExpiry || this.tokenExpiry <= new Date()
  }

  private async refreshToken(): Promise<void> {
    // Implement your token refresh logic here
    // This might involve calling a refresh endpoint
    throw new Error('Token refresh not implemented')
  }
}

// Usage
const authProvider = new MyAuthProvider()
authProvider.setToken('your-initial-token', 3600)

const config = {
  name: 'my-api-server',
  version: '1.0.0',
  apiBaseUrl: 'https://api.example.com',
  openApiSpec: './api-spec.yaml',
  specInputMethod: 'file',
  authProvider: authProvider, // Use AuthProvider instead of headers
  transportType: 'stdio',
  toolsMode: 'all'
}

const server = new OpenAPIServer(config)
```

## AuthProvider Interface

```typescript
interface AuthProvider {
  /**
   * Get authentication headers for the current request
   * This method is called before each API request to get fresh headers
   * 
   * @returns Promise that resolves to headers object
   * @throws Error if authentication is not available (e.g., token expired)
   */
  getAuthHeaders(): Promise<Record<string, string>>

  /**
   * Handle authentication errors from API responses
   * This is called when the API returns authentication-related errors (401, 403)
   * 
   * @param error - The axios error from the failed request
   * @returns Promise that resolves to true if the request should be retried, false otherwise
   */
  handleAuthError(error: AxiosError): Promise<boolean>
}
```

## Key Features

### 1. Dynamic Headers per Request
Unlike static headers that are set once, `getAuthHeaders()` is called before each API request, allowing for:
- Token refresh
- Dynamic header generation
- Token validation before requests

### 2. Authentication Error Handling
When the API returns 401 or 403 errors, `handleAuthError()` is called, allowing you to:
- Attempt token refresh
- Prompt users for new credentials
- Decide whether to retry the request

### 3. Automatic Retry Logic
If `handleAuthError()` returns `true`, the request is automatically retried with fresh headers from `getAuthHeaders()`. The retry only happens once to prevent infinite loops.

### 4. Backward Compatibility
Existing code using static headers continues to work unchanged. The system internally creates a `StaticAuthProvider` when headers are provided without an `AuthProvider`.

## Example: Manual Token Updates

For APIs like Beatport where automatic refresh isn't possible, you can create an AuthProvider that prompts for new tokens:

```typescript
class ManualTokenAuthProvider implements AuthProvider {
  private token: string | null = null
  private tokenExpiry: Date | null = null

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.token || this.isTokenExpired()) {
      throw new Error(
        'Token expired. Please get a new token from your browser and update it using the updateToken command.'
      )
    }

    return { 'Authorization': `Bearer ${this.token}` }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    // For manual token management, we can't auto-retry
    // Throw a helpful error message instead
    throw new Error(
      'Authentication failed. Please get a new access token from your browser:\\n' +
      '1. Go to https://api.example.com\\n' +
      '2. Open browser dev tools\\n' +
      '3. Copy the Authorization header\\n' +
      '4. Use the updateToken command to set the new token'
    )
  }

  updateToken(token: string, expiresIn: number = 3600): void {
    this.token = token
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000)
    console.log('✅ Token updated successfully')
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true
    return this.tokenExpiry <= new Date(Date.now() + 60000) // 1 minute buffer
  }
}
```

## Error Handling Best Practices

1. **Clear Error Messages**: Provide actionable error messages that tell users exactly what to do
2. **Graceful Degradation**: Don't crash the server when tokens expire
3. **User Guidance**: Include step-by-step instructions for token renewal
4. **Retry Logic**: Only retry when it makes sense (e.g., after successful token refresh)

## Migration from Static Headers

To migrate existing code:

**Before:**
```typescript
const config = {
  // ... other config
  headers: { 'Authorization': 'Bearer token' }
}
```

**After:**
```typescript
const authProvider = new MyAuthProvider()
authProvider.setToken('token')

const config = {
  // ... other config
  authProvider: authProvider
  // Remove the headers property
}
```

## Usage with HTTP Transport

The `AuthProvider` interface works seamlessly with both stdio and HTTP transport. When using HTTP transport, AuthProvider provides additional benefits for web clients and HTTP-capable systems.

### HTTP Transport + AuthProvider Benefits

- **Web client compatibility**: Any HTTP client can connect (curl, JavaScript, Python, etc.)
- **Session management**: Multiple clients can maintain separate authenticated sessions
- **Dynamic authentication**: Fresh headers for each API request
- **Production ready**: Suitable for web applications and microservices

### Basic HTTP Transport Setup

```typescript
import { OpenAPIServer, AuthProvider } from '@ivotoby/openapi-mcp-server'
import { StreamableHttpServerTransport } from '@ivotoby/openapi-mcp-server'

class MyHttpAuthProvider implements AuthProvider {
  async getAuthHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getFreshToken()}` }
  }
  
  async handleAuthError(error: AxiosError): Promise<boolean> {
    // Handle authentication errors
    return false
  }
}

const authProvider = new MyHttpAuthProvider()
const config = {
  name: 'my-http-api-server',
  apiBaseUrl: 'https://api.example.com',
  openApiSpec: 'https://api.example.com/openapi.json',
  specInputMethod: 'url',
  authProvider: authProvider,
  transportType: 'http',
  httpPort: 3000,
  httpHost: '127.0.0.1',
  endpointPath: '/mcp',
  toolsMode: 'all'
}

const server = new OpenAPIServer(config)
const transport = new StreamableHttpServerTransport(
  config.httpPort,
  config.httpHost,
  config.endpointPath
)

await server.start(transport)
```

### HTTP Client Usage

Once the server is running, clients can connect via HTTP:

```bash
# Initialize session
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# Use the Mcp-Session-Id from response header for subsequent requests
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR-SESSION-ID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**📁 See [examples/http-auth-provider-example/](../examples/http-auth-provider-example/) for a complete HTTP + AuthProvider implementation.**

The AuthProvider approach provides much more flexibility and better error handling for modern APIs with dynamic authentication requirements.
