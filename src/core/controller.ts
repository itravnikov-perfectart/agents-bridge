import { Queue, QueueEvents } from "bullmq";
import Docker from "dockerode";
import { EventEmitter } from "events";
import * as path from "path";
import * as vscode from "vscode";
// Note: Using global WebSocket API available in VS Code extension host
import { Commands } from "../commands";
import {
  IMessageFromAgent,
  IMessageFromServer,
  RedisConfig,
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

import { v4 as uuidv4 } from 'uuid';

/**
 * Core controller to manage Cline, RooCode and WQ Maestro extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public readonly rooAdapterMap: Map<string, RooCodeAdapter> = new Map();
  private currentConfig: AgentMaestroConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListeners: Map<string, vscode.Disposable> = new Map();
  private taskQueue?: Queue;
  private redisConfig: RedisConfig;
  private docker: Docker;
  private lastAgentIndex = 0;
  private ws?: WebSocket;
  private activeTasks: Map<string, { workspacePath: string; agentId: string }> =
    new Map();
  private workspacePath: string;

  constructor(redisConfig: RedisConfig, workspacePath?: string) {
    super();
    this.redisConfig = redisConfig;
    this.docker = new Docker();
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
        taskId: `task-${Date.now()}`,
        text: message,
        // metadata: {
        //   source: "vscode-extension",
        //   controllerId: this.workspacePath,
        // },
      },
    ]);

    for await (const taskEvents of taskStreams) {
      const taskId = taskEvents[0]?.data?.taskId || "unknown-task";
      try {
        for (const event of taskEvents) {
          logger.info(`RooCode event for message "${message}":`, event);

          if (event.name === RooCodeEventName.Message) {
            // const messageEvent = event as TaskEvent<RooCodeEventName.Message>;
            if (event.data.message?.text) {
              // outputChannel.appendLine(
              //   `[${taskId}] Result: ${messageEvent.data.message.text}`,
              // );
              await vscode.commands.executeCommand(
                Commands.ExecuteRooResult,
                event.data.message.text,
              );
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

    // if (!adapter.isActive) {
    //   logger.error(`RooCode adapter is not active for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`);
    //   return;
    // }

    // try {
    //   logger.info(`Opening RooCode with message (${extensionId || this.currentConfig.defaultRooIdentifier}): ${message}`);

    //   // The sendMessage method opens RooCode with the text and returns an async generator
    //   // We'll consume the generator to handle any events but don't need to wait for completion
    //   const messageGenerator = adapter.sendMessage(message);

    //   // Start consuming events in the background
    //   this.consumeRooCodeEvents(messageGenerator, message);

    //   logger.info("RooCode opened with message successfully");
    // } catch (error) {
    //   logger.error("Failed to open RooCode with message:", error);
    // }
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

      // Initialize task queue and events (with Redis fallback)
      try {
        this.taskQueue = new Queue("agent-tasks", {
          connection: this.redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          },
        });
        logger.info("Task queue initialized with Redis");
      } catch (error) {
        logger.warn(
          "Redis connection failed, task queue will be disabled:",
          error,
        );
        // Task queue will remain undefined, and we'll handle this in other methods
      }

      this.isInitialized = true;
      logger.info("Extension controller initialized successfully");
    } catch (err) {
      logger.error("Extension controller initialized error:", err);
    }
  }

  /**
   * Create a new container
   */
  async createContainer(
    image: string,
    options: Docker.ContainerCreateOptions,
  ): Promise<string> {
    const container = await this.docker.createContainer({
      Image: image,
      ...options,
    });
    return container.id;
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop();
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<any> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    return {
      id: info.Id,
      status: info.State.Status,
      running: info.State.Running,
      exitCode: info.State.ExitCode,
    };
  }

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
   * Cleanup resources
   */
  /**
   * Submit a task to the queue
   */
  async distributeTask(task: {
    type: string;
    data: any;
    priority?: number;
    targetAgentId?: string;
    workspacePath?: string; // Path to workspace directory
  }): Promise<{ taskId: string; agentId: string }> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const workspacePath = task.workspacePath || this.workspacePath;

    // Use controller's workspace path if not specified
    task.workspacePath = workspacePath;
    if (!this.taskQueue) {
      throw new Error("Task queue not initialized");
    }

    // Select agent if not specified
    const agentId = task.targetAgentId || this.selectBestAgent();
    const job = await this.taskQueue.add(
      task.type,
      {
        ...task.data,
        agentId,
        workspacePath: task.workspacePath || "", // Include workspace path in job data
      },
      {
        priority: task.priority || 1,
      },
    );

    if (!job.id) {
      throw new Error("Failed to create task: missing job ID");
    }

    // Broadcast task assignment via WebSocket
    if (this.ws) {
      const message: IMessageFromAgent = {
        messageType: EMessageFromAgent.TaskAssigned,
        connectionType: EConnectionType.Agent,
        agentId,
        details: {
          taskId: job.id,
          taskType: task.type,
          workspacePath: task.workspacePath || "", // Pass workspace path
          timestamp: Date.now(),
        },
      };

      this.ws.send(JSON.stringify(message));
    }

    // Track active task
    this.activeTasks.set(taskId, {
      workspacePath,
      agentId,
    });

    // Create queue events listener
    const queueEvents = new QueueEvents("agent-tasks", {
      connection: this.redisConfig,
    });

    // Listen for task completion with proper typing
    queueEvents.on("completed", ({ jobId }: { jobId: string }) => {
      if (jobId === taskId) {
        this.activeTasks.delete(taskId);
      }
    });

    return {
      taskId: job.id,
      agentId,
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<any> {
    if (!this.taskQueue) {
      throw new Error("Task queue not initialized");
    }

    const job = await this.taskQueue.getJob(taskId);
    if (!job) {
      throw new Error("Task not found");
    }

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  private selectBestAgent(): string {
    // Simple round-robin selection from active agents
    const activeAgents = Array.from(this.rooAdapterMap.values())
      .filter((adapter) => adapter.isActive)
      .map((adapter) => adapter.getExtensionId());

    if (activeAgents.length === 0) {
      throw new Error("No active agents available");
    }

    this.lastAgentIndex = (this.lastAgentIndex + 1) % activeAgents.length;
    return activeAgents[this.lastAgentIndex];
  }

  async dispose(): Promise<void> {
    // Cleanup task queue
    if (this.taskQueue) {
      await this.taskQueue.close();
    }

    // Cleanup WebSocket server
    if (this.ws) {
      this.ws.close();
    }

    // Cleanup Docker resources
    // (Dockerode doesn't require explicit cleanup)

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
          logger.info(`Received message from WebSocket server: ${messageData}`);

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
                `Received RooCode message from WebSocket server: ${messageData}`,
              );
              // Forward the message to RooCode
              if (message.details?.message) {
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
            case EMessageFromServer.RooCodeMessage:
              logger.info(
                `Received roocode message from WebSocket server: ${messageData}`,
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
}

/**
 * Manages multiple controllers with different workspaces
 */
export class ControllerManager {
  private controllers: Map<string, ExtensionController> = new Map();
  private activeControllerId?: string;

  constructor(private readonly context?: vscode.ExtensionContext) {}

  /**
   * Create a new controller with specified workspace
   */
  createController(
    id: string,
    redisConfig: RedisConfig,
    workspacePath: string,
  ): ExtensionController {
    if (this.controllers.has(id)) {
      logger.warn(`Controller ${id} already exists - recreating`);
      this.controllers.get(id)?.dispose();
    }

    const controller = new ExtensionController(redisConfig, workspacePath);
    this.controllers.set(id, controller);
    this.activeControllerId = id;

    logger.info(`Created new controller ${id} for workspace ${workspacePath}`);
    return controller;
  }

  /**
   * Get controller by ID
   */
  getController(id: string): ExtensionController | undefined {
    return this.controllers.get(id);
  }

  /**
   * Get active controller
   */
  getActiveController(): ExtensionController | undefined {
    return this.activeControllerId
      ? this.controllers.get(this.activeControllerId)
      : undefined;
  }

  /**
   * Set active controller
   */
  setActiveController(id: string): boolean {
    if (!this.controllers.has(id)) {
      logger.warn(`Failed to switch to controller ${id} - not found`);
      return false;
    }

    const prevController = this.activeControllerId;
    this.activeControllerId = id;

    // Log controller switch
    logger.info(
      `Switched controller from ${prevController || "none"} to ${id}`,
    );

    // Update workspace context without removing other controllers
    const controller = this.controllers.get(id)!;
    const workspacePath = controller.getWorkspacePath();

    if (workspacePath) {
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const targetUri = vscode.Uri.file(workspacePath);

      // Only add workspace if not already present
      if (!workspaceFolders.some((f) => f.uri.fsPath === workspacePath)) {
        vscode.workspace.updateWorkspaceFolders(
          workspaceFolders.length, // Add at the end
          0, // Don't remove any
          { uri: targetUri, name: path.basename(workspacePath) },
        );
      }
    }

    if (this.context) {
      this.context.globalState.update("lastActiveController", id);
    }

    // Ensure all controllers remain available
    return true;
  }

  /**
   * Remove controller
   */
  async removeController(id: string): Promise<void> {
    const controller = this.controllers.get(id);
    if (controller) {
      await controller.dispose();
      this.controllers.delete(id);
      if (this.activeControllerId === id) {
        this.activeControllerId = undefined;
      }
    }
  }

  /**
   * Get all controller IDs
   */
  getControllerIds(): string[] {
    return Array.from(this.controllers.keys());
  }

  /**
   * Cleanup all controllers
   */
  async dispose(): Promise<void> {
    for (const controller of this.controllers.values()) {
      await controller.dispose();
    }
    this.controllers.clear();
    this.activeControllerId = undefined;
  }
}
