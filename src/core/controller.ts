import { EventEmitter } from "events";
import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { ClineAdapter } from "./ClineAdapter";
import { RooCodeAdapter } from "./RooCodeAdapter";
import {
  AgentMaestroConfiguration,
  DEFAULT_CONFIG,
  readConfiguration,
} from "../utils/config";
import { ExtensionStatus } from "../utils/systemInfo";

/**
 * Core controller to manage Cline and RooCode extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public readonly clineAdapter: ClineAdapter;
  public readonly rooAdapterMap: Map<string, RooCodeAdapter> = new Map();
  private currentConfig: AgentMaestroConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListeners: Map<string, vscode.Disposable> = new Map();

  constructor() {
    super();
    this.clineAdapter = new ClineAdapter();

    // Initialize RooCode adapters with current configuration
    this.initializeRooAdapters(this.currentConfig);
  }

  /**
   * Initialize RooCode adapters for default and variant identifiers
   */
  private initializeRooAdapters(config: AgentMaestroConfiguration): void {
    // Check and create adapter for default RooCode extension
    if (this.isExtensionInstalled(config.defaultRooIdentifier)) {
      const defaultAdapter = new RooCodeAdapter(config.defaultRooIdentifier);
      this.rooAdapterMap.set(config.defaultRooIdentifier, defaultAdapter);
      logger.info(`Added RooCode adapter for: ${config.defaultRooIdentifier}`);
    } else {
      logger.warn(`Extension not found: ${config.defaultRooIdentifier}`);
    }

    // Check and create adapters for each variant identifier
    for (const identifier of new Set([
      ...config.rooVariantIdentifiers,
      DEFAULT_CONFIG.defaultRooIdentifier,
    ])) {
      if (
        identifier !== config.defaultRooIdentifier &&
        this.isExtensionInstalled(identifier)
      ) {
        const adapter = new RooCodeAdapter(identifier);
        this.rooAdapterMap.set(identifier, adapter);
        logger.info(`Added RooCode adapter for: ${identifier}`);
      } else if (identifier !== config.defaultRooIdentifier) {
        logger.warn(`Extension not found: ${identifier}`);
      }
    }
  }

  /**
   * Check if extension is installed
   */
  private isExtensionInstalled(extensionId: string): boolean {
    return !!vscode.extensions.getExtension(extensionId);
  }

  /**
   * Get RooCode adapter for specific extension ID
   */
  getRooAdapter(extensionId?: string): RooCodeAdapter | undefined {
    return this.rooAdapterMap.get(
      extensionId || this.currentConfig.defaultRooIdentifier,
    );
  }

  /**
   * Initialize the controller by discovering and activating extensions
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info("Controller already initialized");
      return;
    }

    // Initialize ClineAdapter
    await this.clineAdapter.initialize();

    // Initialize all RooCode adapters
    for (const [id, adapter] of this.rooAdapterMap) {
      await adapter.initialize();
      this.setupRooMessageHandlers(id, adapter);
    }

    // Check if at least one adapter is active
    const hasActiveAdapter =
      this.clineAdapter.isActive ||
      Array.from(this.rooAdapterMap.values()).some(
        (adapter) => adapter.isActive,
      );

    if (!hasActiveAdapter) {
      throw new Error(
        "No active extension found. This may be due to missing installations or activation issues.",
      );
    }

    this.isInitialized = true;
    logger.info("Extension controller initialized successfully");
  }

  /**
   * Setup message handlers for RooCode adapter
   */
  private setupRooMessageHandlers(id: string, adapter: RooCodeAdapter): void {
    const disposable = vscode.commands.registerCommand(
      `agent-maestro.executeRooResult-${id}`,
      async (result: string) => {
        try {
          await this.executeRooResult(result);
        } catch (error) {
          logger.error(`Error executing RooCode result: ${error}`);
          vscode.window.showErrorMessage(
            `Failed to execute RooCode result: ${error}`,
          );
        }
      }
    );

    this.activeTaskListeners.set(id, disposable);
  }

  /**
   * Execute result received from RooCode
   */
  private async executeRooResult(result: string): Promise<void> {
    try {
      // First try to parse as JSON for structured commands
      try {
        const command = JSON.parse(result);
        if (command.type === 'execute') {
          await vscode.commands.executeCommand(command.command, ...(command.args || []));
          return;
        }
      } catch {
        // Not JSON, continue with raw execution
      }

      // Fallback to executing as raw command
      await vscode.commands.executeCommand(result);
    } catch (error) {
      logger.error(`Error executing RooCode result: ${result}`, error);
      throw error;
    }
  }

  /**
   * Get status of extensions
   */
  getExtensionStatus(): Record<string, ExtensionStatus> {
    const status: Record<string, ExtensionStatus> = {} as Record<
      string,
      ExtensionStatus
    >;

    // Cline status
    status["cline"] = {
      isInstalled: this.clineAdapter.isInstalled(),
      isActive: this.clineAdapter.isActive,
      version: this.clineAdapter.getVersion(),
    };

    // Roo variants status
    for (const [extensionId, adapter] of this.rooAdapterMap) {
      status[extensionId] = {
        isInstalled: adapter?.isInstalled() ?? false,
        isActive: adapter?.isActive ?? false,
        version: adapter?.getVersion(),
      };
    }

    return status;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.removeAllListeners();
    this.isInitialized = false;

    await this.clineAdapter.dispose();

    // Dispose all RooCode adapters
    for (const adapter of this.rooAdapterMap.values()) {
      await adapter.dispose();
    }
    this.rooAdapterMap.clear();
  }
}
