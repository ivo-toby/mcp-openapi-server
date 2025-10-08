import { describe, it, expect } from "vitest"
import { readFileSync, existsSync, statSync } from "fs"
import { join } from "path"

describe("Package Structure (Issue #49)", () => {
  const packageJsonPath = join(process.cwd(), "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))

  describe("bin field configuration", () => {
    it("should have bin field as an object, not a string", () => {
      expect(packageJson.bin).toBeDefined()
      expect(typeof packageJson.bin).toBe("object")
      expect(Array.isArray(packageJson.bin)).toBe(false)
    })

    it("should define openapi-mcp-server command", () => {
      expect(packageJson.bin).toHaveProperty("openapi-mcp-server")
      expect(packageJson.bin["openapi-mcp-server"]).toBe(
        "./bin/mcp-server.js",
      )
    })

    it("should point to an existing executable file", () => {
      const binPath = join(
        process.cwd(),
        packageJson.bin["openapi-mcp-server"],
      )
      expect(existsSync(binPath)).toBe(true)

      const stats = statSync(binPath)
      expect(stats.isFile()).toBe(true)
    })
  })

  describe("files field configuration", () => {
    it("should include dist directory", () => {
      expect(packageJson.files).toBeDefined()
      expect(Array.isArray(packageJson.files)).toBe(true)
      expect(packageJson.files).toContain("dist")
    })

    it("should include bin directory", () => {
      expect(packageJson.files).toContain("bin")
    })

    it("should have both required directories for npm pack", () => {
      const requiredDirs = ["dist", "bin"]
      const missingDirs = requiredDirs.filter(
        (dir) => !packageJson.files.includes(dir),
      )

      expect(missingDirs).toEqual([])
    })
  })

  describe("package publishability", () => {
    it("should have a valid package name for scoped packages", () => {
      expect(packageJson.name).toMatch(/^@[\w-]+\/[\w-]+$/)
    })

    it("should have all required fields for npm publishing", () => {
      expect(packageJson.name).toBeDefined()
      expect(packageJson.version).toBeDefined()
      expect(packageJson.description).toBeDefined()
      expect(packageJson.license).toBeDefined()
    })
  })

  describe("bin directory contents", () => {
    it("should have mcp-server.js in bin directory", () => {
      const binDir = join(process.cwd(), "bin")
      const binFile = join(binDir, "mcp-server.js")

      expect(existsSync(binDir)).toBe(true)
      expect(existsSync(binFile)).toBe(true)
    })
  })
})
