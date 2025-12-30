# Custom Tools Example

This example demonstrates how to extend an OpenAPI MCP server with custom tools, prompts, and resources.

## Features Demonstrated

- **Custom Tools**: Utility functions (base64 encode/decode, UUID generation, JSON formatting)
- **Configuration-based Tools**: Defining tools in the config object
- **Programmatic Registration**: Adding tools after server creation
- **Custom Prompts**: Workflow templates for common tasks
- **Custom Resources**: Documentation and usage guides
- **Integration**: Custom tools working alongside auto-generated OpenAPI tools

## Building and Running

```bash
# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run the server
npm start
```

## Using with Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "api-with-custom-tools": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-openapi-server/examples/custom-tools-example/dist/index.js"
      ],
      "env": {
        "API_BASE_URL": "https://api.example.com",
        "OPENAPI_SPEC_PATH": "https://api.example.com/openapi.json"
      }
    }
  }
}
```

Replace the environment variables with your actual API configuration.

## Available Custom Tools

### base64-encode
Encodes text to base64 format.

```json
{
  "name": "base64-encode",
  "arguments": {
    "text": "Hello World"
  }
}
```

### base64-decode
Decodes base64-encoded text back to plain text.

```json
{
  "name": "base64-decode",
  "arguments": {
    "text": "SGVsbG8gV29ybGQ="
  }
}
```

### uuid-generator
Generates a random UUID v4.

```json
{
  "name": "uuid-generator",
  "arguments": {}
}
```

### json-formatter
Pretty-prints JSON with proper indentation.

```json
{
  "name": "json-formatter",
  "arguments": {
    "json": "{\"name\":\"John\",\"age\":30}",
    "indent": 2
  }
}
```

## Available Prompts

### create_and_list
Template for creating a resource and listing all resources.

**Arguments:**
- `resource_type`: Type of resource (e.g., 'user', 'product')
- `data`: JSON data for the new resource

### debug_api_error
Helps debug and troubleshoot API errors.

**Arguments:**
- `endpoint`: The API endpoint that failed
- `error_message`: The error message received
- `request_data`: The request data sent (optional)

## Available Resources

### docs://custom-tools-guide
Documentation for all available custom utility tools.

### docs://api-examples
Common API usage patterns and examples.

## Code Structure

```
src/
└── index.ts       # Main server with custom tools, prompts, and resources
```

## Key Concepts

### Tool Registration via Config

```typescript
const config = {
  // ... other config
  extraTools: [
    {
      name: "my-tool",
      description: "Tool description",
      inputSchema: { /* JSON Schema */ },
      handler: async (args) => { /* implementation */ }
    }
  ]
}
```

### Tool Registration Programmatically

```typescript
const server = new OpenAPIServer(config)

server.registerTool("my-tool", {
  description: "Tool description",
  inputSchema: { /* JSON Schema */ },
  handler: async (args) => {
    return {
      content: [{ type: "text", text: "result" }]
    }
  }
})
```

### Error Handling

```typescript
handler: async (args): Promise<CallToolResult> => {
  try {
    // ... operation
    return {
      content: [{ type: "text", text: "success" }]
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }],
      isError: true
    }
  }
}
```

## Use Cases

This pattern is useful for:

- **Data Transformation**: Base64 encoding, JSON formatting, data validation
- **ID Generation**: UUIDs, unique identifiers, tokens
- **Workflow Automation**: Multi-step processes combining API calls
- **Debugging**: Error analysis, request formatting
- **Documentation**: Inline guides and examples

## Next Steps

- Modify the custom tools to fit your use case
- Add more prompts for common workflows
- Create resources with your API documentation
- Combine custom tools with your actual OpenAPI specification
