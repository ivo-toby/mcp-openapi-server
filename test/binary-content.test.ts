import { describe, it, expect, beforeAll, afterAll } from "vitest"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { OpenAPIV3 } from "openapi-types"
import { ApiClient } from "../src/api-client"
import { OpenAPISpecLoader } from "../src/openapi-loader"
import { StaticAuthProvider } from "../src/auth-provider"
import { toToolResultContent } from "../src/server"
import {
  BinaryResponse,
  decodeBase64Body,
  decodeResponseBody,
  isBinaryRequestBody,
} from "../src/utils/media-types"

// PNG signature + bytes that are invalid UTF-8 (0x89, 0xff, 0xfe, 0x00)
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0x01, 0x02,
])

describe("Issue #105: binary request and response bodies", () => {
  describe("media type helpers", () => {
    it("keeps binary response bytes intact", () => {
      const result = decodeResponseBody(PNG_BYTES, "image/png", "https://api.test/img")
      expect(result).toBeInstanceOf(BinaryResponse)
      const binary = result as BinaryResponse
      expect(binary.data.equals(PNG_BYTES)).toBe(true)
      expect(binary.mimeType).toBe("image/png")
      expect(binary.uri).toBe("https://api.test/img")
    })

    it("strips media type parameters and normalizes case", () => {
      const result = decodeResponseBody(PNG_BYTES, "Image/PNG; foo=bar") as BinaryResponse
      expect(result.mimeType).toBe("image/png")
    })

    it("parses JSON responses, including +json types", () => {
      expect(decodeResponseBody(Buffer.from('{"a":1}'), "application/json")).toEqual({ a: 1 })
      expect(
        decodeResponseBody(Buffer.from('{"title":"x"}'), "application/problem+json; charset=utf-8"),
      ).toEqual({ title: "x" })
      // Invalid JSON falls back to text (like axios' silent JSON parsing)
      expect(decodeResponseBody(Buffer.from("not json"), "application/json")).toBe("not json")
    })

    it("decodes textual responses, honouring charset", () => {
      expect(decodeResponseBody(Buffer.from("héllo"), "text/plain")).toBe("héllo")
      expect(
        decodeResponseBody(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "text/plain; charset=latin1"),
      ).toBe("café")
      expect(decodeResponseBody(Buffer.from("<svg/>"), "image/svg+xml")).toBe("<svg/>")
    })

    it("parses JSON with a UTF-8 BOM", () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf])
      expect(
        decodeResponseBody(Buffer.concat([bom, Buffer.from('{"a":1}')]), "application/json"),
      ).toEqual({ a: 1 })
      expect(decodeResponseBody(Buffer.concat([bom, Buffer.from('{"a":1}')]), undefined)).toEqual({
        a: 1,
      })
      expect(decodeResponseBody(Buffer.concat([bom, Buffer.from("hi")]), "text/plain")).toBe("hi")
    })

    it("sniffs unknown or missing content types losslessly", () => {
      expect(decodeResponseBody(Buffer.from('{"a":1}'), undefined)).toEqual({ a: 1 })
      expect(decodeResponseBody(Buffer.from("plain"), undefined)).toBe("plain")
      expect(decodeResponseBody(Buffer.from("csv,ish"), "application/vnd.custom")).toBe("csv,ish")
      expect(decodeResponseBody(PNG_BYTES, undefined)).toBeInstanceOf(BinaryResponse)
      expect(decodeResponseBody(PNG_BYTES, "application/vnd.custom")).toBeInstanceOf(BinaryResponse)
    })

    it("returns empty bodies as empty string and passes through non-byte data", () => {
      expect(decodeResponseBody(Buffer.alloc(0), "image/png")).toBe("")
      expect(decodeResponseBody({ already: "decoded" }, "application/json")).toEqual({
        already: "decoded",
      })
    })

    it("classifies binary request bodies", () => {
      expect(isBinaryRequestBody("application/octet-stream", undefined)).toBe(true)
      expect(isBinaryRequestBody("application/octet-stream", { type: "string" })).toBe(true)
      expect(isBinaryRequestBody("image/png", { type: "string", format: "binary" })).toBe(true)
      expect(isBinaryRequestBody("text/plain", { type: "string", format: "binary" })).toBe(true)
      expect(isBinaryRequestBody("application/pdf", {})).toBe(true)
      expect(isBinaryRequestBody("text/plain", { type: "string" })).toBe(false)
      // springdoc emits `*/*` for `@RequestBody String`
      expect(isBinaryRequestBody("*/*", { type: "string" })).toBe(false)
      expect(isBinaryRequestBody("*/*", { type: "string", format: "binary" })).toBe(true)
      expect(isBinaryRequestBody("*/*", undefined)).toBe(true)
      expect(isBinaryRequestBody("text/plain", undefined)).toBe(false)
      expect(isBinaryRequestBody("application/json", { type: "string", format: "binary" })).toBe(
        false,
      )
      expect(isBinaryRequestBody("multipart/form-data", { type: "object" })).toBe(false)
      expect(
        isBinaryRequestBody("application/octet-stream", { type: "string", format: "byte" }),
      ).toBe(false)
    })

    it("decodes base64, base64url and data URLs; rejects garbage", () => {
      const b64 = PNG_BYTES.toString("base64")
      expect(decodeBase64Body(b64).equals(PNG_BYTES)).toBe(true)
      expect(decodeBase64Body(PNG_BYTES.toString("base64url")).equals(PNG_BYTES)).toBe(true)
      expect(decodeBase64Body(`data:image/png;base64,${b64}`).equals(PNG_BYTES)).toBe(true)
      expect(decodeBase64Body(`${b64.slice(0, 8)}\n${b64.slice(8)}`).equals(PNG_BYTES)).toBe(true)
      expect(() => decodeBase64Body("not base64!")).toThrow(/valid base64/)
      expect(() => decodeBase64Body({ foo: 1 })).toThrow(/base64-encoded string/)
    })

    it("serializes BinaryResponse to a compact JSON form", () => {
      const json = JSON.parse(JSON.stringify(new BinaryResponse(PNG_BYTES, "image/png")))
      expect(json).toEqual({
        mimeType: "image/png",
        size: PNG_BYTES.length,
        base64: PNG_BYTES.toString("base64"),
      })
    })
  })

  describe("OpenAPISpecLoader", () => {
    const loader = new OpenAPISpecLoader()
    const spec: OpenAPIV3.Document = {
      openapi: "3.0.0",
      info: { title: "Files", version: "1.0.0" },
      paths: {
        "/files/{name}": {
          put: {
            parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
            requestBody: { required: true, content: { "application/octet-stream": {} } },
            responses: { "200": { description: "OK" } },
          },
        },
        "/images": {
          post: {
            requestBody: {
              content: { "image/png": { schema: { type: "string", format: "binary" } } },
            },
            responses: { "200": { description: "OK" } },
          },
        },
        "/notes": {
          post: {
            requestBody: { content: { "text/plain": { schema: { type: "string" } } } },
            responses: { "200": { description: "OK" } },
          },
        },
        "/users": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { name: { type: "string" } } },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }
    const tools = loader.parseOpenAPISpec(spec)

    it("exposes a base64 body for schemaless octet-stream uploads", () => {
      const tool = tools.get("PUT::files__---name")!
      const body = (tool.inputSchema.properties as any).body
      expect(body.type).toBe("string")
      expect(body.contentEncoding).toBe("base64")
      expect(body.description).toMatch(/Base64-encoded/)
      expect(tool.inputSchema.required).toEqual(["name", "body"])
      expect((tool.inputSchema as any)["x-body-encoding"]).toBe("binary")
      expect((tool.inputSchema as any)["x-content-type"]).toBe("application/octet-stream")
    })

    it("marks format: binary bodies as binary", () => {
      const tool = tools.get("POST::images")!
      expect((tool.inputSchema as any)["x-body-encoding"]).toBe("binary")
      // Optional request body (OpenAPI default) is not required
      expect(tool.inputSchema.required).toBeUndefined()
    })

    it("marks primitive text bodies as wrapped, leaves object bodies alone", () => {
      expect((tools.get("POST::notes")!.inputSchema as any)["x-body-encoding"]).toBe("wrapped")
      expect((tools.get("POST::users")!.inputSchema as any)["x-body-encoding"]).toBeUndefined()
    })
  })

  describe("toToolResultContent", () => {
    it("returns images as image content", () => {
      const content = toToolResultContent(new BinaryResponse(PNG_BYTES, "image/png"))
      expect(content).toEqual([
        { type: "image", data: PNG_BYTES.toString("base64"), mimeType: "image/png" },
      ])
    })

    it("returns audio as audio content", () => {
      const content = toToolResultContent(new BinaryResponse(PNG_BYTES, "audio/mpeg"))
      expect(content[0]).toMatchObject({ type: "audio", mimeType: "audio/mpeg" })
    })

    it("returns other binaries as an embedded resource blob", () => {
      const content = toToolResultContent(
        new BinaryResponse(PNG_BYTES, "application/pdf", "https://api.test/doc.pdf"),
      )
      expect(content[1]).toEqual({
        type: "resource",
        resource: {
          uri: "https://api.test/doc.pdf",
          mimeType: "application/pdf",
          blob: PNG_BYTES.toString("base64"),
        },
      })
    })

    it("returns text verbatim and other values as JSON", () => {
      expect(toToolResultContent("line1\nline2")).toEqual([{ type: "text", text: "line1\nline2" }])
      expect(toToolResultContent({ a: 1 })).toEqual([
        { type: "text", text: JSON.stringify({ a: 1 }, null, 2) },
      ])
    })
  })

  describe("end-to-end against a real HTTP server", () => {
    let server: http.Server
    let baseUrl: string
    let lastRequest: { method?: string; url?: string; contentType?: string; body: Buffer }

    const spec: OpenAPIV3.Document = {
      openapi: "3.0.0",
      info: { title: "Binary", version: "1.0.0" },
      paths: {
        "/image": { get: { responses: { "200": { description: "PNG" } } } },
        "/pdf": { get: { responses: { "200": { description: "PDF" } } } },
        "/text": { get: { responses: { "200": { description: "Text" } } } },
        "/json": { get: { responses: { "200": { description: "JSON" } } } },
        "/fail": { get: { responses: { "500": { description: "Error" } } } },
        "/upload": {
          post: {
            requestBody: { required: true, content: { "application/octet-stream": {} } },
            responses: { "200": { description: "OK" } },
          },
        },
        "/note": {
          post: {
            requestBody: { content: { "text/plain": { schema: { type: "string" } } } },
            responses: { "200": { description: "OK" } },
          },
        },
        "/form": {
          post: {
            requestBody: {
              content: {
                "application/x-www-form-urlencoded": {
                  schema: { type: "object", additionalProperties: { type: "string" } },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
        "/ids": {
          post: {
            requestBody: {
              content: {
                "application/json": { schema: { type: "array", items: { type: "integer" } } },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    let client: ApiClient

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        const chunks: Buffer[] = []
        req.on("data", (c) => chunks.push(c))
        req.on("end", () => {
          lastRequest = {
            method: req.method,
            url: req.url,
            contentType: req.headers["content-type"],
            body: Buffer.concat(chunks),
          }
          switch (new URL(req.url ?? "/", "http://localhost").pathname) {
            case "/image":
              res.writeHead(200, { "Content-Type": "image/png" }).end(PNG_BYTES)
              break
            case "/pdf":
              res.writeHead(200, { "Content-Type": "application/pdf" }).end(PNG_BYTES)
              break
            case "/text":
              res
                .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
                .end("hello\nworld")
              break
            case "/json":
              res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}')
              break
            case "/fail":
              res.writeHead(500, { "Content-Type": "application/json" }).end('{"error":"boom"}')
              break
            default:
              res.writeHead(200, { "Content-Type": "application/json" }).end('{"received":true}')
          }
        })
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

      const tools = new OpenAPISpecLoader().parseOpenAPISpec(spec)
      client = new ApiClient(baseUrl, new StaticAuthProvider())
      client.setTools(tools)
      client.setOpenApiSpec(spec)
    })

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    })

    it("returns PNG responses byte-for-byte", async () => {
      const result = await client.executeApiCall("GET::image", {})
      expect(result).toBeInstanceOf(BinaryResponse)
      expect((result as BinaryResponse).data.equals(PNG_BYTES)).toBe(true)
      expect(toToolResultContent(result)[0]).toEqual({
        type: "image",
        data: PNG_BYTES.toString("base64"),
        mimeType: "image/png",
      })
    })

    it("returns other binaries with the request URL as resource URI", async () => {
      const result = (await client.executeApiCall("GET::pdf", {})) as BinaryResponse
      expect(result.mimeType).toBe("application/pdf")
      expect(result.uri).toBe("api-response:///pdf")
      expect(result.data.equals(PNG_BYTES)).toBe(true)
    })

    it("still decodes text and JSON responses", async () => {
      expect(await client.executeApiCall("GET::text", {})).toBe("hello\nworld")
      expect(await client.executeApiCall("GET::json", {})).toEqual({ ok: true })
    })

    it("decodes error bodies for error messages", async () => {
      await expect(client.executeApiCall("GET::fail", {})).rejects.toThrow(
        'API request failed: Request failed with status code 500 (500: {"error":"boom"})',
      )
    })

    it("uploads base64 bodies as raw bytes with the declared Content-Type", async () => {
      await client.executeApiCall("POST::upload", { body: PNG_BYTES.toString("base64") })
      expect(lastRequest.contentType).toBe("application/octet-stream")
      expect(lastRequest.body.equals(PNG_BYTES)).toBe(true)
    })

    it("rejects invalid base64 uploads without sending a request", async () => {
      lastRequest = { body: Buffer.alloc(0) }
      await expect(client.executeApiCall("POST::upload", { body: "%%%" })).rejects.toThrow(
        /valid base64/,
      )
      expect(lastRequest.url).toBeUndefined()
    })

    it("sends text bodies unwrapped", async () => {
      await client.executeApiCall("POST::note", { body: "just text" })
      expect(lastRequest.contentType).toBe("text/plain")
      expect(lastRequest.body.toString()).toBe("just text")
    })

    it("rejects binary uploads whose payload is not in `body`", async () => {
      await expect(
        client.executeApiCall("POST::upload", { file: PNG_BYTES.toString("base64") }),
      ).rejects.toThrow(/base64-encoded in the "body" parameter \(got: file\)/)
    })

    it("lets axios form-encode free-form objects for urlencoded bodies", async () => {
      await client.executeApiCall("POST::form", { body: { a: "1", b: "two words" } })
      expect(lastRequest.contentType).toBe("application/x-www-form-urlencoded")
      expect(lastRequest.body.toString()).toBe("a=1&b=two+words")
    })

    it("never exposes the upstream host or credentials in the resource URI", async () => {
      const port = (server.address() as AddressInfo).port
      const credClient = new ApiClient(
        `http://user:s3cret@127.0.0.1:${port}/`,
        new StaticAuthProvider(),
      )
      credClient.setTools(new OpenAPISpecLoader().parseOpenAPISpec(spec))
      const pdf = (await credClient.executeApiCall("GET::pdf", {
        q: "secret-query",
      })) as BinaryResponse
      expect(pdf.uri).toBe("api-response:///pdf")
      expect(JSON.stringify(pdf)).not.toContain("s3cret")
      expect(JSON.stringify(pdf)).not.toContain("secret-query")
      expect(JSON.stringify(toToolResultContent(pdf))).not.toContain("127.0.0.1")
    })

    it("documents the body convention in GET-API-ENDPOINT-SCHEMA", async () => {
      const dynamicClient = new ApiClient(baseUrl, new StaticAuthProvider())
      dynamicClient.setOpenApiSpec(spec)
      const upload = await dynamicClient.executeApiCall("GET-API-ENDPOINT-SCHEMA", {
        endpoint: "/upload",
      })
      expect(upload.operations[0].bodyParameter).toMatchObject({ name: "body", encoding: "base64" })
      const note = await dynamicClient.executeApiCall("GET-API-ENDPOINT-SCHEMA", {
        endpoint: "/note",
      })
      expect(note.operations[0].bodyParameter).toMatchObject({ name: "body" })
      expect(note.operations[0].bodyParameter.encoding).toBeUndefined()
    })

    it("sends JSON array bodies unwrapped", async () => {
      await client.executeApiCall("POST::ids", { body: [1, 2, 3] })
      expect(lastRequest.contentType).toBe("application/json")
      expect(JSON.parse(lastRequest.body.toString())).toEqual([1, 2, 3])
    })

    it("supports binary uploads and responses via INVOKE-API-ENDPOINT (dynamic mode)", async () => {
      // No tools registered: forces the direct-request path used by dynamic mode
      const dynamicClient = new ApiClient(baseUrl, new StaticAuthProvider())
      dynamicClient.setOpenApiSpec(spec)

      await dynamicClient.executeApiCall("INVOKE-API-ENDPOINT", {
        endpoint: "/upload",
        method: "POST",
        params: { body: PNG_BYTES.toString("base64") },
      })
      expect(lastRequest.contentType).toBe("application/octet-stream")
      expect(lastRequest.body.equals(PNG_BYTES)).toBe(true)

      const result = await dynamicClient.executeApiCall("INVOKE-API-ENDPOINT", {
        endpoint: "/image",
        method: "GET",
      })
      expect((result as BinaryResponse).data.equals(PNG_BYTES)).toBe(true)
    })
  })
})
