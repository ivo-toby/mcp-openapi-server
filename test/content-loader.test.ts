import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import axios from "axios"
import { loadPrompts, loadResources } from "../src/content-loader"

vi.mock("fs")
vi.mock("axios")

describe("content-loader", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe("loadPrompts", () => {
        it("should return undefined when no path or inline content provided", async () => {
            const result = await loadPrompts()
            expect(result).toBeUndefined()
        })

        it("should return undefined when both params are undefined", async () => {
            const result = await loadPrompts(undefined, undefined)
            expect(result).toBeUndefined()
        })

        it("should load from inline JSON", async () => {
            const inline = '[{"name":"test","template":"Hello"}]'
            const result = await loadPrompts(undefined, inline)

            expect(result).toEqual([{ name: "test", template: "Hello" }])
        })

        it("should load from local file", async () => {
            const fileContent = '[{"name":"file-prompt","template":"From file"}]'
            vi.mocked(fs.readFileSync).mockReturnValue(fileContent)

            const result = await loadPrompts("./prompts.json")

            expect(fs.readFileSync).toHaveBeenCalled()
            expect(result).toEqual([{ name: "file-prompt", template: "From file" }])
        })

        it("should load from URL", async () => {
            const urlContent = '[{"name":"url-prompt","template":"From URL"}]'
            vi.mocked(axios.get).mockResolvedValue({ data: urlContent })

            const result = await loadPrompts("https://example.com/prompts.json")

            expect(axios.get).toHaveBeenCalledWith("https://example.com/prompts.json", {
                responseType: "text",
                headers: { Accept: "application/json, application/yaml, text/yaml" },
            })
            expect(result).toEqual([{ name: "url-prompt", template: "From URL" }])
        })

        it("should prefer inline content over path", async () => {
            const inline = '[{"name":"inline","template":"Inline"}]'
            const result = await loadPrompts("./file.json", inline)

            expect(fs.readFileSync).not.toHaveBeenCalled()
            expect(result).toEqual([{ name: "inline", template: "Inline" }])
        })

        it("should throw error for non-array content", async () => {
            const inline = '{"name":"test","template":"Hello"}'

            await expect(loadPrompts(undefined, inline)).rejects.toThrow(
                "Prompts must be an array, got: object"
            )
        })

        it("should parse YAML content", async () => {
            const yamlContent = `
- name: yaml-prompt
  template: From YAML
`
            vi.mocked(fs.readFileSync).mockReturnValue(yamlContent)

            const result = await loadPrompts("./prompts.yaml")
            expect(result).toEqual([{ name: "yaml-prompt", template: "From YAML" }])
        })
    })

    describe("loadResources", () => {
        it("should return undefined when no path or inline content provided", async () => {
            const result = await loadResources()
            expect(result).toBeUndefined()
        })

        it("should load from inline JSON", async () => {
            const inline = '[{"uri":"test://uri","name":"test","text":"content"}]'
            const result = await loadResources(undefined, inline)

            expect(result).toEqual([
                { uri: "test://uri", name: "test", text: "content" },
            ])
        })

        it("should load from local file", async () => {
            const fileContent = '[{"uri":"file://uri","name":"file","text":"from file"}]'
            vi.mocked(fs.readFileSync).mockReturnValue(fileContent)

            const result = await loadResources("./resources.json")

            expect(fs.readFileSync).toHaveBeenCalled()
            expect(result).toEqual([
                { uri: "file://uri", name: "file", text: "from file" },
            ])
        })

        it("should load from URL", async () => {
            const urlContent = '[{"uri":"url://uri","name":"url","text":"from url"}]'
            vi.mocked(axios.get).mockResolvedValue({ data: urlContent })

            const result = await loadResources("https://example.com/resources.json")

            expect(axios.get).toHaveBeenCalled()
            expect(result).toEqual([
                { uri: "url://uri", name: "url", text: "from url" },
            ])
        })

        it("should throw error for non-array content", async () => {
            const inline = '{"uri":"test","name":"test","text":"content"}'

            await expect(loadResources(undefined, inline)).rejects.toThrow(
                "Resources must be an array, got: object"
            )
        })

        it("should parse YAML content", async () => {
            const yamlContent = `
- uri: yaml://uri
  name: yaml-resource
  text: From YAML
`
            vi.mocked(fs.readFileSync).mockReturnValue(yamlContent)

            const result = await loadResources("./resources.yaml")
            expect(result).toEqual([
                { uri: "yaml://uri", name: "yaml-resource", text: "From YAML" },
            ])
        })
    })

    describe("error handling", () => {
        it("should throw on non-array parsed content", async () => {
            // This is valid YAML/JSON but not an array, so should throw
            const invalid = '{"name":"test","template":"Hello"}'

            await expect(loadPrompts(undefined, invalid)).rejects.toThrow(
                "Prompts must be an array"
            )
        })

        it("should propagate file read errors", async () => {
            vi.mocked(fs.readFileSync).mockImplementation(() => {
                throw new Error("ENOENT: no such file")
            })

            await expect(loadPrompts("./nonexistent.json")).rejects.toThrow(
                "ENOENT: no such file"
            )
        })

        it("should propagate URL fetch errors", async () => {
            vi.mocked(axios.get).mockRejectedValue(new Error("Network error"))

            await expect(
                loadResources("https://example.com/resources.json")
            ).rejects.toThrow("Network error")
        })
    })
})
