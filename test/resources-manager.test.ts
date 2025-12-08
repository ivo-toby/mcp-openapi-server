import { describe, it, expect, beforeEach, vi } from "vitest"
import { ResourcesManager } from "../src/resources-manager"
import type { ResourceDefinition } from "../src/resource-types"

describe("ResourcesManager", () => {
    describe("constructor", () => {
        it("should initialize with empty resources", () => {
            const manager = new ResourcesManager({})
            expect(manager.count).toBe(0)
        })

        it("should initialize with provided resources", () => {
            const resources: ResourceDefinition[] = [
                { uri: "test://one", name: "one", text: "content1" },
                { uri: "test://two", name: "two", text: "content2" },
            ]
            const manager = new ResourcesManager({ resources })
            expect(manager.count).toBe(2)
        })
    })

    describe("addResource", () => {
        let manager: ResourcesManager

        beforeEach(() => {
            manager = new ResourcesManager({})
        })

        it("should add a valid resource with text content", () => {
            manager.addResource({
                uri: "docs://readme",
                name: "readme",
                text: "# README",
            })
            expect(manager.count).toBe(1)
            expect(manager.hasResource("docs://readme")).toBe(true)
        })

        it("should add a valid resource with blob content", () => {
            manager.addResource({
                uri: "data://image",
                name: "image",
                blob: "base64encodeddata",
            })
            expect(manager.count).toBe(1)
        })

        it("should add a valid resource with contentProvider", () => {
            manager.addResource({
                uri: "dynamic://data",
                name: "data",
                contentProvider: async () => "dynamic content",
            })
            expect(manager.count).toBe(1)
        })

        it("should throw error for resource without URI", () => {
            expect(() => {
                manager.addResource({ uri: "", name: "test", text: "content" })
            }).toThrow("Resource URI is required")
        })

        it("should throw error for resource without name", () => {
            expect(() => {
                manager.addResource({ uri: "test://uri", name: "", text: "content" })
            }).toThrow('Resource "test://uri" requires a name')
        })

        it("should throw error for resource without content", () => {
            expect(() => {
                manager.addResource({ uri: "test://uri", name: "test" })
            }).toThrow(
                'Resource "test://uri" requires content (text, blob, or contentProvider)',
            )
        })

        it("should overwrite existing resource with same URI", () => {
            manager.addResource({ uri: "test://uri", name: "v1", text: "old" })
            manager.addResource({ uri: "test://uri", name: "v2", text: "new" })
            expect(manager.count).toBe(1)
        })
    })

    describe("removeResource", () => {
        it("should remove an existing resource", () => {
            const manager = new ResourcesManager({
                resources: [{ uri: "test://uri", name: "test", text: "content" }],
            })
            expect(manager.removeResource("test://uri")).toBe(true)
            expect(manager.count).toBe(0)
        })

        it("should return false for non-existent resource", () => {
            const manager = new ResourcesManager({})
            expect(manager.removeResource("nonexistent")).toBe(false)
        })
    })

    describe("getAllResources", () => {
        it("should return empty array when no resources", () => {
            const manager = new ResourcesManager({})
            expect(manager.getAllResources()).toEqual([])
        })

        it("should return resources in MCP format", () => {
            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "docs://api",
                        name: "api-docs",
                        title: "API Documentation",
                        description: "Full API docs",
                        mimeType: "text/markdown",
                        text: "# API",
                    },
                ],
            })

            const resources = manager.getAllResources()
            expect(resources).toHaveLength(1)
            expect(resources[0]).toEqual({
                uri: "docs://api",
                name: "api-docs",
                description: "Full API docs",
                mimeType: "text/markdown",
            })
        })
    })

    describe("readResource", () => {
        it("should throw error for non-existent resource", async () => {
            const manager = new ResourcesManager({})
            await expect(manager.readResource("nonexistent")).rejects.toThrow(
                "Resource not found: nonexistent",
            )
        })

        it("should return text content", async () => {
            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "docs://readme",
                        name: "readme",
                        mimeType: "text/markdown",
                        text: "# Hello World",
                    },
                ],
            })

            const result = await manager.readResource("docs://readme")
            expect(result.contents).toHaveLength(1)
            expect(result.contents[0]).toEqual({
                uri: "docs://readme",
                mimeType: "text/markdown",
                text: "# Hello World",
            })
        })

        it("should return blob content", async () => {
            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "data://image",
                        name: "image",
                        mimeType: "image/png",
                        blob: "iVBORw0KGgo=",
                    },
                ],
            })

            const result = await manager.readResource("data://image")
            expect(result.contents).toHaveLength(1)
            expect(result.contents[0]).toEqual({
                uri: "data://image",
                mimeType: "image/png",
                blob: "iVBORw0KGgo=",
            })
        })

        it("should call contentProvider for dynamic text content", async () => {
            const contentProvider = vi.fn().mockResolvedValue("Dynamic content")

            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "dynamic://data",
                        name: "data",
                        mimeType: "text/plain",
                        contentProvider,
                    },
                ],
            })

            const result = await manager.readResource("dynamic://data")
            expect(contentProvider).toHaveBeenCalledOnce()
            expect(result.contents[0]).toEqual({
                uri: "dynamic://data",
                mimeType: "text/plain",
                text: "Dynamic content",
            })
        })

        it("should call contentProvider for dynamic blob content", async () => {
            const contentProvider = vi.fn().mockResolvedValue({ blob: "base64data" })

            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "dynamic://binary",
                        name: "binary",
                        mimeType: "application/octet-stream",
                        contentProvider,
                    },
                ],
            })

            const result = await manager.readResource("dynamic://binary")
            expect(contentProvider).toHaveBeenCalledOnce()
            expect(result.contents[0]).toEqual({
                uri: "dynamic://binary",
                mimeType: "application/octet-stream",
                blob: "base64data",
            })
        })

        it("should handle contentProvider errors gracefully", async () => {
            const contentProvider = vi
                .fn()
                .mockRejectedValue(new Error("Provider failed"))

            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "dynamic://error",
                        name: "error",
                        contentProvider,
                    },
                ],
            })

            await expect(manager.readResource("dynamic://error")).rejects.toThrow(
                'Failed to load content for resource "dynamic://error": Provider failed',
            )
        })

        it("should handle non-Error contentProvider failures", async () => {
            const contentProvider = vi.fn().mockRejectedValue("string error")

            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "dynamic://error",
                        name: "error",
                        contentProvider,
                    },
                ],
            })

            await expect(manager.readResource("dynamic://error")).rejects.toThrow(
                'Failed to load content for resource "dynamic://error": string error',
            )
        })
    })

    describe("hasResource", () => {
        it("should return true for existing resource", () => {
            const manager = new ResourcesManager({
                resources: [{ uri: "test://uri", name: "test", text: "content" }],
            })
            expect(manager.hasResource("test://uri")).toBe(true)
        })

        it("should return false for non-existent resource", () => {
            const manager = new ResourcesManager({})
            expect(manager.hasResource("test://uri")).toBe(false)
        })
    })

    describe("priority ordering", () => {
        it("should prefer contentProvider over static content", async () => {
            const contentProvider = vi.fn().mockResolvedValue("From provider")

            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "test://priority",
                        name: "priority",
                        text: "Static text",
                        contentProvider,
                    },
                ],
            })

            const result = await manager.readResource("test://priority")
            expect(contentProvider).toHaveBeenCalled()
            expect(result.contents[0]).toHaveProperty("text", "From provider")
        })

        it("should prefer text over blob", async () => {
            const manager = new ResourcesManager({
                resources: [
                    {
                        uri: "test://priority",
                        name: "priority",
                        text: "Text content",
                        blob: "blob content",
                    },
                ],
            })

            const result = await manager.readResource("test://priority")
            expect(result.contents[0]).toHaveProperty("text", "Text content")
            expect(result.contents[0]).not.toHaveProperty("blob")
        })
    })
})
