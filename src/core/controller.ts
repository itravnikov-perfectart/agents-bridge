import { EventEmitter } from "events";
import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { ClineAdapter } from "./ClineAdapter";
import { RooCodeAdapter } from "./RooCodeAdapter";
import { Queue } from "bullmq";
import { RedisConfig } from "../server/worker.config";
import Docker from "dockerode";
import { createWebSocketServer, WebSocketServerInstance } from "../server/websocket.config";
import {
  AgentMaestroConfiguration,
  DEFAULT_CONFIG,
  readConfiguration,
} from "../utils/config";
import { ExtensionStatus } from "../utils/systemInfo";
import { AgentStatus } from "./types";

/**
 * Core controller to manage Cline, RooCode and WQ Maestro extensions
 * Provides unified API access and can be used by both VSCode extension and local server
 */
export class ExtensionController extends EventEmitter {
  public readonly clineAdapter: ClineAdapter;
  public readonly rooAdapterMap: Map<string, RooCodeAdapter> = new Map();
  private currentConfig: AgentMaestroConfiguration = readConfiguration();
  public isInitialized = false;
  private activeTaskListeners: Map<string, vscode.Disposable> = new Map();
  private taskQueue?: Queue;
  private redisConfig: RedisConfig;
  private docker: Docker;
  private lastAgentIndex = 0;
  private webSocketServer?: WebSocketServerInstance;

  private workspacePath: string;

  constructor(redisConfig: RedisConfig, workspacePath?: string) {
    super();
    this.redisConfig = redisConfig;
    this.docker = new Docker();
    this.clineAdapter = new ClineAdapter();
    this.workspacePath = workspacePath || '';
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
    try {
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

    // Initialize WebSocket server
    this.webSocketServer = createWebSocketServer({
      port: this.currentConfig.wsPort,
      pingInterval: this.currentConfig.wsPingInterval
    });

    // Initialize task queue
    this.taskQueue = new Queue('agent-tasks', {
      connection: this.redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });
    logger.info('Task queue initialized');

    this.isInitialized = true;
    logger.info("Extension controller initialized successfully");

    }
    catch(err) {
      logger.error("Extension controller initialized error:", err);
    }
  }

  /**
   * Create a new container
   */
  async createContainer(image: string, options: Docker.ContainerCreateOptions): Promise<string> {
    const container = await this.docker.createContainer({
      Image: image,
      ...options
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
      exitCode: info.State.ExitCode
    };
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
   * Get detailed status of a specific agent
   */
  getAgentStatus(agentId: string): {
    state: AgentStatus;
    lastHeartbeat: number;
    containerId?: string;
  } | undefined {
    // Check RooCode adapters first
    const rooAdapter = this.rooAdapterMap.get(agentId);
    if (rooAdapter) {
      return {
        state: rooAdapter.isActive ? AgentStatus.RUNNING : AgentStatus.STOPPED,
        lastHeartbeat: rooAdapter.lastHeartbeat || 0,
        containerId: rooAdapter.containerId
      };
    }

    // Check Cline adapter if no RooCode match
    if (agentId === 'cline') {
      return {
        state: this.clineAdapter.isActive ? AgentStatus.RUNNING : AgentStatus.STOPPED,
        lastHeartbeat: this.clineAdapter.lastHeartbeat || 0,
        containerId: this.clineAdapter.containerId
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
  }): Promise<{taskId: string, agentId: string}> {
    if (!this.taskQueue) {
      throw new Error('Task queue not initialized');
    }

    // Select agent if not specified
    const agentId = task.targetAgentId || this.selectBestAgent();
    const job = await this.taskQueue.add(task.type, {
      ...task.data,
      agentId,
      workspacePath: task.workspacePath || '' // Include workspace path in job data
    }, {
      priority: task.priority || 1
    });

    if (!job.id) {
      throw new Error('Failed to create task: missing job ID');
    }

    // Broadcast task assignment via WebSocket
    if (this.webSocketServer) {
      this.webSocketServer.broadcast({
        type: 'taskAssignment',
        taskId: job.id,
        agentId,
        taskType: task.type,
        workspacePath: task.workspacePath || '', // Pass workspace path
        timestamp: Date.now()
      });
    }

    return {
      taskId: job.id,
      agentId
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<any> {
    if (!this.taskQueue) {
      throw new Error('Task queue not initialized');
    }

    const job = await this.taskQueue.getJob(taskId);
    if (!job) {
      throw new Error('Task not found');
    }

    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason
    };
  }

  private selectBestAgent(): string {
    // Simple round-robin selection from active agents
    const activeAgents = Array.from(this.rooAdapterMap.values())
      .filter(adapter => adapter.isActive)
      .map(adapter => adapter.getExtensionId());

    if (activeAgents.length === 0) {
      throw new Error('No active agents available');
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
    if (this.webSocketServer) {
      await this.webSocketServer.close();
    }

    // Cleanup Docker resources
    // (Dockerode doesn't require explicit cleanup)

    this.removeAllListeners();
    this.isInitialized = false;

    await this.clineAdapter.dispose();

    // Dispose all RooCode adapters
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
}

/**
 * Manages multiple controllers with different workspaces
 */
export class ControllerManager {
  private controllers: Map<string, ExtensionController> = new Map();
  private activeControllerId?: string;

  /**
   * Create a new controller with specified workspace
   */
  createController(id: string, redisConfig: RedisConfig, workspacePath: string): ExtensionController {
    const controller = new ExtensionController(redisConfig, workspacePath);
    this.controllers.set(id, controller);
    this.activeControllerId = id;
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
    return this.activeControllerId ? this.controllers.get(this.activeControllerId) : undefined;
  }

  /**
   * Set active controller
   */
  setActiveController(id: string): boolean {
    if (this.controllers.has(id)) {
      this.activeControllerId = id;
      return true;
    }
    return false;
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
