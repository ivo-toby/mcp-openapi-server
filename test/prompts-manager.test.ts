import { describe, it, expect, beforeEach } from "vitest"
import { PromptsManager } from "../src/prompts-manager"
import type { PromptDefinition } from "../src/prompt-types"

describe("PromptsManager", () => {
    describe("constructor", () => {
        it("should initialize with empty prompts", () => {
            const manager = new PromptsManager({})
            expect(manager.count).toBe(0)
        })

        it("should initialize with provided prompts", () => {
            const prompts: PromptDefinition[] = [
                { name: "test1", template: "Hello {{name}}" },
                { name: "test2", template: "Goodbye {{name}}" },
            ]
            const manager = new PromptsManager({ prompts })
            expect(manager.count).toBe(2)
        })
    })

    describe("addPrompt", () => {
        let manager: PromptsManager

        beforeEach(() => {
            manager = new PromptsManager({})
        })

        it("should add a valid prompt", () => {
            manager.addPrompt({ name: "greet", template: "Hello {{name}}!" })
            expect(manager.count).toBe(1)
            expect(manager.hasPrompt("greet")).toBe(true)
        })

        it("should throw error for prompt without name", () => {
            expect(() => {
                manager.addPrompt({ name: "", template: "test" })
            }).toThrow("Prompt name is required")
        })

        it("should throw error for prompt without template", () => {
            expect(() => {
                manager.addPrompt({ name: "test", template: "" })
            }).toThrow('Prompt "test" requires a template')
        })

        it("should overwrite existing prompt with same name", () => {
            manager.addPrompt({ name: "greet", template: "Hello!" })
            manager.addPrompt({ name: "greet", template: "Hi there!" })
            expect(manager.count).toBe(1)
            const result = manager.getPrompt("greet")
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "Hi there!",
            })
        })
    })

    describe("removePrompt", () => {
        it("should remove an existing prompt", () => {
            const manager = new PromptsManager({
                prompts: [{ name: "test", template: "test" }],
            })
            expect(manager.removePrompt("test")).toBe(true)
            expect(manager.count).toBe(0)
        })

        it("should return false for non-existent prompt", () => {
            const manager = new PromptsManager({})
            expect(manager.removePrompt("nonexistent")).toBe(false)
        })
    })

    describe("getAllPrompts", () => {
        it("should return empty array when no prompts", () => {
            const manager = new PromptsManager({})
            expect(manager.getAllPrompts()).toEqual([])
        })

        it("should return prompts in MCP format", () => {
            const manager = new PromptsManager({
                prompts: [
                    {
                        name: "greet",
                        title: "Greeting",
                        description: "A greeting prompt",
                        arguments: [
                            { name: "name", description: "Person's name", required: true },
                        ],
                        template: "Hello {{name}}!",
                    },
                ],
            })

            const prompts = manager.getAllPrompts()
            expect(prompts).toHaveLength(1)
            expect(prompts[0]).toEqual({
                name: "greet",
                description: "A greeting prompt",
                arguments: [
                    { name: "name", description: "Person's name", required: true },
                ],
            })
        })

        it("should not include arguments if none defined", () => {
            const manager = new PromptsManager({
                prompts: [{ name: "simple", template: "Simple prompt" }],
            })

            const prompts = manager.getAllPrompts()
            expect(prompts[0].arguments).toBeUndefined()
        })
    })

    describe("getPrompt", () => {
        let manager: PromptsManager

        beforeEach(() => {
            manager = new PromptsManager({
                prompts: [
                    {
                        name: "greet",
                        description: "Greeting prompt",
                        arguments: [
                            { name: "name", required: true },
                            { name: "title", required: false },
                        ],
                        template: "Hello {{title}} {{name}}!",
                    },
                ],
            })
        })

        it("should throw error for non-existent prompt", () => {
            expect(() => {
                manager.getPrompt("nonexistent")
            }).toThrow("Prompt not found: nonexistent")
        })

        it("should throw error for missing required argument", () => {
            expect(() => {
                manager.getPrompt("greet", {})
            }).toThrow("Missing required argument: name")
        })

        it("should render template with provided arguments", () => {
            const result = manager.getPrompt("greet", { name: "World", title: "Mr." })

            expect(result.description).toBe("Greeting prompt")
            expect(result.messages).toHaveLength(1)
            expect(result.messages[0].role).toBe("user")
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "Hello Mr. World!",
            })
        })

        it("should replace missing optional arguments with empty string", () => {
            const result = manager.getPrompt("greet", { name: "World" })

            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "Hello  World!",
            })
        })

        it("should work without arguments object", () => {
            const simpleManager = new PromptsManager({
                prompts: [{ name: "simple", template: "No args needed" }],
            })

            const result = simpleManager.getPrompt("simple")
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "No args needed",
            })
        })
    })

    describe("hasPrompt", () => {
        it("should return true for existing prompt", () => {
            const manager = new PromptsManager({
                prompts: [{ name: "test", template: "test" }],
            })
            expect(manager.hasPrompt("test")).toBe(true)
        })

        it("should return false for non-existent prompt", () => {
            const manager = new PromptsManager({})
            expect(manager.hasPrompt("test")).toBe(false)
        })
    })

    describe("template rendering", () => {
        it("should handle multiple occurrences of same placeholder", () => {
            const manager = new PromptsManager({
                prompts: [
                    { name: "repeat", template: "{{word}} {{word}} {{word}}" },
                ],
            })

            const result = manager.getPrompt("repeat", { word: "hello" })
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "hello hello hello",
            })
        })

        it("should handle placeholders with no matching argument", () => {
            const manager = new PromptsManager({
                prompts: [{ name: "test", template: "Hello {{unknown}}" }],
            })

            const result = manager.getPrompt("test", {})
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "Hello ",
            })
        })

        it("should preserve text around placeholders", () => {
            const manager = new PromptsManager({
                prompts: [
                    { name: "test", template: "Start {{a}} middle {{b}} end" },
                ],
            })

            const result = manager.getPrompt("test", { a: "A", b: "B" })
            expect(result.messages[0].content).toEqual({
                type: "text",
                text: "Start A middle B end",
            })
        })
    })
})
