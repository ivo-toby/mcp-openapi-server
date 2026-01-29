#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { OpenAPIServer } from "./server"
import { loadConfig } from "./config"
import { StreamableHttpServerTransport } from "./transport/StreamableHttpServerTransport"
import { loadPrompts, loadResources } from "./content-loader"
import { Logger } from "./utils/logger"

/**
 * Main entry point for CLI usage
 */
async function main(): Promise<void> {
  const logger = new Logger(true)
  try {
    const config = loadConfig()
    logger.setVerbose(config.verbose)

    // Load prompts from file/URL/inline if specified
    if (config.promptsPath || config.promptsInline) {
      const prompts = await loadPrompts(config.promptsPath, config.promptsInline)
      if (prompts) {
        config.prompts = prompts
        logger.error(`Loaded ${prompts.length} prompt(s)`)
      }
    }

    // Load resources from file/URL/inline if specified
    if (config.resourcesPath || config.resourcesInline) {
      const resources = await loadResources(config.resourcesPath, config.resourcesInline)
      if (resources) {
        config.resources = resources
        logger.error(`Loaded ${resources.length} resource(s)`)
      }
    }

    const server = new OpenAPIServer(config)

    // Choose transport based on config
    let transport: Transport
    if (config.transportType === "http") {
      transport = new StreamableHttpServerTransport(
        config.httpPort!,
        config.httpHost,
        config.endpointPath,
      )
      await server.start(transport)
      logger.error(
        `OpenAPI MCP Server running on http://${config.httpHost}:${config.httpPort}${config.endpointPath}`,
      )
    } else {
      transport = new StdioServerTransport()
      await server.start(transport)
      logger.error("OpenAPI MCP Server running on stdio")
    }
  } catch (error) {
    logger.error("Failed to start server:", error)
    process.exit(1)
  }
}

// Re-export important classes for library usage
export * from "./server"
export * from "./api-client"
export * from "./config"
export * from "./tools-manager"
export * from "./openapi-loader"
export * from "./auth-provider"
export * from "./transport/StreamableHttpServerTransport"
export * from "./prompts-manager"
export * from "./resources-manager"
export * from "./prompt-types"
export * from "./resource-types"
export * from "./utils/logger"

// Export the main function for programmatic usage
export { main }
