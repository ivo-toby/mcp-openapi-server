export class Logger {
  constructor(private verbose: boolean = true) {}

  setVerbose(verbose: boolean): void {
    this.verbose = verbose
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
}
