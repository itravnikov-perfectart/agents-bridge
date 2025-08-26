// Docker removed from extension
import { EventEmitter } from "events";
import * as path from "path";
import * as vscode from "vscode";
// Note: Using global WebSocket API available in VS Code extension host
import { Commands } from "../commands";
import {
  IMessageFromAgent,
  IMessageFromServer,
} from "../server/types";
import {
  AgentMaestroConfiguration,
  DEFAULT_CONFIG,
  readConfiguration,
} from "../utils/config";
import { logger } from "../utils/logger";
import { ExtensionStatus } from "../utils/systemInfo";
import { RooCodeAdapter } from "./RooCodeAdapter";
import { AgentStatus } from "./types";
import {
  EConnectionType,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageToServer,
} from "../server/message.enum";
import { RooCodeEventName, TaskEvent } from "@roo-code/types";

import { v4 as uuidv4 } from "uuid";

/**
 * Core controller to manage Cline, RooCode and WQ Maestro extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public readonly rooAdapterMap: Map<string, RooCodeAdapter> = new Map();
  private currentConfig: AgentMaestroConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListeners: Map<string, vscode.Disposable> = new Map();
  // Docker removed from extension
  private lastAgentIndex = 0;
  private ws?: WebSocket;
  private activeTasks: Map<string, { workspacePath: string; agentId: string }> =
    new Map();
  private workspacePath: string;
  private currentAgentId?: string;

  constructor(workspacePath?: string) {
    super();
    // Docker initialization removed
    this.workspacePath = workspacePath || "";
    this.initializeRooAdapters(this.currentConfig);
  }

  /**
   * Initialize RooCode adapters for default and variant identifiers
   */
  private initializeRooAdapters(config: AgentMaestroConfiguration): void {
    // Check and create adapter for default RooCode extension
    if (this.isExtensionInstalled(config.defaultRooIdentifier)) {
      const defaultAdapter = new RooCodeAdapter(config.defaultRooIdentifier);
      // Wire immediate forwarding of ANY Roo event arriving to the adapter
      defaultAdapter.onEvent = (event) => {
        try {
          const serialized = JSON.stringify(event);
          const adapterExtensionId = defaultAdapter.getExtensionId();
          const isPartial = !!(event as any)?.data?.message?.partial;
          this.sendRooCodeEventToServer(serialized, isPartial, adapterExtensionId);
        } catch (err) {
          logger.warn("Failed to forward adapter event immediately", err);
        }
      };
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
        adapter.onEvent = (event) => {
          try {
            const serialized = JSON.stringify(event);
            const adapterExtensionId = adapter.getExtensionId();
            const isPartial = !!(event as any)?.data?.message?.partial;
            this.sendRooCodeEventToServer(serialized, isPartial, adapterExtensionId);
          } catch (err) {
            logger.warn("Failed to forward adapter event immediately", err);
          }
        };
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
   * Send a message to RooCode via the appropriate adapter
   * This opens RooCode with the message and starts a task
   */
  async sendToRooCode(message: string, extensionId?: string): Promise<void> {
    const adapter = this.getRooAdapter(extensionId);
    if (!adapter) {
      logger.error(
        `No RooCode adapter found for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`,
      );
      return;
    }

    const taskStreams = adapter.executeRooTasks([
      {
        workspacePath: this.workspacePath,
        text: message,
      },
    ]);

    for await (const taskEvents of taskStreams) {
      const taskId = taskEvents[0]?.data?.taskId || "unknown-task";
      try {
        for (const event of taskEvents) {
          logger.info(`RooCode event for message "${message}":`, event);

          if (event.name === RooCodeEventName.Message) {
            if (event.data.message?.text) {
              const isPartial = !!event.data.message.partial;
              const adapterExtensionId = adapter.getExtensionId();
              this.sendRooCodeEventToServer(
                event.data.message.text,
                isPartial,
                adapterExtensionId,
              );
            }
          } else {
            // Forward all other RooCode events as serialized JSON for visibility in UI/logs
            const adapterExtensionId = adapter.getExtensionId();
            try {
              const serialized = JSON.stringify({
                eventName: event.name,
                taskId,
                data: event.data,
              });
              const isPartial = !!event?.data?.message?.partial;
              this.sendRooCodeEventToServer(serialized, isPartial, adapterExtensionId);
            } catch (e) {
              logger.warn("Failed to serialize RooCode event for broadcast", e);
            }
          }
        }
      } catch (error) {
        logger.error(
          `Error processing RooCode events for message "${message}":`,
          error,
        );
      }
    }

    if (!adapter.isActive) {
      logger.error(`RooCode adapter is not active for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`);
      return;
    }

    try {
      logger.info(`Opening RooCode with message (${extensionId || this.currentConfig.defaultRooIdentifier}): ${message}`);

      // The sendMessage method opens RooCode with the text and returns an async generator
      // We'll consume the generator to handle any events but don't need to wait for completion
      const messageGenerator = adapter.sendMessage(message);

      // Start consuming events in the background
      this.consumeRooCodeEvents(messageGenerator, message);

      logger.info("RooCode opened with message successfully");
    } catch (error) {
      logger.error("Failed to open RooCode with message:", error);
    }
  }

  /**
   * Consume RooCode task events in the background
   */
  private async consumeRooCodeEvents(
    eventGenerator: AsyncGenerator<any, void, unknown>,
    originalMessage: string,
  ): Promise<void> {
    try {
      for await (const event of eventGenerator) {
        logger.info(`RooCode event for message "${originalMessage}":`, event);
        // You can add specific event handling here if needed
        // For example, send status updates back to the WebSocket server
      }
      logger.info(`RooCode task completed for message: "${originalMessage}"`);
    } catch (error) {
      logger.error(
        `Error processing RooCode events for message "${originalMessage}":`,
        error,
      );
    }
  }

  /**
   * Initialize the controller by discovering and activating extensions
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info("Controller already initialized");
      return;
    }
    try {
      // Initialize all RooCode adapters
      for (const [id, adapter] of this.rooAdapterMap) {
        await adapter.initialize();
        this.setupRooMessageHandlers(id, adapter);
      }

      // Check if at least one adapter is active
      const hasActiveAdapter = Array.from(this.rooAdapterMap.values()).some(
        (adapter) => adapter.isActive,
      );

      if (!hasActiveAdapter) {
        throw new Error(
          "No active extension found. This may be due to missing installations or activation issues.",
        );
      }

      this.isInitialized = true;
      logger.info("Extension controller initialized successfully");
    } catch (err) {
      logger.error("Extension controller initialized error:", err);
    }
  }

  // Docker container methods removed from extension

  /**
   * Setup message handlers for RooCode adapter
   */
  private setupRooMessageHandlers(id: string, adapter: RooCodeAdapter): void {
    const commandName = `${Commands.ExecuteRooResult}-${id}`;

    // First remove existing command if any
    const existing = this.activeTaskListeners.get(id);
    if (existing) {
      existing.dispose();
    }

    // Check if command already exists before registering
    const commands = vscode.commands.getCommands();
    commands.then((registeredCommands) => {
      if (!registeredCommands.includes(commandName)) {
        const disposable = vscode.commands.registerCommand(
          commandName,
          async (result: string) => {
            try {
              await this.executeRooResult(result);
            } catch (error) {
              logger.error(`Error executing RooCode result: ${error}`);
              vscode.window.showErrorMessage(
                `Failed to execute RooCode result: ${error}`,
              );
            }
          },
        );
        this.activeTaskListeners.set(id, disposable);
      }
    });
  }

  /**
   * Execute result received from RooCode
   */
  private async executeRooResult(result: string): Promise<void> {
    try {
      // First try to parse as JSON for structured commands
      try {
        const command = JSON.parse(result);
        if (command.type === "execute") {
          // Execute in controller's workspace context
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const targetUri = vscode.Uri.file(this.workspacePath);

          // Find or add workspace folder
          let targetFolder = workspaceFolders?.find(
            (f) => f.uri.fsPath === this.workspacePath,
          );
          if (!targetFolder && this.workspacePath) {
            vscode.workspace.updateWorkspaceFolders(0, 0, {
              uri: targetUri,
              name: path.dirname(this.workspacePath),
            });
            targetFolder = vscode.workspace.workspaceFolders?.find(
              (f) => f.uri.fsPath === this.workspacePath,
            );
          }

          // Execute command in target workspace
          await vscode.commands.executeCommand(
            command.command,
            ...(command.args || []),
          );
          return;
        }
      } catch {
        // Not JSON, continue with raw execution
      }

      // Fallback to executing as raw command in controller's workspace
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
   * Get detailed status of a specific agent
   */
  getAgentStatus(agentId: string):
    | {
        state: AgentStatus;
        lastHeartbeat: number;
        containerId?: string;
      }
    | undefined {
    // Check RooCode adapters first
    const rooAdapter = this.rooAdapterMap.get(agentId);
    if (rooAdapter) {
      return {
        state: rooAdapter.isActive ? AgentStatus.RUNNING : AgentStatus.STOPPED,
        lastHeartbeat: rooAdapter.lastHeartbeat || 0,
        containerId: rooAdapter.containerId,
      };
    }

    return undefined;
  }

  /**
   * Get task status
   */
  async getTaskStatus(_taskId: string): Promise<any> {
    throw new Error("Task queue is not available in the extension build");
  }


  async dispose(): Promise<void> {
    // No task queue in extension

    // Cleanup WebSocket server
    if (this.ws) {
      this.ws.close();
    }

    // No Docker resources to cleanup in extension

    this.removeAllListeners();
    this.isInitialized = false;

    // Dispose all RooCode adapters and command listeners
    for (const [id, listener] of this.activeTaskListeners) {
      listener.dispose();
    }
    this.activeTaskListeners.clear();

    for (const adapter of this.rooAdapterMap.values()) {
      await adapter.dispose();
    }
    this.rooAdapterMap.clear();
  }

  /**
   * Set the workspace path for the controller
   */
  public setWorkspacePath(path: string): void {
    this.workspacePath = path;
    logger.info(`Workspace path updated to: ${path}`);
  }

  /**
   * Get current workspace path
   */
  public getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Check if controller is busy (has active tasks)
   */
  public isBusy(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Get count of active tasks
   */
  public getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  connectToWSServer(port: number): void {
    try {
      logger.info(`Attempting to connect to WebSocket server on port ${port}`);

      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
      }

      // establish a connection to the websocket server
      this.ws = new WebSocket(`ws://localhost:${port}`);
      const agentId = uuidv4();
      this.currentAgentId = agentId;

      this.ws.onopen = () => {
        logger.info(`Connected to WebSocket server on port ${port}`);

        // Identify as an agent
        const registrationMessage: IMessageFromAgent = {
          messageType: EMessageToServer.Register,
          connectionType: EConnectionType.Agent,
          agentId,
          metadata: {
            name: "extension-controller",
            version: "1.0.0",
            capabilities: ["roocode-integration", "task-execution"],
          },
        };

        logger.info(
          `Sending registration message: ${JSON.stringify(registrationMessage)}`,
        );
        this.ws?.send(JSON.stringify(registrationMessage));
      };
      this.ws.onmessage = async (event) => {
        try {
          const messageData = event.data.toString();
          const message = JSON.parse(messageData) as IMessageFromServer;
          logger.info(
            `[DEBUG] Agent ${this.currentAgentId} received message from WebSocket server: ${messageData}`,
          );

          switch (message.messageType) {
            case EMessageFromServer.Ping:
              const pongMessage: IMessageFromAgent = {
                messageType: EMessageFromAgent.Pong,
                connectionType: EConnectionType.Agent,
                agentId: agentId,
                details: {
                  timestamp: message.timestamp,
                },
              };
              this.ws?.send(JSON.stringify(pongMessage));
              logger.info("Sent pong response to WebSocket server");
              break;

            case EMessageFromServer.TaskAssigned:
              logger.info(
                `Received task assigned from WebSocket server: ${messageData}`,
              );
              break;
            case EMessageFromServer.Registered:
              logger.info(
                `Received registered message from WebSocket server: ${messageData}`,
              );
              break;

            case EMessageFromServer.RooCodeMessage:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode message from WebSocket server: ${messageData}`,
              );
              // Forward the message to RooCode
              if (message.details?.message) {
                logger.info(
                  `[DEBUG] Agent ${this.currentAgentId} forwarding to RooCode: ${message.details.message}`,
                );
                await this.sendToRooCode(message.details.message);
              } else {
                logger.warn(
                  "RooCode message received but no message content found",
                );
              }
              break;
            case EMessageFromServer.Unregistered:
              logger.info(
                `Received unregistered message from WebSocket server: ${messageData}`,
              );
              break;
            default:
              logger.info(
                `Received message from WebSocket server: ${messageData} which is not handled`,
              );
              break;
          }
        } catch (error) {
          logger.error("Failed to parse WebSocket message:", error);
          logger.info(`Raw message: ${event.data}`);
        }
      };

      this.ws.onclose = (event) => {
        logger.info(
          `Disconnected from WebSocket server - Code: ${event.code}, Reason: ${event.reason}`,
        );
      };

      this.ws.onerror = (error) => {
        logger.error(`WebSocket error:`, error);
      };
    } catch (error) {
      logger.error(`Error connecting to WebSocket server:`, error);
    }
  }

  getWsPort(): number {
    return this.currentConfig.wsPort;
  }

  /**
   * Send RooCode response back to WebSocket server for UI chat
   */
  private sendRooCodeEventToServer(
    response: string,
    partial: boolean,
    extensionId?: string,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("WebSocket not connected, cannot send RooCode response");
      return;
    }

    const responseMessage: IMessageFromAgent = {
      messageType: EMessageFromAgent.RooCodeResponse,
      connectionType: EConnectionType.Agent,
      agentId: this.currentAgentId || "unknown-agent",
      details: {
        response,
        partial,
        extensionId,
        timestamp: Date.now(),
      },
    };

    logger.info(
      `Sending RooCode ${partial ? "partial" : "final"} response to server [ext=${extensionId}]: ${response}`,
    );
    this.ws.send(JSON.stringify(responseMessage));
  }
}

// ControllerManager removed - extension now uses single controller approach
