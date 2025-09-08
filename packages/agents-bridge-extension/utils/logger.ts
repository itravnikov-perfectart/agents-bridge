import * as vscode from "vscode";

export class Logger {
  private readonly outputChannel: vscode.OutputChannel;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    this.outputChannel.appendLine(`[INFO] ${message} ${args.join(' ')}`);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    this.outputChannel.appendLine(`[WARN] ${message} ${args.join(' ')}`);
  }

  /**
   * Log an error message
   */
  error(message: string | Error, ...args: any[]): void {
    const msg = message instanceof Error ? message.message : message;
    this.outputChannel.appendLine(`[ERROR] ${msg} ${args.join(' ')}`);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    this.outputChannel.appendLine(`[DEBUG] ${message} ${args.join(' ')}`);
  }

  /**
   * Log a trace message
   */
  trace(message: string, ...args: any[]): void {
    this.outputChannel.appendLine(`[TRACE] ${message} ${args.join(' ')}`);
  }

  /**
   * Removes all output from the channel.
   */
  clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose and free associated resources.
   */
  dispose(): void {
    this.outputChannel.dispose();
  }

  /**
   * Reveal this channel in the UI.
   */
  show(preserveFocus?: boolean): void {
    this.outputChannel.show(preserveFocus);
  }

  /**
   * Hide this channel from the UI.
   */
  hide(): void {
    this.outputChannel.hide();
  }
}

export const logger = new Logger("Agents Bridge");
