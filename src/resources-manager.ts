/**
 * Manager for MCP resource definitions
 */

import type {
    Resource,
    ReadResourceResult,
    TextResourceContents,
    BlobResourceContents,
} from "@modelcontextprotocol/sdk/types.js"
import type { ResourceDefinition } from "./resource-types"

export interface ResourcesManagerConfig {
    resources?: ResourceDefinition[]
}

/**
 * Manages resource definitions and handles resource-related MCP requests
 */
export class ResourcesManager {
    private resources: Map<string, ResourceDefinition> = new Map()

    constructor(config: ResourcesManagerConfig) {
        if (config.resources) {
            for (const resource of config.resources) {
                this.addResource(resource)
            }
        }
    }

    /**
     * Add a resource definition
     */
    addResource(resource: ResourceDefinition): void {
        if (!resource.uri) {
            throw new Error("Resource URI is required")
        }
        if (!resource.name) {
            throw new Error(`Resource "${resource.uri}" requires a name`)
        }
        // Validate that at least one content source is provided
        if (!resource.text && !resource.blob && !resource.contentProvider) {
            throw new Error(
                `Resource "${resource.uri}" requires content (text, blob, or contentProvider)`,
            )
        }
        this.resources.set(resource.uri, resource)
    }

    /**
     * Remove a resource by URI
     */
    removeResource(uri: string): boolean {
        return this.resources.delete(uri)
    }

    /**
     * Get all resources in MCP format for listing
     */
    getAllResources(): Resource[] {
        return Array.from(this.resources.values()).map((def) => this.toMCPResource(def))
    }

    /**
     * Read a specific resource by URI
     */
    async readResource(uri: string): Promise<ReadResourceResult> {
        const def = this.resources.get(uri)
        if (!def) {
            throw new Error(`Resource not found: ${uri}`)
        }

        let contents: (TextResourceContents | BlobResourceContents)[]

        if (def.contentProvider) {
            // Dynamic content from provider
            let content: string | { blob: string }
            try {
                content = await def.contentProvider()
            } catch (error) {
                throw new Error(
                    `Failed to load content for resource "${uri}": ${error instanceof Error ? error.message : String(error)}`,
                )
            }
            if (typeof content === "string") {
                contents = [
                    {
                        uri: def.uri,
                        mimeType: def.mimeType,
                        text: content,
                    },
                ]
            } else {
                contents = [
                    {
                        uri: def.uri,
                        mimeType: def.mimeType,
                        blob: content.blob,
                    },
                ]
            }
        } else if (def.text !== undefined) {
            // Static text content
            contents = [
                {
                    uri: def.uri,
                    mimeType: def.mimeType,
                    text: def.text,
                },
            ]
        } else if (def.blob !== undefined) {
            // Static binary content
            contents = [
                {
                    uri: def.uri,
                    mimeType: def.mimeType,
                    blob: def.blob,
                },
            ]
        } else {
            throw new Error(`Resource "${uri}" has no content`)
        }

        return { contents }
    }

    /**
     * Check if a resource exists
     */
    hasResource(uri: string): boolean {
        return this.resources.has(uri)
    }

    /**
     * Get the count of resources
     */
    get count(): number {
        return this.resources.size
    }

    /**
     * Convert internal resource definition to MCP Resource format
     */
    private toMCPResource(def: ResourceDefinition): Resource {
        // Note: annotations are stored in ResourceDefinition but the current SDK version
        // may not support annotations in the Resource type. They are preserved in our
        // internal representation for future SDK compatibility.
        return {
            uri: def.uri,
            name: def.name,
            description: def.description,
            mimeType: def.mimeType,
        }
    }
}

