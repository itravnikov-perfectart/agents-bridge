export class BrowserLogger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string | Error, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }

  trace(message: string, ...args: any[]): void {
    console.trace(`[TRACE] ${message}`, ...args);
  }

  clear(): void {
    console.clear();
  }

  dispose(): void {}
  show(): void {}
  hide(): void {}
}

export const logger = new BrowserLogger();