#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpenAPIV3 } from "openapi-types";
import axios from "axios";
import { readFile } from "fs/promises";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema, 
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

interface OpenAPIMCPServerConfig {
  name: string;
  version: string;
  apiBaseUrl: string;
  openApiSpec: OpenAPIV3.Document | string;
  headers?: Record<string, string>;
}

function parseHeaders(headerStr?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (headerStr) {
    headerStr.split(",").forEach((header) => {
      const [key, value] = header.split(":");
      if (key && value) headers[key.trim()] = value.trim();
    });
  }
  return headers;
}

function loadConfig(): OpenAPIMCPServerConfig {
  const argv = yargs(hideBin(process.argv))
    .option("api-base-url", {
      alias: "u",
      type: "string",
      description: "Base URL for the API",
    })
    .option("openapi-spec", {
      alias: "s",
      type: "string",
      description: "Path or URL to OpenAPI specification",
    })
    .option("headers", {
      alias: "H",
      type: "string",
      description: "API headers in format 'key1:value1,key2:value2'",
    })
    .option("name", {
      alias: "n",
      type: "string",
      description: "Server name",
    })
    .option("version", {
      alias: "v",
      type: "string",
      description: "Server version",
    })
    .help().argv as any;

  // Combine CLI args and env vars, with CLI taking precedence
  const apiBaseUrl = (argv["api-base-url"] as string) || process.env.API_BASE_URL;
  const openApiSpec = (argv["openapi-spec"] as string) || process.env.OPENAPI_SPEC_PATH;

  if (!apiBaseUrl) {
    throw new Error(
      "API base URL is required (--api-base-url or API_BASE_URL)",
    );
  }
  if (!openApiSpec) {
    throw new Error(
      "OpenAPI spec is required (--openapi-spec or OPENAPI_SPEC_PATH)",
    );
  }

  const headers = parseHeaders(argv.headers as string || process.env.API_HEADERS);

  return {
    name: argv.name as string || process.env.SERVER_NAME || "mcp-openapi-server",
    version: argv.version as string || process.env.SERVER_VERSION || "1.0.0",
    apiBaseUrl,
    openApiSpec,
    headers,
  };
}

class OpenAPIMCPServer {
  private server: Server;
  private config: OpenAPIMCPServerConfig;
  private openApiSpec!: OpenAPIV3.Document;

  private tools: Map<string, Tool> = new Map();

  constructor(config: OpenAPIMCPServerConfig) {
    this.config = config;
    this.server = new Server({
      name: config.name,
      version: config.version,
    });
    this.server.onerror = (err) => {
      console.error("Server error:", err);
    };
    this.server.onclose = () => {
      console.error("Server closed");
    };

    this.initializeHandlers();
  }

  private async loadOpenAPISpec(): Promise<OpenAPIV3.Document> {
    if (typeof this.config.openApiSpec === "string") {
      if (this.config.openApiSpec.startsWith("http")) {
        // Load from URL
        const response = await axios.get(this.config.openApiSpec);
        return response.data as OpenAPIV3.Document;
      } else {
        // Load from local file
        const content = await readFile(this.config.openApiSpec, "utf-8");
        return JSON.parse(content) as OpenAPIV3.Document;
      }
    }
    return this.config.openApiSpec as OpenAPIV3.Document;
  }

  private async parseOpenAPISpec(): Promise<void> {
    this.openApiSpec = await this.loadOpenAPISpec();
    
    // Add a debugger statement for debugging
    debugger;

    // Convert each OpenAPI path to an MCP tool
    for (const [path, pathItem] of Object.entries(this.openApiSpec.paths)) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue;

        const op = operation as OpenAPIV3.OperationObject;
        // Create a clean tool ID by removing the leading slash and replacing special chars
        const cleanPath = path.replace(/^\//, "");
        const toolId = `${method.toUpperCase()}-${cleanPath}`.replace(
          /[^a-zA-Z0-9-]/g,
          "-",
        );
        console.error(`Registering tool: ${toolId}`); // Debug logging
        const tool: Tool = {
          name:
            op.operationId || op.summary || `${method.toUpperCase()} ${path}`,
          description:
            op.description ||
            `Make a ${method.toUpperCase()} request to ${path}`,
          inputSchema: {
            type: "object" as const,
            properties: {},
            required: [] as string[],
            // Add any additional properties from OpenAPI spec
          },
        };

        // Store the mapping between name and ID for reverse lookup
        console.error(`Registering tool: ${toolId} (${tool.name})`);

        // Add parameters from operation
        if (op.parameters) {
          for (const param of op.parameters) {
            if ("name" in param && "in" in param) {
              const paramSchema = param.schema as OpenAPIV3.SchemaObject;
              
              // Ensure properties object exists
              if (!tool.inputSchema.properties) {
                tool.inputSchema.properties = {};
              }
              
              tool.inputSchema.properties[param.name] = {
                type: paramSchema.type || "string",
                description: param.description || `${param.name} parameter`,
              };
              
              if (param.required) {
                if (!tool.inputSchema.required) {
                  tool.inputSchema.required = [];
                }
                (tool.inputSchema.required as string[]).push(param.name);
              }
            }
          }
        }
        this.tools.set(toolId, tool);
      }
    }
  }

  private initializeHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { params } = request;
      
      // 提取参数
      console.error("Received request:", params);
      
      // 支持通过 id 或 name 调用工具
      const id = params.id as string | undefined;
      const name = params.name as string | undefined;
      const arguments_ = params.arguments || {};
      
      console.error(`Using parameters from arguments:`, arguments_);
      
      try {
        // 调用工具
        const result = await this.callTool(id, name, arguments_);
        return result;
      } catch (error) {
        console.error("Error executing tool:", error);
        throw error;
      }
    });
  }

  private async callTool(id: string | undefined, name: string | undefined, params: Record<string, any>): Promise<any> {
    // Find tool by ID or name
    let tool: Tool | undefined;
    let toolId: string | undefined;

    // 添加调试信息
    console.error(`Looking for tool with ${id ? 'ID: ' + id : 'name: ' + name}`);
    console.error(`Total tools available: ${this.tools.size}`);

    try {
      if (id) {
        toolId = String(id).trim();
        tool = toolId ? this.tools.get(toolId) : undefined;
        console.error(`Tool lookup by ID ${toolId}: ${tool ? 'found' : 'not found'}`);
      } else if (name) {
        // Search for tool by name
        console.error(`Searching for tool by name: ${name}`);
        // 使用Array.from而不是迭代器，避免可能的无限循环
        const toolEntries = Array.from(this.tools.entries());
        for (const [tid, t] of toolEntries) {
          console.error(`Checking tool: ${tid} (${t.name})`);
          if (t.name === name) {
            tool = t;
            toolId = tid;
            console.error(`Found matching tool: ${toolId}`);
            break;
          }
        }
        
        if (!tool) {
          console.error(`No tool found with name: ${name}`);
        }
      }
      
      if (!tool || !toolId) {
        console.error(
          `Available tools: ${Array.from(this.tools.entries())
            .map(([id, t]) => `${id} (${t.name})`)
            .join(", ")}`,
        );
        throw new Error(`Tool not found: ${id || name}`);
      }

      console.error(`Executing tool: ${toolId} (${tool.name})`);

      try {
        // Extract method and path from tool ID
        const [method, ...pathParts] = toolId.split("-");
        
        // 获取原始路径，需要将 - 替换回 /，但要处理连续的破折号问题
        // 先过滤掉空字符串，避免连续破折号导致的空字符串元素
        const filteredPathParts = pathParts.filter(part => part !== "");
        let originalPath = "/" + filteredPathParts.join("/").replace(/-/g, "/");
        
        // 首先，从OpenAPI规范中查找原始路径
        let apiPath = "";
        
        // 添加调试信息
        console.error(`Looking for path matching tool ID: ${toolId} or name: ${tool.name}`);
        console.error(`Available paths: ${Object.keys(this.openApiSpec.paths || {}).join(", ")}`);
        
        // 遍历OpenAPI规范中的所有路径
        for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
          if (!pathItem) continue;
          
          for (const [pathMethod, operation] of Object.entries(pathItem)) {
            if (pathMethod === "parameters" || !operation) continue;
            
            const op = operation as OpenAPIV3.OperationObject;
            
            // 打印调试信息
            console.error(`Checking path: ${path}, method: ${pathMethod}, operationId: ${op.operationId}`);
            
            // 检查操作ID是否匹配工具名称
            if (op.operationId && op.operationId === tool.name) {
              apiPath = path;
              console.error(`Found matching operationId: ${op.operationId} at path: ${path}`);
              break;
            }
            
            // 如果操作ID不匹配，检查工具ID是否匹配
            const cleanPath = path.replace(/^\//, "");
            const currentToolId = `${pathMethod.toUpperCase()}-${cleanPath}`.replace(
              /[^a-zA-Z0-9-]/g,
              "-",
            );
            
            console.error(`Generated toolId: ${currentToolId} for path: ${path}`);
            
            if (currentToolId === toolId) {
              apiPath = path;
              console.error(`Found matching toolId: ${currentToolId} at path: ${path}`);
              break;
            }
          }
          if (apiPath) break;
        }
        
        if (!apiPath) {
          console.error(`Could not find original API path for tool: ${toolId}`);
          apiPath = originalPath; // 回退到原始路径
        } else {
          console.error(`Using API path: ${apiPath} for tool: ${toolId}`);
        }
        
        // Create a mutable copy of params
        let mutableParams = params ? { ...params } : {};

        // Ensure base URL ends with slash for proper joining
        const baseUrl = this.config.apiBaseUrl.endsWith("/")
          ? this.config.apiBaseUrl
          : `${this.config.apiBaseUrl}/`;

        // Handle path parameters (e.g., /tasks/{taskId}/start)
        let processedPath = apiPath;
        const pathParamRegex = /\{([^}]+)\}/g;
        
        // 打印路径参数替换前的信息
        console.error(`Path before parameter replacement: ${processedPath}`);
        console.error(`Available parameters:`, mutableParams);
        
        // Replace all path parameters with actual values from params
        processedPath = processedPath.replace(pathParamRegex, (match, paramName) => {
          if (mutableParams && mutableParams[paramName] !== undefined) {
            // Remove used path parameter from the params object
            const paramValue = mutableParams[paramName];
            delete mutableParams[paramName];
            
            console.error(`Replacing path parameter {${paramName}} with value: ${paramValue}`);
            
            // Return the encoded parameter value
            return encodeURIComponent(String(paramValue));
          } else {
            console.error(`Path parameter ${paramName} not provided in request`);
            throw new Error(`Missing required path parameter: ${paramName}`);
          }
        });
        
        // 打印路径参数替换后的信息
        console.error(`Path after parameter replacement: ${processedPath}`);
        
        // Remove leading slash from path to avoid double slashes
        const cleanPath = processedPath.startsWith("/") ? processedPath.slice(1) : processedPath;

        // Construct the full URL
        const url = new URL(cleanPath, baseUrl).toString();

        console.error(`Making API request: ${method.toLowerCase()} ${url}`);
        //console.error(`Base URL: ${baseUrl}`);
        //console.error(`Path: ${cleanPath}`);
        //console.error(`Raw parameters:`, mutableParams);
        //console.error(`Request headers:`, this.config.headers);

        // Prepare request configuration
        const config: any = {
          method: method.toLowerCase(),
          url: url,
          headers: this.config.headers,
        };

        // Handle different parameter types based on HTTP method
        if (method.toLowerCase() === "get") {
          // For GET requests, ensure parameters are properly structured
          if (mutableParams && Object.keys(mutableParams).length > 0) {
            // Handle array parameters properly
            const queryParams: Record<string, string> = {};
            for (const [key, value] of Object.entries(mutableParams)) {
              if (Array.isArray(value)) {
                // Join array values with commas for query params
                queryParams[key] = value.join(",");
              } else if (value !== undefined && value !== null) {
                // Convert other values to strings
                queryParams[key] = String(value);
              }
            }
            config.params = queryParams;
          }
        } else {
          // For POST, PUT, PATCH - send as body
          config.data = mutableParams;
        }

        console.error(`Processed parameters:`, config.params || config.data);

        console.error("Final request config:", config);

        try {
          // 添加超时设置
          const response = await axios({
            ...config,
            timeout: 10000 // 10秒超时
          });
          console.error("Response status:", response.status);
          console.error("Response headers:", response.headers);
          console.error("Response data:", response.data);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error("Request failed:", {
              status: error.response?.status,
              statusText: error.response?.statusText,
              data: error.response?.data,
              headers: error.response?.headers,
              message: error.message,
              code: error.code
            });
            
            // 构建详细的错误信息
            let errorMessage = `API request failed: ${error.message}`;
            if (error.response?.data) {
              errorMessage += ` - ${JSON.stringify(error.response.data)}`;
            } else if (error.code === 'ECONNABORTED') {
              errorMessage = 'API request timed out after 10 seconds';
            } else if (error.code) {
              errorMessage += ` (${error.code})`;
            }
            
            throw new Error(errorMessage);
          }
          console.error("Unknown error:", error);
          throw error;
        }

      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new Error(`API request failed: ${error.message}`);
        }
        throw error;
      }

    } catch (error) {
      console.error("Error executing tool:", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    await this.parseOpenAPISpec();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenAPI MCP Server running on stdio");
  }
}

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const server = new OpenAPIMCPServer(config);
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();

export { OpenAPIMCPServer, loadConfig };
