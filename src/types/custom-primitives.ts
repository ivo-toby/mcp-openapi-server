/**
 * Type definitions for custom MCP primitives
 */

import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js"

/**
 * Handler function for custom tool execution
 * Returns MCP CallToolResult format
 */
export type CustomToolHandler = (
  args: Record<string, unknown>,
) => Promise<CallToolResult>

/**
 * Definition for a custom tool
 */
export interface CustomToolDefinition {
  /**
   * Unique name for the tool
   */
  name: string
  /**
   * Human-readable description
   */
  description?: string
  /**
   * JSON Schema describing the tool's input parameters
   */
  inputSchema: Tool["inputSchema"]
  /**
   * Handler function to execute when tool is called
   */
  handler: CustomToolHandler
}
