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
