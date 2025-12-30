#!/usr/bin/env node

import { OpenAPIServer } from "@ivotoby/openapi-mcp-server"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import * as crypto from "crypto"

/**
 * Example demonstrating custom tools alongside OpenAPI tools
 *
 * This shows how to:
 * - Register custom utility tools (base64 encode/decode, UUID generation)
 * - Add custom prompts for common workflows
 * - Add custom resources with documentation
 * - Mix custom tools with auto-generated OpenAPI tools
 */
async function main(): Promise<void> {
  try {
    // Configure the OpenAPI server
    const config = {
      name: "api-with-custom-tools",
      version: "1.0.0",
      apiBaseUrl: "https://api.example.com",
      openApiSpec: "https://api.example.com/openapi.json",
      specInputMethod: "url" as const,
      headers: {
        Authorization: "Bearer your-api-token",
      },
      transportType: "stdio" as const,
      toolsMode: "all" as const,

      // Define custom tools in config (loaded at startup)
      extraTools: [
        {
          name: "uuid-generator",
          description: "Generate a random UUID v4",
          inputSchema: {
            type: "object",
            properties: {},
          },
          handler: async (): Promise<CallToolResult> => {
            const uuid = crypto.randomUUID()
            return {
              content: [{ type: "text", text: uuid }],
            }
          },
        },
      ],

      // Define prompts for common workflows
      prompts: [
        {
          name: "create_and_list",
          title: "Create and List Workflow",
          description: "Template for creating a resource and listing all resources",
          arguments: [
            { name: "resource_type", description: "Type of resource (e.g., 'user', 'product')", required: true },
            { name: "data", description: "JSON data for the new resource", required: true },
          ],
          template: `First, create a new {{resource_type}} with this data: {{data}}
Then, list all {{resource_type}}s to verify the creation.`,
        },
      ],

      // Define resources with helpful documentation
      resources: [
        {
          uri: "docs://custom-tools-guide",
          name: "custom-tools-guide",
          title: "Custom Tools Guide",
          description: "Documentation for available custom utility tools",
          mimeType: "text/markdown",
          text: `# Custom Tools Guide

This server provides several custom utility tools in addition to the API endpoints:

## base64-encode
Encodes text to base64 format.

**Input:**
- \`text\` (string): The text to encode

**Example:**
\`\`\`
Input: { "text": "Hello World" }
Output: "SGVsbG8gV29ybGQ="
\`\`\`

## base64-decode
Decodes base64-encoded text back to plain text.

**Input:**
- \`text\` (string): The base64 text to decode

**Example:**
\`\`\`
Input: { "text": "SGVsbG8gV29ybGQ=" }
Output: "Hello World"
\`\`\`

## uuid-generator
Generates a random UUID v4.

**Input:**
No input required.

**Example:**
\`\`\`
Input: {}
Output: "550e8400-e29b-41d4-a716-446655440000"
\`\`\`

## json-formatter
Pretty-prints JSON with proper indentation.

**Input:**
- \`json\` (string): JSON string to format

**Example:**
\`\`\`
Input: { "json": "{\\"name\\":\\"John\\",\\"age\\":30}" }
Output: {
  "name": "John",
  "age": 30
}
\`\`\`
`,
        },
      ],
    }

    // Create the server
    const server = new OpenAPIServer(config)

    // Register additional custom tools programmatically
    server.registerTool("base64-encode", {
      description: "Encode text to base64 format",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to encode" },
        },
        required: ["text"],
      },
      handler: async (args): Promise<CallToolResult> => {
        try {
          const text = args.text as string
          const encoded = Buffer.from(text).toString("base64")
          return {
            content: [{ type: "text", text: encoded }],
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error encoding text: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true,
          }
        }
      },
    })

    server.registerTool("base64-decode", {
      description: "Decode base64-encoded text back to plain text",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Base64 text to decode" },
        },
        required: ["text"],
      },
      handler: async (args): Promise<CallToolResult> => {
        try {
          const text = args.text as string
          const decoded = Buffer.from(text, "base64").toString("utf-8")
          return {
            content: [{ type: "text", text: decoded }],
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error decoding base64: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true,
          }
        }
      },
    })

    server.registerTool("json-formatter", {
      description: "Pretty-print JSON with proper indentation",
      inputSchema: {
        type: "object",
        properties: {
          json: { type: "string", description: "JSON string to format" },
          indent: { type: "number", description: "Number of spaces for indentation (default: 2)" },
        },
        required: ["json"],
      },
      handler: async (args): Promise<CallToolResult> => {
        try {
          const json = args.json as string
          const indent = (args.indent as number) || 2
          const parsed = JSON.parse(json)
          const formatted = JSON.stringify(parsed, null, indent)
          return {
            content: [{ type: "text", text: formatted }],
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error formatting JSON: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true,
          }
        }
      },
    })

    // Register an additional prompt for debugging
    server.registerPrompt({
      name: "debug_api_error",
      title: "API Error Debugger",
      description: "Helps debug and troubleshoot API errors",
      arguments: [
        { name: "endpoint", description: "The API endpoint that failed", required: true },
        { name: "error_message", description: "The error message received", required: true },
        { name: "request_data", description: "The request data sent (if any)", required: false },
      ],
      template: `I received an error when calling {{endpoint}}.

Error message: {{error_message}}
{{#if request_data}}
Request data: {{request_data}}
{{/if}}

Please help me:
1. Understand what went wrong
2. Suggest how to fix the request
3. Provide a corrected example request`,
    })

    // Register an additional resource with API examples
    server.registerResource({
      uri: "docs://api-examples",
      name: "api-examples",
      title: "API Usage Examples",
      description: "Common API usage patterns and examples",
      mimeType: "text/markdown",
      text: `# API Usage Examples

## Authentication
All API requests require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer your-api-token
\`\`\`

## Common Workflows

### Creating a Resource
1. Generate a UUID: \`uuid-generator\`
2. Create the resource with the UUID
3. Verify creation by listing resources

### Data Transformation
- Encode sensitive data: \`base64-encode\`
- Decode received data: \`base64-decode\`
- Format JSON responses: \`json-formatter\`
`,
    })

    // Start the server
    const transport = new StdioServerTransport()
    await server.start(transport)

    console.error("MCP Server with custom tools running on stdio")
    console.error("Available custom tools: base64-encode, base64-decode, json-formatter, uuid-generator")
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

// Run the server
main()
