/**
 * Utility for loading prompts and resources from files, URLs, or inline JSON
 */

import * as fs from "fs"
import * as path from "path"
import yaml from "js-yaml"
import axios from "axios"
import type { PromptDefinition } from "./prompt-types"
import type { ResourceDefinition } from "./resource-types"

/**
 * Load content from a file path, URL, or inline string
 */
async function loadContent(
    pathOrUrl?: string,
    inline?: string,
): Promise<string | undefined> {
    if (inline) {
        return inline
    }

    if (!pathOrUrl) {
        return undefined
    }

    // URL loading
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
        const response = await axios.get(pathOrUrl, {
            responseType: "text",
            headers: { Accept: "application/json, application/yaml, text/yaml" },
        })
        return response.data
    }

    // File loading
    const absolutePath = path.isAbsolute(pathOrUrl)
        ? pathOrUrl
        : path.resolve(process.cwd(), pathOrUrl)

    return fs.readFileSync(absolutePath, "utf-8")
}

/**
 * Parse JSON or YAML content
 */
function parseContent<T>(content: string, source: string): T {
    // Try JSON first
    try {
        return JSON.parse(content)
    } catch {
        // Try YAML
        try {
            return yaml.load(content) as T
        } catch (yamlError) {
            throw new Error(
                `Failed to parse ${source} as JSON or YAML: ${yamlError}`,
            )
        }
    }
}

/**
 * Load prompts from path, URL, or inline JSON
 */
export async function loadPrompts(
    pathOrUrl?: string,
    inline?: string,
): Promise<PromptDefinition[] | undefined> {
    const content = await loadContent(pathOrUrl, inline)
    if (!content) {
        return undefined
    }

    const source = inline ? "inline prompts" : pathOrUrl!
    const prompts = parseContent<PromptDefinition[]>(content, source)

    // Validate that it's an array
    if (!Array.isArray(prompts)) {
        throw new Error(`Prompts must be an array, got: ${typeof prompts}`)
    }

    return prompts
}

/**
 * Load resources from path, URL, or inline JSON
 */
export async function loadResources(
    pathOrUrl?: string,
    inline?: string,
): Promise<ResourceDefinition[] | undefined> {
    const content = await loadContent(pathOrUrl, inline)
    if (!content) {
        return undefined
    }

    const source = inline ? "inline resources" : pathOrUrl!
    const resources = parseContent<ResourceDefinition[]>(content, source)

    // Validate that it's an array
    if (!Array.isArray(resources)) {
        throw new Error(`Resources must be an array, got: ${typeof resources}`)
    }

    return resources
}
