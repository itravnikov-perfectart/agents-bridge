// Docker removed from extension
import { EventEmitter } from "events";
import * as path from "path";
import * as vscode from "vscode";
import { WebSocket } from "ws";
import { Commands } from "../commands";
import {
  AgentConfiguration,
  readConfiguration
} from "../utils/config";
import { logger } from "../utils/logger";
import { ExtensionStatus } from "../utils/systemInfo";
import { RooCodeAdapter } from "./RooCodeAdapter";
import { RooCodeEventBroadcaster } from "./RooCodeEventBroadcaster";
import {
  AgentStatus, ConnectionSource,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI, ERooCodeCommand,
  ESystemMessage, IMessageFromAgent, Message
} from "./types";

import { v4 as uuidv4 } from "uuid";

/**
 * Core controller to manage Cline, RooCode and WQ Maestro extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public readonly rooAdapterMap: Map<string, RooCodeEventBroadcaster> =
    new Map();
  private currentConfig: AgentConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListeners: Map<string, vscode.Disposable> = new Map();
  // Maintain a primary adapter reference for legacy accessors
  private rooAdapter?: RooCodeEventBroadcaster;
  private activeTaskListener?: vscode.Disposable;
  // Docker removed from extension
  private lastAgentIndex = 0;
  private ws?: WebSocket;
  private workspacePath: string;
  private currentAgentId?: string;

  constructor(workspacePath?: string) {
    super();
    // Generate unique agentId for this controller instance
    this.currentAgentId = uuidv4();
    this.workspacePath = workspacePath || "";
    this.initializeRooAdapters(this.currentConfig);

    // No periodic broadcasts - events are broadcast immediately when they occur
  }

  /**
   * Initialize RooCode adapters for default and variant identifiers
   */
  private initializeRooAdapter(config: AgentConfiguration): void {
    // Check and create adapter for default RooCode extension
    if (this.isExtensionInstalled(config.defaultRooIdentifier)) {
      const defaultAdapter = new RooCodeAdapter(config.defaultRooIdentifier);
      const defaultWrapper = new RooCodeEventBroadcaster(defaultAdapter);

      // Set up raw event broadcasting
      defaultWrapper.setRawEventCallback((eventName, ...args) => {
        try {
          const adapterExtensionId = defaultWrapper.getExtensionId();
          // Broadcast the raw, untransformed RooCode event
          this.broadcastRawRooCodeEvent(eventName, args, adapterExtensionId);
        } catch (err) {
          logger.warn("Failed to forward raw adapter event immediately", err);
        }
      });

      this.rooAdapterMap.set(config.defaultRooIdentifier, defaultWrapper);
      this.rooAdapter = defaultWrapper;
      logger.info(
        `Added RooCode adapter wrapper for: ${config.defaultRooIdentifier}`,
      );
    } else {
      logger.warn(`Extension not found: ${config.defaultRooIdentifier}`);
    }
  }

  // Backward-compat wrapper used elsewhere in the file
  private initializeRooAdapters(config: AgentConfiguration): void {
    this.initializeRooAdapter(config);
  }

  /**
   * Check if extension is installed
   */
  private isExtensionInstalled(extensionId: string): boolean {
    return !!vscode.extensions.getExtension(extensionId);
  }

  /**
   * Get RooCode adapter wrapper for specific extension ID
   */
  getRooAdapter(extensionId?: string): RooCodeEventBroadcaster | undefined {
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

    // Start a new task with the message
    try {
      const taskId = await adapter.startNewTask({
        workspacePath: this.workspacePath,
        text: message,
      });
      
      logger.info(`Started RooCode task with ID: ${taskId}`);
    } catch (error) {
      logger.error("Failed to start RooCode task:", error);
    }

    if (!adapter.isActive) {
      logger.error(
        `RooCode adapter is not active for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`,
      );
      return;
    }

    try {
      logger.info(
        `Opening RooCode with message (${extensionId || this.currentConfig.defaultRooIdentifier}): ${message}`,
      );

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
      this.rooAdapter?.initialize();
      if (!this.rooAdapter?.isActive) {
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
   * Setup message handlers for RooCode adapter wrapper
   */
  private setupRooMessageHandlers(
    id: string,
    adapter: RooCodeEventBroadcaster,
  ): void {
    const commandName = `${Commands.ExecuteRooResult}-${id}`;

    // First remove existing command if any
    if (this.activeTaskListener) {
      this.activeTaskListener.dispose();
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
        this.activeTaskListener = disposable;
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
        isInstalled: adapter?.isInstalled ?? false,
        isActive: adapter?.isActive ?? false,
        version: adapter?.getVersion(),
      };
    }

    return status;
  }

  /**
   * Get detailed status of a specific agent
   */
  getAgentStatus():
    | {
        state: AgentStatus;
        lastHeartbeat: number;
        containerId?: string;
      }
    | undefined {

    // Check RooCode adapters first
      return {
        state: this.rooAdapter?.isActive ? AgentStatus.RUNNING : AgentStatus.STOPPED,
        lastHeartbeat: this.rooAdapter?.lastHeartbeat || 0,
        containerId: this.rooAdapter?.containerId,
      };
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

    this.activeTaskListener?.dispose();

    this.rooAdapter?.dispose();
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
   * Get the unique agent ID for this controller
   */
  public getAgentId(): string {
    if (!this.currentAgentId) {
      throw new Error("Controller not properly initialized - missing agentId");
    }
    return this.currentAgentId;
  }

  /**
   * Check if WebSocket is connected
   */
  public isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if controller is busy (has active tasks)
   */
  public isBusy(): boolean {
    return this.activeTaskListeners.size > 0;
  }

  /**
   * Get count of active tasks
   */
  public getActiveTaskCount(): number {
    return this.activeTaskListeners.size;
  }

  connectToWSServer(port: number): void {
    try {
      logger.info(`Attempting to connect to WebSocket server on port ${port}`);

      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
      }

      const wsUrl = this.currentConfig.wsUrl;

      // establish a connection to the websocket server
      this.ws = new WebSocket(`ws://localhost:${port}`);
      if (!this.currentAgentId) {
        throw new Error(
          "Controller not properly initialized - missing agentId",
        );
      }
      const agentId = this.currentAgentId;

      this.ws.onopen = () => {
        logger.info(`Connected to WebSocket server on port ${port}`);

        // Identify as an agent
        const registrationMessage: Message = {
          source: ConnectionSource.Agent,
          type: ESystemMessage.Register,
          agent: {
            id: agentId,
            workspacePath: this.workspacePath,
          },
          data: {
            name: "extension-controller",
            version: "1.0.0",
            capabilities: ["roocode-integration", "task-execution"],
          },
          timestamp: Date.now(),
        };

        logger.info(
          `Sending registration message: ${JSON.stringify(registrationMessage)}`,
        );
        this.ws?.send(JSON.stringify(registrationMessage));
        // Message handler setup removed - not needed for basic functionality
      };
      this.ws.onmessage = async (event) => {
        try {
          const messageData = event.data.toString();
          const message = JSON.parse(messageData) as Message;
          logger.info(
            `[DEBUG] Agent ${this.currentAgentId} received message from WebSocket server: ${messageData}`,
          );

          switch (message.type) {
            case EMessageFromServer.Ping: {
              const pongMessage: IMessageFromAgent = {
                messageType: EMessageFromAgent.Pong,
                connectionType: ConnectionSource.Agent,
                agentId: agentId,
                details: {
                  timestamp: message.data?.timestamp ?? Date.now(),
                },
              };
              this.ws?.send(JSON.stringify(pongMessage));
              break;
            }

            case EMessageFromServer.Registered: {
              logger.info(
                `Received registered message from WebSocket server: ${messageData}`,
              );
              break;
            }

            case EMessageFromServer.RooCodeMessage:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode message from WebSocket server: ${messageData}`,
              );
              // Forward the message to RooCode
              if (message.data?.message) {
                logger.info(
                  `[DEBUG] Agent ${this.currentAgentId} forwarding to RooCode: ${message.data.message}`,
                );
                await this.sendToRooCode(message.data.message);
              } else {
                logger.warn(
                  "RooCode message received but no message content found",
                );
              }
              break;

            case EMessageFromServer.RooCodeCommand:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode command from WebSocket server: ${messageData}`,
              );
              // Handle RooCode command
              if (message.data?.command) {
                const { command, parameters, extensionId } = message.data;
                await this.handleRooCodeCommand(
                  command,
                  parameters,
                  extensionId,
                );
              } else {
                logger.warn(
                  "RooCode command received but no command found in details",
                );
              }
              break;

            case EMessageFromUI.GetActiveTaskIds: {
              try {
                const adapter = this.getRooAdapter();
                if (adapter?.isActive) {
                  const activeTaskIds = adapter.getActiveTaskIds() ?? [];
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ActiveTaskIdsResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      activeTaskIds,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ActiveTaskIdsResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      activeTaskIds: [],
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn("Failed to get active task ids:", err);
                // Send empty response on error
                const response: IMessageFromAgent = {
                  messageType: EMessageFromAgent.ActiveTaskIdsResponse,
                  connectionType: ConnectionSource.Agent,
                  agentId: agentId,
                  details: {
                    activeTaskIds: [],
                    timestamp: Date.now(),
                  },
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromUI.GetProfiles: {
              try {
                const adapter = this.getRooAdapter();
                if (adapter?.isActive) {
                  const profiles = adapter.getProfiles() ?? [];
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ProfilesResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      profiles,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ProfilesResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      profiles: [],
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn("Failed to get profiles:", err);
                // Send empty response on error
                const response: IMessageFromAgent = {
                  messageType: EMessageFromAgent.ProfilesResponse,
                  connectionType: ConnectionSource.Agent,
                  agentId: agentId,
                  details: {
                    profiles: [],
                    timestamp: Date.now(),
                  },
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromUI.GetActiveProfile: {
              try {
                const adapter = this.getRooAdapter();
                if (adapter?.isActive) {
                  const activeProfile = adapter.getActiveProfile();
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ActiveProfileResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      activeProfile,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.ActiveProfileResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      activeProfile: undefined,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn("Failed to get active profile:", err);
                // Send empty response on error
                const response: IMessageFromAgent = {
                  messageType: EMessageFromAgent.ActiveProfileResponse,
                  connectionType: ConnectionSource.Agent,
                  agentId: agentId,
                  details: {
                    activeProfile: undefined,
                    timestamp: Date.now(),
                  },
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromUI.CreateTask: {
              try {
                const text = message.data?.message ?? "";
                if (text && this.rooAdapter?.isActive) {
                  await this.sendToRooCode(text);
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.TaskStartedResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      message: text,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send error response if adapter not ready
                  const response: IMessageFromAgent = {
                    messageType: EMessageFromAgent.TaskStartedResponse,
                    connectionType: ConnectionSource.Agent,
                    agentId: agentId,
                    details: {
                      error: "RooCode adapter not ready",
                      message: text,
                      timestamp: Date.now(),
                    },
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn("Failed to start task from UI message:", err);
                // Send error response
                const response: IMessageFromAgent = {
                  messageType: EMessageFromAgent.TaskStartedResponse,
                  connectionType: ConnectionSource.Agent,
                  agentId: agentId,
                  details: {
                    error: err instanceof Error ? err.message : "Unknown error",
                    message: message.data?.message ?? "",
                    timestamp: Date.now(),
                  },
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

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
          logger.error("Failed to process WebSocket message:", error);
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
   * Broadcast raw, untransformed RooCode event to WebSocket server
   */
  private broadcastRawRooCodeEvent(
    eventName: string,
    args: any[],
    extensionId?: string,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return; // Silently return if not connected
    }

    // Create message with the raw event structure
    const eventMessage: IMessageFromAgent = {
      messageType: EMessageFromAgent.RooCodeEvent,
      connectionType: ConnectionSource.Agent,
      agentId: this.currentAgentId || "unknown-agent",
      details: {
        eventName: eventName,
        eventData: args,
        extensionId,
        timestamp: Date.now(),
      },
    };

    logger.info(
      `Broadcasting raw RooCode event [${eventName}] to server [ext=${extensionId}]: ${JSON.stringify(args)}`,
    );
    this.ws.send(JSON.stringify(eventMessage));
  }

  /**
   * Broadcast full, untransformed RooCode event to WebSocket server
   */
  private broadcastRooCodeEvent(event: any, extensionId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return; // Silently return if not connected
    }

    // Create message with the full event structure
    const eventMessage: IMessageFromAgent = {
      messageType: EMessageFromAgent.RooCodeEvent,
      connectionType: ConnectionSource.Agent,
      agentId: this.currentAgentId || "unknown-agent",
      details: {
        event: event, // Full event structure
        extensionId,
        timestamp: Date.now(),
      },
    };

    logger.info(
      `Broadcasting full RooCode event [${event.name}] to server [ext=${extensionId}]: ${JSON.stringify(event)}`,
    );
    this.ws.send(JSON.stringify(eventMessage));
  }

  /**
   * Send RooCode response back to WebSocket server for UI chat (legacy method)
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
      connectionType: ConnectionSource.Agent,
      agentId: this.currentAgentId || "unknown-agent",
      details: {
        response,
        partial,
        extensionId,
        workspacePath: this.workspacePath,
        timestamp: Date.now(),
      },
    };

    logger.info(
      `Sending RooCode ${partial ? "partial" : "final"} response to server [ext=${extensionId}]: ${response}`,
    );
    this.ws.send(JSON.stringify(responseMessage));
  }

  /**
   * Handle RooCode commands from WebSocket server
   */
  private async handleRooCodeCommand(
    command: string,
    parameters?: any,
    extensionId?: string,
  ): Promise<void> {
    try {
      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        this.sendRooCodeCommandResponse(
          command,
          false,
          `No RooCode adapter found for extension: ${extensionId || "default"}`,
          extensionId,
        );
        return;
      }

      let result: any;
      let success = true;
      let error: string | undefined;

      try {
        switch (command) {
          case ERooCodeCommand.GetStatus:
            result = {
              isReady: adapter.isReady(),
              lastHeartbeat: adapter.lastHeartbeat,
              activeTaskIds: adapter.getActiveTaskIds(),
              extensionId: adapter.getExtensionId(),
            };
            break;

          case ERooCodeCommand.GetConfiguration:
            result = adapter.getConfiguration();
            break;

          case ERooCodeCommand.SetConfiguration:
            if (parameters?.configuration) {
              await adapter.setConfiguration(parameters.configuration);
              result = { success: true, message: "Configuration updated" };
            } else {
              throw new Error("Configuration parameter required");
            }
            break;

          case ERooCodeCommand.GetProfiles:
            result = adapter.getProfiles();
            break;

          case ERooCodeCommand.GetActiveProfile:
            result = adapter.getActiveProfile();
            break;

          case ERooCodeCommand.SetActiveProfile:
            if (parameters?.name) {
              result = await adapter.setActiveProfile(parameters.name);
            } else {
              throw new Error("Profile name parameter required");
            }
            break;

          case ERooCodeCommand.CreateProfile:
            if (parameters?.name && parameters?.profile) {
              result = await adapter.createProfile(
                parameters.name,
                parameters.profile,
                parameters.activate,
              );
            } else {
              throw new Error("Profile name and profile parameters required");
            }
            break;

          case ERooCodeCommand.UpdateProfile:
            if (parameters?.name && parameters?.profile) {
              result = await adapter.updateProfile(
                parameters.name,
                parameters.profile,
                parameters.activate,
              );
            } else {
              throw new Error("Profile name and profile parameters required");
            }
            break;

          case ERooCodeCommand.DeleteProfile:
            if (parameters?.name) {
              await adapter.deleteProfile(parameters.name);
              result = { success: true, message: "Profile deleted" };
            } else {
              throw new Error("Profile name parameter required");
            }
            break;

          case ERooCodeCommand.GetTaskHistory:
            result = adapter.getTaskHistory();
            break;

          case ERooCodeCommand.GetTaskDetails:
            if (parameters?.taskId) {
              result = await adapter.getTaskWithId(parameters.taskId);
            } else {
              throw new Error("Task ID parameter required");
            }
            break;

          case ERooCodeCommand.ClearCurrentTask:
            if (parameters?.lastMessage) {
              await adapter.clearCurrentTask(parameters.lastMessage);
            } else {
              await adapter.clearCurrentTask();
            }
            result = { success: true, message: "Current task cleared" };
            break;

          case ERooCodeCommand.CancelCurrentTask:
            await adapter.cancelCurrentTask();
            result = { success: true, message: "Current task cancelled" };
            break;

          case ERooCodeCommand.ResumeTask:
            if (parameters?.taskId) {
              result = await adapter.resumeTask(parameters.taskId);
            } else {
              throw new Error("Task ID parameter required");
            }
            break;

          case ERooCodeCommand.PressPrimaryButton:
            await adapter.pressPrimaryButton();
            result = { success: true, message: "Primary button pressed" };
            break;

          case ERooCodeCommand.PressSecondaryButton:
            await adapter.pressSecondaryButton();
            result = { success: true, message: "Secondary button pressed" };
            break;

          case ERooCodeCommand.SendMessage:
            if (parameters?.message) {
              const events: any[] = [];
              for await (const event of adapter.sendMessage(
                parameters.message,
                parameters.images,
                parameters.options,
              )) {
                events.push(event);
              }
              result = { events, message: "Message sent successfully" };
            } else {
              throw new Error("Message parameter required");
            }
            break;

          case ERooCodeCommand.StartNewTask:
            if (parameters?.options) {
              const taskId = await adapter.startNewTask(parameters.options);
              result = { taskId, message: "New task started successfully" };
            } else {
              throw new Error("Task options parameter required");
            }
            break;

          default:
            throw new Error(`Unknown RooCode command: ${command}`);
        }
      } catch (cmdError) {
        success = false;
        error = (cmdError as Error).message;
        logger.error(`RooCode command '${command}' failed:`, cmdError);
      }

      this.sendRooCodeCommandResponse(
        command,
        success,
        error,
        extensionId,
        result,
      );
    } catch (error) {
      logger.error(`Error handling RooCode command '${command}':`, error);
      this.sendRooCodeCommandResponse(
        command,
        false,
        (error as Error).message,
        extensionId,
      );
    }
  }

  /**
   * Send RooCode command response to WebSocket server
   */
  private sendRooCodeCommandResponse(
    command: string,
    success: boolean,
    error?: string,
    extensionId?: string,
    result?: any,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(
        "WebSocket not connected, cannot send RooCode command response",
      );
      return;
    }

    const responseMessage: IMessageFromAgent = {
      messageType: EMessageFromAgent.RooCodeCommandResponse,
      connectionType: ConnectionSource.Agent,
      agentId: this.currentAgentId || "unknown-agent",
      details: {
        command,
        success,
        error,
        result,
        extensionId,
        timestamp: Date.now(),
      },
    };

    logger.info(
      `Sending RooCode command response [${command}] success=${success} [ext=${extensionId}]: ${error || "OK"}`,
    );
    this.ws.send(JSON.stringify(responseMessage));
  }

  /**
   * Broadcast RooCode status update to WebSocket server
   */
  public broadcastRooCodeStatus(extensionId?: string): void {
    try {
      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        logger.warn(
          `Cannot broadcast status: No RooCode adapter found for extension: ${extensionId || "default"}`,
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const statusMessage: IMessageFromAgent = {
        messageType: EMessageFromAgent.RooCodeStatus,
        connectionType: ConnectionSource.Agent,
        agentId: this.currentAgentId || "unknown-agent",
        details: {
          extensionId: adapter.getExtensionId(),
          isReady: adapter.isReady(),
          lastHeartbeat: adapter.lastHeartbeat,
          activeTaskIds: adapter.getActiveTaskIds(),
          timestamp: Date.now(),
        },
      };

      this.ws.send(JSON.stringify(statusMessage));
    } catch (error) {
      logger.error("Error broadcasting RooCode status:", error);
    }
  }

  /**
   * Broadcast RooCode configuration update to WebSocket server
   */
  public broadcastRooCodeConfiguration(extensionId?: string): void {
    try {
      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        logger.warn(
          `Cannot broadcast configuration: No RooCode adapter found for extension: ${extensionId || "default"}`,
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const configMessage: IMessageFromAgent = {
        messageType: EMessageFromAgent.RooCodeConfiguration,
        connectionType: ConnectionSource.Agent,
        agentId: this.currentAgentId || "unknown-agent",
        details: {
          extensionId: adapter.getExtensionId(),
          configuration: adapter.getConfiguration(),
          timestamp: Date.now(),
        },
      };

      this.ws.send(JSON.stringify(configMessage));
    } catch (error) {
      logger.error("Error broadcasting RooCode configuration:", error);
    }
  }

  /**
   * Broadcast RooCode profiles to WebSocket server
   */
  public broadcastRooCodeProfiles(extensionId?: string): void {
    try {
      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        logger.warn(
          `Cannot broadcast profiles: No RooCode adapter found for extension: ${extensionId || "default"}`,
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const profilesMessage: IMessageFromAgent = {
        messageType: EMessageFromAgent.RooCodeProfiles,
        connectionType: ConnectionSource.Agent,
        agentId: this.currentAgentId || "unknown-agent",
        details: {
          extensionId: adapter.getExtensionId(),
          profiles: adapter.getProfiles(),
          activeProfile: adapter.getActiveProfile(),
          timestamp: Date.now(),
        },
      };

      this.ws.send(JSON.stringify(profilesMessage));
    } catch (error) {
      logger.error("Error broadcasting RooCode profiles:", error);
    }
  }

  /**
   * Broadcast RooCode task history to WebSocket server
   */
  public broadcastRooCodeTaskHistory(extensionId?: string): void {
    try {
      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        logger.warn(
          `Cannot broadcast task history: No RooCode adapter found for extension: ${extensionId || "default"}`,
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const historyMessage: IMessageFromAgent = {
        messageType: EMessageFromAgent.RooCodeTaskHistory,
        connectionType: ConnectionSource.Agent,
        agentId: this.currentAgentId || "unknown-agent",
        details: {
          extensionId: adapter.getExtensionId(),
          taskHistory: adapter.getTaskHistory(),
          timestamp: Date.now(),
        },
      };

      this.ws.send(JSON.stringify(historyMessage));
    } catch (error) {
      logger.error("Error broadcasting RooCode task history:", error);
    }
  }
}

// ControllerManager removed - extension now uses single controller approach
