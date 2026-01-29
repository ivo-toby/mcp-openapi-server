import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Logger } from "../src/utils/logger"

describe("Logger", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe("warn()", () => {
    it("should NOT call console.warn when verbose=false", () => {
      const logger = new Logger(false)
      logger.warn("warning message")
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it("should call console.warn when verbose=true", () => {
      const logger = new Logger(true)
      logger.warn("warning message")
      expect(consoleWarnSpy).toHaveBeenCalledWith("warning message")
    })
  })

  describe("error()", () => {
    it("should NOT call console.error when verbose=false", () => {
      const logger = new Logger(false)
      logger.error("error message")
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it("should call console.error when verbose=true", () => {
      const logger = new Logger(true)
      logger.error("error message")
      expect(consoleErrorSpy).toHaveBeenCalledWith("error message")
    })
  })
})
