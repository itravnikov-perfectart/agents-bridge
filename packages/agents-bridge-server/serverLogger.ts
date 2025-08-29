// Simple console-based logger for server-side use (no VSCode dependency)
export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string | Error, ...args: any[]) => {
    const msg = message instanceof Error ? message.message : message;
    console.error(`[ERROR] ${msg}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.debug(`[DEBUG] ${message}`, ...args);
  },
  trace: (message: string, ...args: any[]) => {
    console.trace(`[TRACE] ${message}`, ...args);
  }
};
