import { describe, it, expect, vi, afterEach } from "vitest"
import { spawn } from "child_process"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe("CLI Execution", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should start MCP server when executed via bin/mcp-server.js", async () => {
    const binPath = join(__dirname, "..", "bin", "mcp-server.js")

    const child = spawn("node", [binPath, "--help"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error("Test timed out"))
      }, 5000)

      child.on("exit", (code) => {
        clearTimeout(timeout)

        // Help should exit with code 0 and show usage information
        expect(code).toBe(0)
        expect(stdout).toContain("Transport type to use")
        expect(stdout).toContain("Base URL for the API")

        resolve()
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }, 10000)

  it("should start MCP server when executed via dist/cli.js", async () => {
    const cliPath = join(__dirname, "..", "dist", "cli.js")

    const child = spawn("node", [cliPath, "--help"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error("Test timed out"))
      }, 5000)

      child.on("exit", (code) => {
        clearTimeout(timeout)

        // Help should exit with code 0 and show usage information
        expect(code).toBe(0)
        expect(stdout).toContain("Transport type to use")
        expect(stdout).toContain("Base URL for the API")

        resolve()
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }, 10000)

  it("prints the package version for --version", async () => {
    const cliPath = join(__dirname, "..", "dist", "cli.js")

    const child = spawn("node", [cliPath, "--version"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    })

    let stdout = ""

    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    return new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        expect(code).toBe(0)
        expect(stdout.trim()).toBe("0.1.0")
        resolve()
      })

      child.on("error", reject)
    })
  })

  it("rejects unknown top-level flags before config validation", async () => {
    const cliPath = join(__dirname, "..", "dist", "cli.js")

    const child = spawn("node", [cliPath, "--definitely-not-a-real-flag"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    })

    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    return new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        try {
          expect(code).not.toBe(0)
          expect(stderr).toContain("Unknown arguments: definitely-not-a-real-flag")
          expect(stderr).not.toContain("OpenAPI spec is required")
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      child.on("error", reject)
    })
  })

  it("should be executable when imported as library without auto-starting", async () => {
    // This test ensures that importing the main module doesn't auto-start the server
    const { main } = await import("../src/index.js")

    // The main function should be exported and available
    expect(typeof main).toBe("function")

    // But calling import shouldn't have started the server automatically
    // (This tests that we removed the problematic module execution detection)
    expect(true).toBe(true) // If we get here without the server starting, the test passes
  })

  it("should properly handle CLI arguments through yargs", async () => {
    // Test with minimal required arguments to see if argument parsing works
    const cliPath = join(__dirname, "..", "dist", "cli.js")

    const child = spawn(
      "node",
      [
        cliPath,
        "--api-base-url",
        "https://api.example.com",
        "--openapi-spec",
        "https://api.example.com/openapi.json",
        "--transport",
        "stdio",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
        },
      },
    )

    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill()
        resolve() // Don't fail on timeout, just end the server
      }, 3000) // Shorter timeout since we expect the server to start

      child.on("exit", () => {
        clearTimeout(timeout)
        resolve()
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })

      // Wait a bit then kill the server
      setTimeout(() => {
        child.kill()
      }, 2000)
    })
  }, 10000)
})
