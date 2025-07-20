# HTTP Transport with AuthProvider Example

This example demonstrates how to use **AuthProvider with HTTP transport** in `@ivotoby/openapi-mcp-server`. This combination allows you to:

- **Use HTTP transport** for web clients and HTTP-capable systems
- **Use dynamic authentication** with token refresh, expiration handling, and runtime updates
- **Get the best of both worlds**: HTTP accessibility + sophisticated authentication

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure your API**:
   Edit `src/index.ts` and update:
   - `apiBaseUrl`: Your API's base URL
   - `openApiSpec`: Path to your OpenAPI specification
   - Token in `authProvider.updateToken()` call

3. **Build and run**:
   ```bash
   npm run build
   npm start
   ```

4. **Test the server**:
   ```bash
   # Initialize a session
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-client","version":"1.0.0"}}}'
   
   # Use the Mcp-Session-Id from response for subsequent requests
   curl -X POST http://127.0.0.1:3000/mcp \
     -H "Content-Type: application/json" \
     -H "Mcp-Session-Id: YOUR-SESSION-ID" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

## AuthProvider Implementations

### 1. Basic AuthProvider (Recommended for most APIs)

```typescript
const authProvider = new ExampleAuthProvider("MyAPI")
authProvider.updateToken("your-api-token-here", 3600)

const config = {
  // ... other config
  authProvider: authProvider,
  transportType: "http" as const,
  httpPort: 3000,
}
```

**Features**:
- Manual token updates
- Token expiration tracking
- Clear error messages when tokens expire
- Perfect for APIs that don't support automatic refresh

### 2. Auto-Refreshing AuthProvider (Advanced)

```typescript
const authProvider = new RefreshableHttpAuthProvider(
  "https://api.example.com/oauth/token", // Your refresh endpoint
  "initial-access-token",
  "initial-refresh-token"
)

const config = {
  // ... other config
  authProvider: authProvider,
  transportType: "http" as const,
}
```

**Features**:
- Automatic token refresh before expiration
- Retry logic for 401 errors
- OAuth2-compatible
- Requires implementing your specific refresh logic

## Key Benefits

### 1. HTTP Transport Advantages
- **Web client compatibility**: Any HTTP client can connect
- **Debugging friendly**: Use curl, Postman, or browser dev tools
- **Firewall friendly**: Standard HTTP ports and protocols
- **Scalable**: Multiple clients can connect simultaneously

### 2. AuthProvider Advantages
- **Dynamic headers**: Fresh authentication for each request
- **Token management**: Automatic expiration handling
- **Error recovery**: Intelligent retry logic for auth failures
- **Runtime updates**: Change tokens without restarting

### 3. Combined Benefits
- **Production ready**: Suitable for web applications and services
- **Secure**: Proper authentication with token lifecycle management
- **Flexible**: Support any authentication pattern your API requires
- **User friendly**: Clear error messages and token status reporting

## Configuration Options

### HTTP Transport Settings

```typescript
const config = {
  transportType: "http" as const,
  httpPort: 3000,              // Server port
  httpHost: "127.0.0.1",       // Server host (use "0.0.0.0" for all interfaces)
  endpointPath: "/mcp",        // HTTP endpoint path
  // ... other config
}
```

### AuthProvider Integration

```typescript
const config = {
  // Use EITHER authProvider OR headers, not both
  authProvider: myAuthProvider,  // ✅ Dynamic authentication
  // headers: { ... },          // ❌ Don't use static headers with AuthProvider
  // ... other config
}
```

## Real-World Usage Patterns

### Pattern 1: API with Bearer Tokens

```typescript
class BearerTokenProvider implements AuthProvider {
  private token: string | null = null

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.token) {
      throw new Error("No token set. Please authenticate first.")
    }
    return { Authorization: `Bearer ${this.token}` }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    if (error.response?.status === 401) {
      throw new Error("Token expired. Please get a new token.")
    }
    return false
  }

  setToken(token: string): void {
    this.token = token
  }
}
```

### Pattern 2: API with API Keys

```typescript
class ApiKeyProvider implements AuthProvider {
  constructor(private apiKey: string) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    return { 
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json"
    }
  }

  async handleAuthError(error: AxiosError): Promise<boolean> {
    throw new Error("API key authentication failed. Please check your key.")
  }
}
```

### Pattern 3: OAuth2 with Refresh

```typescript
class OAuth2Provider implements AuthProvider {
  // Implementation with automatic token refresh
  // See RefreshableHttpAuthProvider in the example
}
```

## HTTP Client Examples

### Using curl

```bash
# Initialize
SESSION_ID=$(curl -s -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' \
  | jq -r '.result.sessionId // empty' \
  || curl -s -D- -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' \
  | grep -i mcp-session-id | cut -d' ' -f2 | tr -d '\r')

# List tools
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Execute a tool
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/execute","params":{"name":"your-tool-name","arguments":{}}}'
```

### Using JavaScript/Node.js

```javascript
const sessionResponse = await fetch('http://127.0.0.1:3000/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'js-client', version: '1.0.0' }
    }
  })
});

const sessionId = sessionResponse.headers.get('Mcp-Session-Id');

const toolsResponse = await fetch('http://127.0.0.1:3000/mcp', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  })
});
```

## Authentication Flow

1. **Server starts** with AuthProvider configured
2. **Client connects** via HTTP and initializes session
3. **Client requests tools** - server calls `authProvider.getAuthHeaders()` for fresh credentials
4. **API calls made** with fresh authentication headers from AuthProvider
5. **If auth fails** (401/403), server calls `authProvider.handleAuthError()`
6. **AuthProvider decides** whether to retry (after refresh) or fail with user guidance

## Error Handling

### Token Expiration
```
❌ MyAPI token expired or not set. Please provide a valid token using updateToken() method.
```

### Authentication Failure
```
❌ MyAPI authentication failed. Please update your token:
1. Get a new access token from your API provider
2. Update the token using the updateToken() method
3. Try your request again
```

### Clear Instructions
AuthProvider implementations should always provide actionable error messages that tell users exactly what to do.

## Comparison with Other Approaches

| Approach | HTTP Transport | Dynamic Auth | Use Case |
|----------|----------------|--------------|----------|
| **CLI with static headers** | ✅ | ❌ | Simple APIs, testing |
| **AuthProvider + stdio** | ❌ | ✅ | Claude Desktop, complex auth |
| **AuthProvider + HTTP** | ✅ | ✅ | **Production web services** |

## Next Steps

1. **Adapt the example** to your specific API
2. **Implement token refresh** logic for your OAuth2 provider
3. **Add error handling** specific to your API's error responses
4. **Test with your clients** to ensure compatibility
5. **Deploy to production** with proper security considerations

For more examples and patterns, see:
- [AuthProvider Guide](../../docs/auth-provider-guide.md)
- [Beatport Example](../beatport-example/) - Real-world production implementation
- [Basic Library Usage](../basic-library-usage/) - Simple static auth patterns