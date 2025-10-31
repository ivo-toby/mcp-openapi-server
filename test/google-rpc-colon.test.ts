import { describe, it, expect } from "vitest"
import { parseToolId, generateToolId } from "../src/utils/tool-id.js"

describe("Google-style RPC suffix with path parameters (Issue: Tool ID sanitization drops colon)", () => {
  it("should preserve colon in RPC-style paths like /api/widgets/{widgetId}:activate", () => {
    const path = "/api/widgets/{widgetId}:activate"
    const method = "POST"
    
    const toolId = generateToolId(method, path)
    const parsed = parseToolId(toolId)
    
    // The colon should be preserved in the path
    expect(parsed.path).toBe("/api/widgets/---widgetId:activate")
    expect(parsed.method).toBe("POST")
  })

  it("should handle multiple RPC-style colons", () => {
    const path = "/api/v1/resources/{id}:action:subaction"
    const method = "POST"
    
    const toolId = generateToolId(method, path)
    const parsed = parseToolId(toolId)
    
    expect(parsed.path).toBe("/api/v1/resources/---id:action:subaction")
  })

  it("should handle RPC-style paths without parameters", () => {
    const path = "/api/widgets:list"
    const method = "GET"
    
    const toolId = generateToolId(method, path)
    const parsed = parseToolId(toolId)
    
    expect(parsed.path).toBe("/api/widgets:list")
  })
  
  it("should handle complex RPC paths with multiple segments and parameters", () => {
    const path = "/api/v2/organizations/{orgId}/members/{memberId}:activate"
    const method = "POST"
    
    const toolId = generateToolId(method, path)
    const parsed = parseToolId(toolId)
    
    expect(parsed.path).toBe("/api/v2/organizations/---orgId/members/---memberId:activate")
  })
})

describe("API Client parameter replacement with Google RPC colons", () => {
  it("should replace path parameters correctly when followed by RPC colon", () => {
    // Simulate what happens in the API client
    const resolvedPath = "/api/widgets/---widgetId:activate"
    const key = "widgetId"
    const value = "widget-123"
    
    // Escape key before using it in regex patterns
    const escapeRegExp = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    
    const escapedKey = escapeRegExp(key)
    // Updated regex from api-client.ts with colon in lookahead
    const paramRegex = new RegExp(
      `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|:|$)`,
      "g",
    )
    
    const result = resolvedPath.replace(
      paramRegex,
      (match) => encodeURIComponent(value) + (match.endsWith("/") ? "/" : ""),
    )
    
    // Should replace ---widgetId with widget-123, preserving the :activate suffix
    expect(result).toBe("/api/widgets/widget-123:activate")
  })
})

describe("End-to-end Google RPC path handling", () => {
  it("should correctly handle the full flow: path -> toolId -> parse -> replace", () => {
    // Step 1: Original OpenAPI path
    const originalPath = "/api/widgets/{widgetId}:activate"
    const method = "POST"
    
    // Step 2: Generate tool ID
    const toolId = generateToolId(method, originalPath)
    expect(toolId).toBe("POST::api__widgets__---widgetId:activate")
    
    // Step 3: Parse the tool ID back to get the path
    const parsed = parseToolId(toolId)
    expect(parsed.path).toBe("/api/widgets/---widgetId:activate")
    expect(parsed.method).toBe("POST")
    
    // Step 4: Simulate parameter replacement (as done in api-client)
    const widgetId = "widget-123"
    const escapeRegExp = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    const escapedKey = escapeRegExp("widgetId")
    const paramRegex = new RegExp(
      `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|:|$)`,
      "g",
    )
    
    const finalPath = parsed.path.replace(
      paramRegex,
      (match) => encodeURIComponent(widgetId) + (match.endsWith("/") ? "/" : ""),
    )
    
    // Step 5: Verify the final path is correct
    expect(finalPath).toBe("/api/widgets/widget-123:activate")
  })
  
  it("should handle multiple parameters with RPC suffix", () => {
    const originalPath = "/api/v1/organizations/{orgId}/members/{memberId}:activate"
    const method = "POST"
    
    const toolId = generateToolId(method, originalPath)
    const parsed = parseToolId(toolId)
    
    // Replace parameters
    let finalPath = parsed.path
    const params = { orgId: "org-456", memberId: "member-789" }
    
    const escapeRegExp = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    
    for (const [key, value] of Object.entries(params)) {
      const escapedKey = escapeRegExp(key)
      const paramRegex = new RegExp(
        `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|:|$)`,
        "g",
      )
      finalPath = finalPath.replace(
        paramRegex,
        (match) => encodeURIComponent(value) + (match.endsWith("/") ? "/" : ""),
      )
    }
    
    expect(finalPath).toBe("/api/v1/organizations/org-456/members/member-789:activate")
  })
})

describe("Issue: Tool ID sanitization drops RPC colon in paths", () => {
  it("should fix the exact issue reported: /api/widgets/{widgetId}:activate", () => {
    // This is the exact scenario from the bug report
    const path = "/api/widgets/{widgetId}:activate"
    const method = "POST"
    
    // Generate tool ID
    const toolId = generateToolId(method, path)
    
    // Parse it back
    const parsed = parseToolId(toolId)
    
    // The colon should be preserved
    expect(parsed.path).toContain(":activate")
    expect(parsed.path).toBe("/api/widgets/---widgetId:activate")
    
    // Now simulate parameter replacement (what the API client does)
    const widgetId = "12345"
    const escapeRegExp = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    const escapedKey = escapeRegExp("widgetId")
    const paramRegex = new RegExp(
      `\\{${escapedKey}\\}|:${escapedKey}(?:\\/|$)|---${escapedKey}(?=__|/|:|$)`,
      "g",
    )
    
    const finalPath = parsed.path.replace(
      paramRegex,
      (match) => encodeURIComponent(widgetId) + (match.endsWith("/") ? "/" : ""),
    )
    
    // The final path should be correct
    expect(finalPath).toBe("/api/widgets/12345:activate")
    
    // Should NOT be the broken version from the bug report
    expect(finalPath).not.toBe("/api/widgets/---widgetIdactivate")
    expect(finalPath).not.toContain("---")
  })
})
