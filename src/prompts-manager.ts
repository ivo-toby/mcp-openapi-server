/**
 * Manager for MCP prompt definitions
 */

import type { Prompt, PromptArgument, GetPromptResult, PromptMessage } from "@modelcontextprotocol/sdk/types.js"
import type { PromptDefinition } from "./prompt-types"

export interface PromptsManagerConfig {
    prompts?: PromptDefinition[]
}

/**
 * Manages prompt definitions and handles prompt-related MCP requests
 */
export class PromptsManager {
    private prompts: Map<string, PromptDefinition> = new Map()

    constructor(config: PromptsManagerConfig) {
        if (config.prompts) {
            for (const prompt of config.prompts) {
                this.addPrompt(prompt)
            }
        }
    }

    /**
     * Add a prompt definition
     */
    addPrompt(prompt: PromptDefinition): void {
        if (!prompt.name) {
            throw new Error("Prompt name is required")
        }
        if (!prompt.template) {
            throw new Error(`Prompt "${prompt.name}" requires a template`)
        }
        this.prompts.set(prompt.name, prompt)
    }

    /**
     * Remove a prompt by name
     */
    removePrompt(name: string): boolean {
        return this.prompts.delete(name)
    }

    /**
     * Get all prompts in MCP format for listing
     */
    getAllPrompts(): Prompt[] {
        return Array.from(this.prompts.values()).map((def) => this.toMCPPrompt(def))
    }

    /**
     * Get a specific prompt with arguments applied
     */
    getPrompt(name: string, args?: Record<string, string>): GetPromptResult {
        const def = this.prompts.get(name)
        if (!def) {
            throw new Error(`Prompt not found: ${name}`)
        }

        // Validate required arguments
        if (def.arguments) {
            for (const arg of def.arguments) {
                if (arg.required && (!args || args[arg.name] === undefined)) {
                    throw new Error(`Missing required argument: ${arg.name}`)
                }
            }
        }

        // Render the template with arguments
        const renderedText = this.renderTemplate(def.template, args || {})

        const messages: PromptMessage[] = [
            {
                role: "user",
                content: {
                    type: "text",
                    text: renderedText,
                },
            },
        ]

        return {
            description: def.description,
            messages,
        }
    }

    /**
     * Check if a prompt exists
     */
    hasPrompt(name: string): boolean {
        return this.prompts.has(name)
    }

    /**
     * Get the count of prompts
     */
    get count(): number {
        return this.prompts.size
    }

    /**
     * Convert internal prompt definition to MCP Prompt format
     */
    private toMCPPrompt(def: PromptDefinition): Prompt {
        const prompt: Prompt = {
            name: def.name,
            description: def.description,
        }

        if (def.arguments && def.arguments.length > 0) {
            prompt.arguments = def.arguments.map(
                (arg): PromptArgument => ({
                    name: arg.name,
                    description: arg.description,
                    required: arg.required,
                }),
            )
        }

        return prompt
    }

    /**
     * Render a template string by replacing {{argName}} placeholders
     */
    private renderTemplate(template: string, args: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, argName) => {
            if (args[argName] !== undefined) {
                return args[argName]
            }
            // Return empty string for missing optional arguments
            return ""
        })
    }
}
