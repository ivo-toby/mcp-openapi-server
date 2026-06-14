import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js"

export interface ExtraToolDefinition {
  id: string
  tool: Tool
  handler: (args: Record<string, unknown>) => Promise<CallToolResult> | CallToolResult
}
