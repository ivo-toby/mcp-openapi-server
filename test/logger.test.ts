import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Logger } from "../src/utils/logger"

describe("Logger", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("should suppress warnings when verbose logging is disabled", () => {
    const logger = new Logger(false)

    logger.warn("warning message")

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("should suppress errors when verbose logging is disabled", () => {
    const logger = new Logger(false)

    logger.error("error message")

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("should emit warnings when verbose logging is enabled", () => {
    const logger = new Logger(true)

    logger.warn("warning message")

    expect(warnSpy).toHaveBeenCalledWith("warning message")
  })

  it("should emit errors when verbose logging is enabled", () => {
    const logger = new Logger(true)

    logger.error("error message")

    expect(errorSpy).toHaveBeenCalledWith("error message")
  })

  it("should always emit fatal errors regardless of verbose mode", () => {
    const logger = new Logger(false)

    logger.fatal("fatal message")

    expect(errorSpy).toHaveBeenCalledWith("fatal message")
  })

  it("should default setVerbose(undefined) back to enabled logging", () => {
    const logger = new Logger(false)

    logger.setVerbose(undefined)
    logger.error("error message")

    expect(errorSpy).toHaveBeenCalledWith("error message")
  })
})
