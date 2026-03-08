export class Logger {
  constructor(private verbose: boolean = true) {}

  setVerbose(verbose: boolean | undefined): void {
    this.verbose = verbose ?? true
  }

  warn(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.verbose) {
      console.warn(message, ...optionalParams)
    }
  }

  error(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.verbose) {
      console.error(message, ...optionalParams)
    }
  }

  fatal(message?: unknown, ...optionalParams: unknown[]): void {
    console.error(message, ...optionalParams)
  }
}
