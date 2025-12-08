/**
 * Resource-related type definitions for MCP server
 */

/**
 * Annotations for resources providing hints to clients
 */
export interface ResourceAnnotations {
    /** Intended audience: 'user', 'assistant', or both */
    audience?: ("user" | "assistant")[]
    /** Importance from 0.0 (optional) to 1.0 (required) */
    priority?: number
    /** ISO 8601 timestamp of last modification */
    lastModified?: string
}

/**
 * Definition for a resource that can be exposed via MCP
 */
export interface ResourceDefinition {
    /** The URI of this resource (unique identifier) */
    uri: string
    /** A human-readable name for this resource */
    name: string
    /** Human-readable title for display purposes */
    title?: string
    /** A description of what this resource represents */
    description?: string
    /** The MIME type of this resource */
    mimeType?: string
    /** Optional size in bytes */
    size?: number
    /** Optional annotations for hints to clients */
    annotations?: ResourceAnnotations
    /** Static text content (mutually exclusive with blob and contentProvider) */
    text?: string
    /** Static binary content as base64 (mutually exclusive with text and contentProvider) */
    blob?: string
    /** Provider function for dynamic content (mutually exclusive with text and blob) */
    contentProvider?: () => Promise<string | { blob: string }>
}
