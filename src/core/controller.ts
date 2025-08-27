import { EventEmitter } from "events";
import * as path from "path";
import * as vscode from "vscode";
// Note: Using global WebSocket API available in VS Code extension host
import { Commands } from "../commands";

import {
  AgentConfiguration,
  readConfiguration,
} from "../utils/config";
import { logger } from "../utils/logger";
import { ExtensionStatus } from "../utils/systemInfo";
import { RooCodeAdapter } from "./RooCodeAdapter";
import { AgentStatus } from "./types";
import {
  ConnectionSource,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  ESystemMessage,
  Message,
} from "./types";
import { TaskEvent as RooCodeTaskEvent } from "./types";

import { v4 as uuidv4 } from 'uuid';
import { RooCodeSettings } from "@roo-code/types";

/**
 * Core controller to manage Cline, RooCode and WQ Maestro extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public rooAdapter: RooCodeAdapter | undefined;
  private currentConfig: AgentConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListener: vscode.Disposable | undefined;
  private ws?: WebSocket;
  private workspacePath: string;
  private currentAgentId?: string;

  constructor(workspacePath?: string) {
    super();
    this.workspacePath = workspacePath || "";
    this.initializeRooAdapter(this.currentConfig);
  }

  /**
   * Initialize RooCode adapters for default and variant identifiers
   */
  private initializeRooAdapter(config: AgentConfiguration): void {
    // Check and create adapter for default RooCode extension
    if (this.isExtensionInstalled(config.defaultRooIdentifier)) {
      this.rooAdapter = new RooCodeAdapter(config.defaultRooIdentifier);
      logger.info(`Added RooCode adapter for: ${config.defaultRooIdentifier}`);
    } else {
      logger.warn(`Extension not found: ${config.defaultRooIdentifier}`);
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
  getRooAdapter(): RooCodeAdapter | undefined {
    return this.rooAdapter;
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

      this.setupRooMessageHandlers();

      this.isInitialized = true;
      logger.info("Extension controller initialized successfully");
    } catch (err) {
      logger.error("Extension controller initialized error:", err);
    }
  }

  /**
   * Setup message handlers for RooCode adapter
   */
  private setupRooMessageHandlers(): void {
    const commandName = `${Commands.ExecuteRooResult}`;

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
  getExtensionStatus(): ExtensionStatus {
    return {
      isInstalled: this.rooAdapter?.isInstalled() ?? false,
      isActive: this.rooAdapter?.isActive ?? false,
      version: this.rooAdapter?.getVersion(),
    };
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



  async dispose(): Promise<void> {

    // Cleanup WebSocket server
    if (this.ws) {
      this.ws.close();
    }

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


  connectToWSServer(port: number): void {
    try {
      logger.info(`Attempting to connect to WebSocket server on port ${port}`);

      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
      }

      const wsUrl = this.currentConfig.wsUrl;

      // establish a connection to the websocket server
      this.ws = new WebSocket(wsUrl);
      const agentId = uuidv4();
      this.currentAgentId = agentId;

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
        };

        logger.info(
          `Sending registration message: ${JSON.stringify(registrationMessage)}`,
        );
        this.ws?.send(JSON.stringify(registrationMessage));
        this.rooAdapter?.setMessageHandler((message) => {
          this.sendRooCodeResponseToServer(message);
        });
      };
      this.ws.onmessage = async (event) => {
        try {
          const messageData = event.data.toString();
          const message = JSON.parse(messageData) as Message;
          //logger.info(`[DEBUG] Agent ${this.currentAgentId} received message from WebSocket server: ${messageData}`);

          switch (message.type) {
            case EMessageFromServer.Ping:
              const pongMessage: Message = {
                source: ConnectionSource.Agent,
                type: ESystemMessage.Pong,
                agent: {
                  id: agentId,
                  workspacePath: this.workspacePath,
                },
                data: {
                  timestamp: message.timestamp,
                },
              };
              this.ws?.send(JSON.stringify(pongMessage));
              //logger.info("Sent pong response to WebSocket server");
              break;

            case EMessageFromServer.Registered:
              logger.info(
                `Received registered message from WebSocket server: ${messageData}`,
              );
              break;

            case EMessageFromUI.SendMessageToTask:
              // Send a message to an existing task in RooCode
              if (message?.data?.message) {
                logger.info(`[DEBUG] Agent ${this.currentAgentId} forwarding to RooCode: ${message.data.message}`);

                const taskId = message.data.taskId;

                this.rooAdapter?.sendMessage(message.data.message, [], {
                  taskId,
                });
                logger.info(`[DEBUG] Message sent to RooCode: ${message.data.message}`);
              } else {
                logger.warn(
                  "RooCode message received but no message content found",
                );
              }
              break;

            case EMessageFromUI.SetConfiguration:
              logger.info(`[DEBUG] Agent ${this.currentAgentId} handling setConfiguration request`);
              try {
                const configuration = message?.data?.configuration || {};
                await this.rooAdapter?.setConfiguration(configuration);
                const response: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromAgent.ConfigurationApplied,
                  agent: {
                    id: this.currentAgentId!,
                    workspacePath: this.workspacePath,
                  },
                };
                this.ws?.send(JSON.stringify(response));
              } catch (error) {
                logger.error(`Failed to set configuration for agent ${this.currentAgentId}:`, error);
              }
              break;

            case EMessageFromUI.GetActiveTaskIds:
              logger.info(`[DEBUG] Agent ${this.currentAgentId} handling getCurrentTaskStack request`);
              try {
                const taskIds = await this.rooAdapter?.getCurrentTaskStack();
                const response: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromAgent.ActiveTaskIdsResponse,
                  agent: {
                    id: this.currentAgentId!,
                    workspacePath: this.workspacePath,
                  },
                  data: { taskIds },
                };
                this.ws?.send(JSON.stringify(response));
                logger.info(`[DEBUG] Agent ${this.currentAgentId} sent active task IDs: ${taskIds}`);
              } catch (error) {
                logger.error(`Failed to get active task IDs for agent ${this.currentAgentId}:`, error);
              }
              break;

            case EMessageFromUI.GetProfiles:
                logger.info(`[DEBUG] Agent ${this.currentAgentId} handling getProfiles request`);
                try {
                  const profiles = await this.rooAdapter?.getProfiles();
                  const response: Message = {
                    source: ConnectionSource.Agent,
                    type: EMessageFromAgent.ProfilesResponse,
                    agent: {
                      id: this.currentAgentId!,
                      workspacePath: this.workspacePath,
                    },
                    data: { profiles },
                  };
                  this.ws?.send(JSON.stringify(response));
                  logger.info(`[DEBUG] Agent ${this.currentAgentId} sent profiles: ${profiles}`);
                } catch (error) {
                  logger.error(`Failed to get profiles for agent ${this.currentAgentId}:`, error);
                }
              break;

            case EMessageFromUI.GetActiveProfile:
                logger.info(`[DEBUG] Agent ${this.currentAgentId} handling getActiveProfile request`);
                try {
                  const activeProfile = await this.rooAdapter?.getActiveProfile();
                  const response: Message = {
                    source: ConnectionSource.Agent,
                    type: EMessageFromAgent.ActiveProfileResponse,
                    agent: {
                      id: this.currentAgentId!,
                      workspacePath: this.workspacePath,
                    },
                    data: { activeProfile },
                  };
                  this.ws?.send(JSON.stringify(response));
                  logger.info(`[DEBUG] Agent ${this.currentAgentId} sent active profile: ${activeProfile}`);
                } catch (error) {
                  logger.error(`Failed to get active profile for agent ${this.currentAgentId}:`, error);
                }
              break;

            case EMessageFromUI.CreateTask:
              logger.info(`[DEBUG] Agent ${this.currentAgentId} handling startNewTask request`);
              try {
                const taskMessage = message?.data?.message || "";
                const taskId = message?.data?.taskId || "";
                const profile = message?.data?.profile || "";
                const newTaskId = await this.startNewTask(taskMessage, profile);
                logger.info(`[DEBUG] Agent ${this.currentAgentId} handling startNewTask request: ${newTaskId}`);
                const response: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromAgent.TaskStartedResponse,
                  agent: {
                    id: this.currentAgentId!,
                    workspacePath: this.workspacePath,
                  },
                  data: { clientTaskId: taskId, agentTaskId: newTaskId, success: true },
                };
                this.ws?.send(JSON.stringify(response));
                logger.info(`[DEBUG] Agent ${this.currentAgentId} started new task: ${taskId}`);
              } catch (error) {
                logger.error(`Failed to start new task for agent ${this.currentAgentId}:`, error);
                const response: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromAgent.TaskStartedResponse,
                  agent: {
                    id: this.currentAgentId!,
                    workspacePath: this.workspacePath,
                  },
                  data: { success: false, error: error instanceof Error ? error.message : String(error) },
                };
                this.ws?.send(JSON.stringify(response));
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

  /**
   * Send RooCode response back to WebSocket server for UI chat
   */
  private sendRooCodeResponseToServer(event: RooCodeTaskEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("WebSocket not connected, cannot send RooCode response");
      return;
    }

    const responseMessage: Message = {
      source: ConnectionSource.Agent,
      type: EMessageFromAgent.AgentResponse,
      event: {
        eventName: event.name,
        ...event.data,
      },
      agent: {
        id: this.currentAgentId || "unknown-agent",
        workspacePath: this.workspacePath,
      },
      data: {
        timestamp: Date.now(),
      }
    };

    logger.info(`Sending RooCode response to server: ${JSON.stringify(event, null, 2)}`);
    this.ws.send(JSON.stringify(responseMessage));
  }


  async startNewTask(message: string, profile?: string, configuration?: RooCodeSettings): Promise<string> {
    if (!this.rooAdapter) {
      throw new Error(
        `No RooCode adapter found for extension: ${this.currentConfig.defaultRooIdentifier}`,
      );
    }

    try {
      // If profile is provided, set it as active
      if (profile) {
        await this.rooAdapter.setActiveProfile(profile);
      }

      const taskConfiguration = configuration || {};

      // Start new task
      const taskId = await this.rooAdapter.startNewTask({
        workspacePath: this.workspacePath,
        text: message,
        configuration: {
          autoApprovalEnabled: true,
          alwaysAllowReadOnly: true,
          alwaysAllowReadOnlyOutsideWorkspace: true,
          alwaysAllowWrite: true,
          alwaysAllowWriteOutsideWorkspace: true,
          alwaysAllowWriteProtected: true,
          writeDelayMs: 1,
          alwaysAllowBrowser: true,
          alwaysApproveResubmit: true,
          requestDelaySeconds: 1,
          alwaysAllowMcp: true,
          alwaysAllowModeSwitch: true,
          alwaysAllowSubtasks: true,
          alwaysAllowExecute: true,
          alwaysAllowFollowupQuestions: true,
          followupAutoApproveTimeoutMs: 1,
          alwaysAllowUpdateTodoList: true,
          ...taskConfiguration,
        }
      });

      logger.info(`[DEBUG] Agent ${this.currentAgentId} started new task: ${taskId} with profile: ${profile}`);

      return taskId;
    } catch (error) {
      logger.error("Failed to start new task:", error);
      throw error;
    }
  }

}