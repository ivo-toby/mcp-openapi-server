export class Logger {
  private verbose: boolean

  constructor(verbose: boolean = false) {
    this.verbose = verbose
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    if (this.verbose) {
      console.warn(message, ...optionalParams)
    }
  }

  error(message: string, ...optionalParams: unknown[]): void {
    if (this.verbose) {
      console.error(message, ...optionalParams)
    }
  }
}
