/**
 * Media type helpers used to decide how request and response bodies are encoded.
 *
 * Issue #105: binary responses were decoded as UTF-8 strings (corrupting every
 * non-UTF-8 byte) and binary request bodies were sent as JSON objects. These
 * helpers classify media types so bodies can be passed through as raw bytes.
 */

/**
 * Media types (besides image/audio/video/font) that are always binary.
 */
const KNOWN_BINARY_MEDIA_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/x-bzip2",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/java-archive",
  "application/wasm",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/protobuf",
  "application/x-protobuf",
  "application/vnd.google.protobuf",
  "application/cbor",
  "application/msgpack",
  "application/x-msgpack",
])

const BINARY_MEDIA_TYPE_PREFIXES = ["image/", "audio/", "video/", "font/"]

const TEXTUAL_MEDIA_TYPES = new Set([
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/x-www-form-urlencoded",
  "application/yaml",
  "application/x-yaml",
  "application/graphql",
  "application/sql",
  "application/csv",
  "application/x-ndjson",
  "application/jsonl",
])

/**
 * Normalize a Content-Type header value to its lower-cased media type,
 * stripping any parameters (e.g. `"Image/PNG; charset=binary"` → `"image/png"`).
 */
export function normalizeMediaType(contentType: unknown): string | undefined {
  if (typeof contentType !== "string") {
    return undefined
  }
  const mediaType = contentType.split(";")[0].trim().toLowerCase()
  return mediaType || undefined
}

/**
 * Extract the `charset` parameter from a Content-Type header value.
 */
export function getCharset(contentType: unknown): string | undefined {
  if (typeof contentType !== "string") {
    return undefined
  }
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType)
  return match?.[1]
}

export function isJsonMediaType(mediaType: string): boolean {
  return mediaType === "application/json" || mediaType.endsWith("+json")
}

export function isTextualMediaType(mediaType: string): boolean {
  if (mediaType === "image/svg+xml") {
    return true
  }
  return (
    mediaType.startsWith("text/") ||
    isJsonMediaType(mediaType) ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+xml") ||
    mediaType.endsWith("+yaml") ||
    TEXTUAL_MEDIA_TYPES.has(mediaType)
  )
}

export function isKnownBinaryMediaType(mediaType: string): boolean {
  if (isTextualMediaType(mediaType)) {
    return false
  }
  return (
    mediaType === "*/*" ||
    KNOWN_BINARY_MEDIA_TYPES.has(mediaType) ||
    mediaType.startsWith("application/vnd.openxmlformats-officedocument.") ||
    mediaType.startsWith("application/vnd.oasis.opendocument.") ||
    BINARY_MEDIA_TYPE_PREFIXES.some((prefix) => mediaType.startsWith(prefix))
  )
}

/**
 * Decide whether a request body with the given media type and (inlined) schema
 * should be sent as raw bytes rather than serialized as JSON / form data.
 */
export function isBinaryRequestBody(contentType: string | undefined, schema?: unknown): boolean {
  const mediaType = normalizeMediaType(contentType)
  if (!mediaType) {
    return false
  }

  // Structured encodings are handled by axios' own serializers
  if (
    mediaType.startsWith("multipart/") ||
    isJsonMediaType(mediaType) ||
    mediaType === "application/x-www-form-urlencoded"
  ) {
    return false
  }

  if (schema && typeof schema === "object") {
    const { type, format } = schema as { type?: unknown; format?: unknown }
    if (type === "string" && format === "binary") {
      return true
    }
    // `format: byte` means the payload itself is base64 text: send the string as-is
    if (format === "byte") {
      return false
    }
    // Objects/arrays/numbers in a non-JSON media type (e.g. XML) are not raw bytes
    if (type !== undefined && type !== "string") {
      return false
    }
    // `*/*` with a string schema is free-form text (e.g. springdoc's `@RequestBody String`)
    if (mediaType === "*/*" && type === "string") {
      return false
    }
    return isKnownBinaryMediaType(mediaType)
  }

  // No schema: anything that is not clearly textual is treated as raw bytes
  return !isTextualMediaType(mediaType)
}

/**
 * Content-Type to send for a binary request body. Wildcard media ranges from the
 * spec (e.g. `image/*`, `*\/*`) are not valid Content-Type values.
 */
export function binaryRequestContentType(contentType: string | undefined): string {
  if (!contentType || contentType.includes("*")) {
    return "application/octet-stream"
  }
  return contentType
}

const BASE64_PATTERN = /^[A-Za-z0-9+/\-_]*={0,2}$/

/**
 * Decode a binary request body supplied by a tool caller.
 * Accepts plain base64, base64url, or a `data:<type>;base64,<payload>` URL.
 *
 * @throws Error if the value is not valid base64
 */
export function decodeBase64Body(value: unknown, paramName = "body"): Buffer {
  if (Buffer.isBuffer(value)) {
    return value
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value)
  }
  if (typeof value !== "string") {
    throw new Error(`Parameter "${paramName}" must be a base64-encoded string`)
  }

  let payload = value
  const dataUrlMatch = /^data:[^,]*;base64,/i.exec(payload)
  if (dataUrlMatch) {
    payload = payload.slice(dataUrlMatch[0].length)
  }
  payload = payload.replace(/\s+/g, "")

  if (!BASE64_PATTERN.test(payload) || payload.replace(/=+$/, "").length % 4 === 1) {
    throw new Error(`Parameter "${paramName}" must be a valid base64-encoded string`)
  }

  // Node's base64 decoder accepts both the standard and the URL-safe alphabet
  return Buffer.from(payload, "base64")
}

/**
 * A non-textual HTTP response body, kept as raw bytes.
 */
export class BinaryResponse {
  constructor(
    public readonly data: Buffer,
    public readonly mimeType: string,
    public readonly uri?: string,
  ) {}

  get size(): number {
    return this.data.length
  }

  toBase64(): string {
    return this.data.toString("base64")
  }

  /**
   * Keep JSON serialization meaningful (instead of a giant byte array) for library users.
   */
  toJSON(): { mimeType: string; size: number; uri?: string; base64: string } {
    return {
      mimeType: this.mimeType,
      size: this.size,
      ...(this.uri ? { uri: this.uri } : {}),
      base64: this.toBase64(),
    }
  }
}

function toBuffer(data: unknown): Buffer | undefined {
  if (Buffer.isBuffer(data)) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return undefined
}

function decodeUtf8Strict(buffer: Buffer): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return undefined
  }
}

function decodeText(buffer: Buffer, charset: string | undefined): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(buffer)
    } catch {
      // Unknown charset label: fall back to UTF-8
    }
  }
  // TextDecoder strips a leading UTF-8 BOM (Buffer#toString keeps it, which breaks JSON.parse)
  return new TextDecoder("utf-8").decode(buffer)
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Decode a raw HTTP response body according to its Content-Type.
 *
 * - JSON types → parsed value (falls back to the text if it does not parse)
 * - textual types → string
 * - binary types → {@link BinaryResponse} with the untouched bytes
 * - unknown/missing types → text if the bytes are valid UTF-8, otherwise binary
 *
 * Values that are not raw bytes (e.g. already decoded by a custom adapter) are returned as-is.
 */
export function decodeResponseBody(data: unknown, contentType: unknown, uri?: string): unknown {
  const buffer = toBuffer(data)
  if (!buffer) {
    return data
  }

  if (buffer.length === 0) {
    return ""
  }

  const mediaType = normalizeMediaType(contentType)

  if (mediaType && isJsonMediaType(mediaType)) {
    return parseJsonOrText(decodeText(buffer, getCharset(contentType)))
  }

  if (mediaType && isTextualMediaType(mediaType)) {
    return decodeText(buffer, getCharset(contentType))
  }

  if (mediaType && isKnownBinaryMediaType(mediaType)) {
    return new BinaryResponse(buffer, mediaType, uri)
  }

  // Unknown or missing media type: only treat as text when that is lossless
  const text = decodeUtf8Strict(buffer)
  if (text !== undefined && !text.includes("\u0000")) {
    return mediaType ? text : parseJsonOrText(text)
  }

  return new BinaryResponse(buffer, mediaType ?? "application/octet-stream", uri)
}
