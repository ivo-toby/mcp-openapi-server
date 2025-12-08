/**
 * Prompt-related type definitions for MCP server
 */

/**
 * Describes an argument that a prompt can accept
 */
export interface PromptArgumentDefinition {
    /** The name of the argument */
    name: string
    /** A human-readable description of the argument */
    description?: string
    /** Whether this argument must be provided */
    required?: boolean
}

/**
 * Definition for a prompt template that can be exposed via MCP
 */
export interface PromptDefinition {
    /** The name of the prompt (used as identifier) */
    name: string
    /** Human-readable title for display purposes */
    title?: string
    /** An optional description of what this prompt provides */
    description?: string
    /** A list of arguments to use for templating the prompt */
    arguments?: PromptArgumentDefinition[]
    /** Template string with {{argName}} placeholders for argument substitution */
    template: string
}
