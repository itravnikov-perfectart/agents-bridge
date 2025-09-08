// Docker removed from extension
import { RooCodeEventName, RooCodeSettings } from '@roo-code/types';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import { AgentConfiguration, readConfiguration } from '../utils/config';
import { logger } from '../utils/logger';
import { ExtensionStatus } from '../utils/systemInfo';
import { RooCodeAdapter } from './RooCodeAdapter';
import { RooCodeEventBroadcaster } from './RooCodeEventBroadcaster';
import {
  AgentStatus,
  ConnectionSource,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  ERooCodeCommand,
  ESystemMessage,
  Message,
} from './types';

import { v4 as uuidv4 } from 'uuid';
import { createAutoApprovalTaskConfig } from './autoApprovalConfig';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  private ws?: WebSocket;
  private workspacePath: string;
  private currentAgentId?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout?: NodeJS.Timeout;
  // Track subtask relationships to better route messages
  private taskParentMap: Map<string, string> = new Map(); // childId -> parentId
  private parentToActiveChild: Map<string, string> = new Map(); // parentId -> active childId until unpaused

  constructor(workspacePath?: string) {
    super();
    this.workspacePath = workspacePath || '';

    // Use agentId from VS Code settings (set by Docker container), fallback to environment, then UUID
    const configuredAgentId = this.currentConfig.agentId;
    this.currentAgentId = configuredAgentId || process.env.AGENT_ID || uuidv4();

    this.initializeRooAdapters(this.currentConfig);

    logger.info(`ExtensionController initialized with agentId: ${this.currentAgentId} (from ${configuredAgentId ? 'config' : process.env.AGENT_ID ? 'env' : 'generated'})`);

    // No periodic broadcasts - events are broadcast immediately when they occur
  }

  /**
   * Initialize RooCode adapters for default and variant identifiers
   */
  private initializeRooAdapter(config: AgentConfiguration): void {
    // Check and create adapter for default RooCode extension
    logger.info(
      `[DEBUG] Initializing RooCode adapter with ID: "${config.defaultRooIdentifier}"`
    );
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
          logger.warn('Failed to forward raw adapter event immediately', err);
        }
      });

      this.rooAdapterMap.set(config.defaultRooIdentifier, defaultWrapper);
      this.rooAdapter = defaultWrapper;
      logger.info(
        `Added RooCode adapter wrapper for: ${config.defaultRooIdentifier}`
      );
      logger.info(
        `[DEBUG] Adapter stored with key: "${config.defaultRooIdentifier}"`
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
  public getRooAdapter(
    extensionId?: string
  ): RooCodeEventBroadcaster | undefined {
    return this.rooAdapterMap.get(
      extensionId || this.currentConfig.defaultRooIdentifier
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
        `No RooCode adapter found for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`
      );
      return;
    }

    // Start a new task with the message
    try {
      const taskId = await adapter.startNewTask({
        workspacePath: this.workspacePath,
        text: message,
        configuration: createAutoApprovalTaskConfig(),
      });

      logger.info(`Started RooCode task with ID: ${taskId}`);
    } catch (error) {
      logger.error('Failed to start RooCode task:', error);
    }

    if (!adapter.isActive) {
      logger.error(
        `RooCode adapter is not active for extension: ${extensionId || this.currentConfig.defaultRooIdentifier}`
      );
      return;
    }

    try {
      logger.info(
        `Opening RooCode with message (${extensionId || this.currentConfig.defaultRooIdentifier}): ${message}`
      );

      // The sendMessage method opens RooCode with the text and returns an async generator
      // We'll consume the generator to handle any events but don't need to wait for completion
      const messageGenerator = adapter.sendMessage(message);

      // Start consuming events in the background
      this.consumeRooCodeEvents(messageGenerator, message);

      logger.info('RooCode opened with message successfully');
    } catch (error) {
      logger.error('Failed to open RooCode with message:', error);
    }
  }

  /**
   * Consume RooCode task events in the background
   */
  private async consumeRooCodeEvents(
    eventGenerator: AsyncGenerator<any, void, unknown>,
    originalMessage: string
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
        error
      );
    }
  }

  /**
   * Consume task events from a task generator in the background
   */
  private async consumeTaskEvents(
    eventGenerator: AsyncGenerator<any, void, unknown>,
    taskId: string
  ): Promise<void> {
    try {
      for await (const event of eventGenerator) {
        logger.info(`Task ${taskId} event:`, event);
        // Events will be handled by the existing event listeners and broadcasted
      }
      logger.info(`Task ${taskId} completed`);
    } catch (error) {
      logger.error(`Error processing task ${taskId} events:`, error);
    }
  }

  /**
   * Initialize the controller by discovering and activating extensions
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Controller already initialized');
      return;
    }
    try {
      // Initialize all RooCode adapters
      if (this.rooAdapter) {
        await this.rooAdapter.initialize();

        // Wait for the API to be ready after initialization
        const maxWaitTime = 10000; // 10 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          try {
            if (this.rooAdapter.isReady()) {
              logger.info('RooCode API is ready');
              break;
            }
          } catch (error) {
            logger.warn('API readiness check failed:', error);
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        if (!this.rooAdapter.isActive) {
          throw new Error(
            'No active extension found. This may be due to missing installations or activation issues.'
          );
        }
      } else {
        throw new Error('No RooCode adapter found');
      }

      this.isInitialized = true;
      logger.info('Extension controller initialized successfully');
    } catch (err) {
      logger.error('Extension controller initialized error:', err);
    }
  }

  // Docker container methods removed from extension

  /**
   * Get status of extensions
   */
  public getExtensionStatus(): Record<string, ExtensionStatus> {
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
  public getAgentStatus():
    | {
        state: AgentStatus;
        lastHeartbeat: number;
        containerId?: string;
      }
    | undefined {
    // Check RooCode adapters first
    return {
      state: this.rooAdapter?.isActive
        ? AgentStatus.RUNNING
        : AgentStatus.STOPPED,
      lastHeartbeat: this.rooAdapter?.lastHeartbeat || 0,
      containerId: this.rooAdapter?.containerId,
    };
  }

  /**
   * Get task status
   */
  public async getTaskStatus(_taskId: string): Promise<any> {
    throw new Error('Task queue is not available in the extension build');
  }

  public async dispose(): Promise<void> {
    // No task queue in extension

    // Cleanup WebSocket server
    if (this.ws) {
      this.ws.close();
    }

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
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
      throw new Error('Controller not properly initialized - missing agentId');
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

  connectToWSServer(isReconnect: boolean = false): void {
    try {

      const wsUrl = this.currentConfig.wsUrl;

      logger.info(`Attempting to connect to WebSocket server on ${wsUrl}`);

      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
      }

      // Reset reconnection attempts for manual connection
      if (!isReconnect) {
        this.resetReconnectAttempts();
      }



      // establish a connection to the websocket server
      this.ws = new WebSocket(wsUrl);
      if (!this.currentAgentId) {
        throw new Error(
          'Controller not properly initialized - missing agentId'
        );
      }
      const agentId = this.currentAgentId;

      this.ws.onopen = () => {
        logger.info(`Connected to WebSocket server on ${wsUrl}`);

        // Reset reconnection attempts on successful connection
        this.resetReconnectAttempts();

        // Identify as an agent
        const registrationMessage: Message = {
          source: ConnectionSource.Agent,
          type: ESystemMessage.Register,
          agent: {
            id: agentId,
            workspacePath: this.workspacePath,
          },
          data: {
            name: 'extension-controller',
            version: '1.0.0',
            capabilities: ['roocode-integration', 'task-execution'],
          },
          timestamp: Date.now(),
        };

        logger.info(
          `Sending registration message: ${JSON.stringify(registrationMessage)}`
        );
        this.ws?.send(JSON.stringify(registrationMessage));
        // Message handler setup removed - not needed for basic functionality
      };
      this.ws.onmessage = async (event) => {
        try {
          const messageData = event.data.toString();
          const message = JSON.parse(messageData) as Message;
          // Only log non-ping messages to reduce noise
          if (message.type !== EMessageFromServer.Ping) {
            logger.info(
              `[DEBUG] Agent ${this.currentAgentId} received message from WebSocket server: ${messageData}`
            );
          }

          switch (message.type) {
            case EMessageFromServer.Ping: {
              const pongMessage: Message = {
                type: EMessageFromAgent.Pong,
                source: ConnectionSource.Agent,
                agent: {
                  id: agentId,
                },
                data: {
                  timestamp: message.data?.timestamp ?? Date.now(),
                },
                timestamp: Date.now(),
              };
              this.ws?.send(JSON.stringify(pongMessage));
              // Ping-pong handled silently - no logging
              break;
            }

            case EMessageFromServer.Registered: {
              logger.info(
                `Received registered message from WebSocket server: ${messageData}`
              );
              break;
            }

            case EMessageFromServer.RooCodeMessage:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode message from WebSocket server: ${messageData}`
              );
              // Forward the message to RooCode
              if (message.data?.message) {
                logger.info(
                  `[DEBUG] Agent ${this.currentAgentId} forwarding to RooCode: ${message.data.message}`
                );
                await this.sendToRooCode(message.data.message);
              } else {
                logger.warn(
                  'RooCode message received but no message content found'
                );
              }
              break;

            case EMessageFromServer.RooCodeCommand:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode command from WebSocket server: ${messageData}`
              );
              // Handle RooCode command
              if (message.data?.command) {
                const { command, parameters, extensionId } = message.data;
                await this.handleRooCodeCommand(
                  command,
                  parameters,
                  extensionId
                );
              } else {
                logger.warn(
                  'RooCode command received but no command found in details'
                );
              }
              break;

            case EMessageFromUI.RooCodeCommand:
              logger.info(
                `[DEBUG] Agent ${this.currentAgentId} processing RooCode command from UI: ${messageData}`
              );
              if (message.data?.command) {
                const { command, parameters, extensionId } = message.data;
                await this.handleRooCodeCommand(
                  command,
                  parameters,
                  extensionId
                );
              } else {
                logger.warn(
                  'RooCode UI command received but no command found in details'
                );
              }
              break;

            case EMessageFromUI.GetActiveTaskIds: {
              try {
                const adapter = this.getRooAdapter();
                if (adapter?.isActive) {
                  // Prefer live event queues; fall back to RooCode's current task stack
                  const eventQueueIds = adapter.getActiveTaskIds() ?? [];
                  let stackIds: string[] = [];
                  try {
                    stackIds = adapter.getCurrentTaskStack() ?? [];
                  } catch {}
                  const activeTaskIds = Array.from(
                    new Set([...(eventQueueIds || []), ...(stackIds || [])])
                  );
                  const response: Message = {
                    type: EMessageFromAgent.ActiveTaskIdsResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { activeTaskIds },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: Message = {
                    type: EMessageFromAgent.ActiveTaskIdsResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { activeTaskIds: [] },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn('Failed to get active task ids:', err);
                // Send empty response on error
                const response: Message = {
                  type: EMessageFromAgent.ActiveTaskIdsResponse,
                  source: ConnectionSource.Agent,
                  agent: { id: agentId },
                  data: { activeTaskIds: [] },
                  timestamp: Date.now(),
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
                  const response: Message = {
                    type: EMessageFromAgent.ProfilesResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { profiles },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: Message = {
                    type: EMessageFromAgent.ProfilesResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { profiles: [] },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn('Failed to get profiles:', err);
                // Send empty response on error
                const response: Message = {
                  type: EMessageFromAgent.ProfilesResponse,
                  source: ConnectionSource.Agent,
                  agent: { id: agentId },
                  data: { profiles: [] },
                  timestamp: Date.now(),
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
                  const response: Message = {
                    type: EMessageFromAgent.ActiveProfileResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { activeProfile },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: Message = {
                    type: EMessageFromAgent.ActiveProfileResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { activeProfile: undefined },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn('Failed to get active profile:', err);
                // Send empty response on error
                const response: Message = {
                  type: EMessageFromAgent.ActiveProfileResponse,
                  source: ConnectionSource.Agent,
                  agent: { id: agentId },
                  data: { activeProfile: undefined },
                  timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromUI.CreateTask: {
              try {
                const text = message.data?.message ?? '';
                const clientTaskId = message.data?.taskId as string | undefined;
                const profile = message.data?.profile as string | undefined;
                const initialMode = message.data?.mode as string | undefined;
                const adapter = this.getRooAdapter();

                logger.info(
                  `Processing CreateTask message: text="${text}", clientTaskId="${clientTaskId}", profile="${profile} ", initialMode="${initialMode}"`
                );

                if (text && adapter) {
                  // Ensure adapter is initialized and ready
                  if (!adapter.isActive) {
                    logger.info(
                      'Adapter not active, initializing before starting task'
                    );
                    await adapter.initialize();

                    // Wait a bit for the extension to fully activate
                    await new Promise((r) => setTimeout(r, 1000));
                  }

                  // Wait for RooCode API readiness with timeout
                  const waitStart = Date.now();
                  const waitTimeoutMs = 10000; // Increased timeout to 10 seconds

                  while (Date.now() - waitStart < waitTimeoutMs) {
                    try {
                      if (adapter.isReady()) break;
                    } catch (error) {
                      logger.warn(`API readiness check failed: ${error}`);
                    }
                    await new Promise((r) => setTimeout(r, 200));
                  }


                  if (!adapter.isReady()) {
                    logger.info('RooCode API not ready after 10 seconds');
                    /*
                    const response: Message = {
                      type: EMessageFromAgent.TaskStartedResponse,
                      source: ConnectionSource.Agent,
                      agent: { id: agentId },
                      data: {
                        error: 'RooCode API not ready after 10 seconds',
                        clientTaskId,
                        message: text,
                      },
                      timestamp: Date.now(),
                    };
                    this.ws?.send(JSON.stringify(response));
                    break;
                    */
                  }

                  // Start task via RooCode adapter to obtain the concrete taskId from TaskCreated event
                  // Note: adapter.startNewTask returns an AsyncGenerator (event stream), not an ID
                  let agentTaskId: string | undefined = undefined;

                  try {
                    const taskGenerator = adapter.startNewTask({
                      workspacePath: this.workspacePath,
                      text,
                      configuration: createAutoApprovalTaskConfig({
                        mode: initialMode,
                      }),
                      ...(profile ? { profile } : {}),
                    });

                    // Consume the first event to get the taskId from TaskCreated event
                    const firstEvent = await taskGenerator.next();

                    if (
                      firstEvent.value &&
                      firstEvent.value.name === RooCodeEventName.TaskCreated
                    ) {
                      agentTaskId = firstEvent.value.data?.taskId;
                      logger.info(`Task created with ID: ${agentTaskId}`);
                    } else {
                      logger.warn(
                        `First event was not TaskCreated:`,
                        firstEvent.value
                      );
                    }

                    // Continue consuming events in the background
                    this.consumeTaskEvents(
                      taskGenerator,
                      agentTaskId || 'unknown'
                    );
                  } catch (error) {
                    logger.error('Failed to start new task:', error);
                  }

                  const response: Message = {
                    type: EMessageFromAgent.TaskStartedResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { clientTaskId, agentTaskId, message: text },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));

                  // If UI provided desired initial mode, send a mode switch request
                  if (agentTaskId && initialMode) {
                    try {
                      const initialSlug = this.mapModeSlug(initialMode);
                      await (adapter as any).api?.setMode(initialSlug);
                    } catch (err) {
                      logger.warn('Failed to apply initial mode:', err);
                    }
                  }
                } else {
                  // Send error response if adapter not ready
                  logger.warn(
                    `[DEBUG] Task creation failed - text="${text}", adapter=${!!adapter}`
                  );
                  const response: Message = {
                    type: EMessageFromAgent.TaskStartedResponse,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: {
                      error: 'RooCode adapter not found or empty message',
                      clientTaskId,
                      message: text,
                    },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn('Failed to start task from UI message:', err);
                // Send error response
                const response: Message = {
                  type: EMessageFromAgent.TaskStartedResponse,
                  source: ConnectionSource.Agent,
                  agent: { id: agentId },
                  data: {
                    error: err instanceof Error ? err.message : 'Unknown error',
                    clientTaskId: message.data?.taskId,
                    message: message.data?.message ?? '',
                  },
                  timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromServer.Unregistered:
              logger.info(
                `Received unregistered message from WebSocket server: ${messageData}`
              );
              break;

            case EMessageFromUI.SendMessageToTask: {
              try {
                const taskId = message.data?.taskId as string;
                const messageText = message.data?.message as string;
                const adapter = this.getRooAdapter();

                if (taskId && messageText && adapter?.isActive) {
                  logger.info(
                    `Sending message to task ${taskId}: ${messageText}`
                  );

                  // First resume the task to make it current, then send the message
                  await adapter.resumeTask(taskId);

                  // Wait a bit for the task to be resumed
                  await new Promise((resolve) => setTimeout(resolve, 500));

                  // Now send the message to the current (resumed) task
                  const messageStream = adapter.sendMessage(messageText);

                  // Process the message stream
                  for await (const event of messageStream) {
                    // Events will be handled by the existing event listeners
                    logger.debug(`Message stream event: ${event.eventName}`);
                  }

                  logger.info(`Message sent to task ${taskId} successfully`);
                } else {
                  logger.warn(
                    `Cannot send message to task: taskId=${taskId}, message=${messageText}, adapterActive=${adapter?.isActive}`
                  );
                }
              } catch (error) {
                logger.error(`Error sending message to task: ${error}`);
              }
              break;
            }

            case EMessageFromUI.GetConfiguration: {
              try {
                const adapter = this.getRooAdapter();
                if (adapter?.isActive) {
                  const rooCodeConfiguration = adapter.getConfiguration();
                  const response: Message = {
                    type: EMessageFromAgent.RooCodeConfiguration,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { rooCodeConfiguration },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                } else {
                  // Send empty response if adapter not ready
                  const response: Message = {
                    type: EMessageFromAgent.RooCodeConfiguration,
                    source: ConnectionSource.Agent,
                    agent: { id: agentId },
                    data: { rooCodeConfiguration: undefined },
                    timestamp: Date.now(),
                  };
                  this.ws?.send(JSON.stringify(response));
                }
              } catch (err) {
                logger.warn('Failed to get active profile:', err);
                // Send empty response on error
                const response: Message = {
                  type: EMessageFromAgent.ActiveProfileResponse,
                  source: ConnectionSource.Agent,
                  agent: { id: agentId },
                  data: { activeProfile: undefined },
                  timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(response));
              }
              break;
            }

            case EMessageFromUI.SetConfiguration: {
              try {
                const configuration = message.data?.configuration as RooCodeSettings;
                const adapter = this.getRooAdapter();
                if (adapter) {
                  adapter.setConfiguration(configuration);
                } else {
                  logger.error(`No RooCode adapter found`);
                }

                logger.info(`Configuration updated: ${JSON.stringify(configuration)}`);
              } catch (error) {
                logger.error(`Error setting configuration: ${error}`);
              }
              break;
            }

            case EMessageFromUI.CloneRepo: {
              try {
                logger.info(`[DEBUG] Agent ${this.currentAgentId} processing CloneRepo command from UI`);

                const { repoUrl, gitToken } = message.data || {};
                if (!repoUrl) {
                  throw new Error('Repository URL is required');
                }

                await this.cloneRepository(repoUrl, gitToken);

                // Send success response
                const response: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromServer.RepoCloned,
                  agent: { id: this.currentAgentId },
                  data: { repoUrl, success: true },
                  timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(response));

              } catch (error) {
                logger.error(`Error cloning repository: ${error}`);

                // Send error response
                const errorResponse: Message = {
                  source: ConnectionSource.Agent,
                  type: EMessageFromServer.RepoCloneError,
                  agent: { id: this.currentAgentId },
                  data: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    repoUrl: message.data?.repoUrl
                  },
                  timestamp: Date.now(),
                };
                this.ws?.send(JSON.stringify(errorResponse));
              }
              break;
            }

            default:
              logger.info(
                `Received message from WebSocket server: ${messageData} which is not handled`
              );
              break;
          }
        } catch (error) {
          logger.error('Failed to process WebSocket message:', error);
          logger.info(`Raw message: ${event.data}`);
        }
      };

      this.ws.onclose = (event) => {
        logger.info(
          `Disconnected from WebSocket server - Code: ${event.code}, Reason: ${event.reason}`
        );

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        logger.error(`WebSocket error:`, JSON.stringify(error));
      };
    } catch (error) {
      logger.error(`Error connecting to WebSocket server:`, error);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.reconnectAttempts++;

    logger.info(
      `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    this.reconnectTimeout = setTimeout(() => {
      logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connectToWSServer(true);
    }, delay);
  }

  /**
   * Reset reconnection attempts (called on successful connection)
   */
  private resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  /** Map UI mode names to Roo mode slugs */
  private mapModeSlug(mode?: string): string | undefined {
    if (!mode) return undefined;
    const normalized = String(mode).toLowerCase();
    if (normalized === 'orchestrator') return 'architect';
    return normalized;
  }

  /**
   * Clone a Git repository and open it as workspace
   */
  private async cloneRepository(repoUrl: string, gitToken?: string): Promise<void> {
    try {
      // Extract repository name from URL for folder naming
      const repoName = this.extractRepoName(repoUrl);

      // Create target directory path
      let targetPath: string;
      const existingWorkspace = vscode.workspace.workspaceFolders?.[0];

      if (existingWorkspace) {
        // If workspace is open, clone into it
        targetPath = existingWorkspace.uri.fsPath;
        logger.info(`Cloning repository ${repoUrl} into existing workspace: ${targetPath}`);
      } else {
        // If no workspace, create a new folder and open it
        const homeDir = os.homedir();
        const projectsDir = path.join(homeDir, 'Projects');
        targetPath = path.join(projectsDir, repoName);

        // Create the projects directory if it doesn't exist
        if (!fs.existsSync(projectsDir)) {
          fs.mkdirSync(projectsDir, { recursive: true });
        }

        // Create the target directory
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }

        logger.info(`Created new directory for repository: ${targetPath}`);
      }

      // Prepare clone URL with token if provided
      let cloneUrl = repoUrl;
      if (gitToken) {
        const url = new URL(repoUrl);
        if (url.hostname === 'github.com') {
          cloneUrl = `https://${gitToken}@github.com${url.pathname}`;
        } else {
          // For other git providers, try adding token as username
          cloneUrl = repoUrl.replace('https://', `https://${gitToken}@`);
        }
      }

      // Use VS Code's integrated terminal to clone
      const terminal = vscode.window.createTerminal({
        name: 'Git Clone',
        cwd: existingWorkspace ? targetPath : path.dirname(targetPath),
      });

      // Show terminal and execute clone command
      terminal.show();

      if (existingWorkspace) {
        // Clone into existing workspace (current directory)
        terminal.sendText(`git clone ${cloneUrl} .`, true);
      } else {
        // Clone into new directory
        terminal.sendText(`git clone ${cloneUrl} "${repoName}"`, true);
      }

      // Wait for clone to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // If no existing workspace, open the cloned repository as workspace
      if (!existingWorkspace) {
        const folderUri = vscode.Uri.file(targetPath);
        await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
        logger.info(`Opened cloned repository as workspace: ${targetPath}`);
      }

      logger.info(`Repository ${repoUrl} cloned successfully`);

      // Show success message to user
      const message = existingWorkspace
        ? `Repository cloned successfully into current workspace`
        : `Repository cloned and opened as new workspace: ${repoName}`;
      vscode.window.showInformationMessage(message);

    } catch (error) {
      logger.error(`Failed to clone repository: ${error}`);
      throw error;
    }
  }

  /**
   * Extract repository name from Git URL
   */
  private extractRepoName(repoUrl: string): string {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      const repoName = pathParts[pathParts.length - 1];
      // Remove .git extension if present
      return repoName.replace(/\.git$/, '');
    } catch (error) {
      // Fallback: extract from the end of the URL
      const parts = repoUrl.split('/');
      const lastPart = parts[parts.length - 1];
      return lastPart.replace(/\.git$/, '') || 'cloned-repo';
    }
  }

  /**
   * Broadcast raw, untransformed RooCode event to WebSocket server
   */
  private broadcastRawRooCodeEvent(
    eventName: string,
    args: any[],
    extensionId?: string
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return; // Silently return if not connected
    }

    // Map important RooCode events to AgentResponse for UI consumption
    try {
      // Console log for debugging Roo events
      // eslint-disable-next-line no-console
      console.log('[RooEvent]', eventName, {
        args,
        extensionId,
        agentId: this.currentAgentId,
      });

      if (eventName === RooCodeEventName.Message) {
        const data = args?.[0] || {};
        let taskId = data.taskId;
        let parentTaskId: string | undefined = undefined;

        // If this message is for a parent that currently has an active child, route to the child
        if (taskId && this.parentToActiveChild.has(taskId)) {
          const childId = this.parentToActiveChild.get(taskId)!;
          parentTaskId = taskId;
          taskId = childId;
        } else if (typeof taskId === 'string' && this.taskParentMap.has(taskId)) {
          // Or attach known parent if message already belongs to a child
          parentTaskId = this.taskParentMap.get(taskId);
        }
        const agentResponse: Message = {
          type: EMessageFromAgent.AgentResponse,
          source: ConnectionSource.Agent,
          agent: { id: this.currentAgentId || 'unknown-agent' },
          event: {
            eventName: RooCodeEventName.Message,
            taskId,
            ...(parentTaskId ? { parentTaskId } : {}),
            ...(parentTaskId ? { isSubtask: true } : {}),
            message: data.message,
          } as any,
          timestamp: Date.now(),
        };
        logger.info(
          `[WS->Server] Sending AgentResponse: ${RooCodeEventName.Message} taskId=${taskId}${parentTaskId ? ` (parent=${parentTaskId})` : ''}`
        );
        this.ws.send(JSON.stringify(agentResponse));
        return;
      }

      if (eventName === RooCodeEventName.TaskCreated) {
        const taskId = args?.[0];
        const agentResponse: Message = {
          type: EMessageFromAgent.AgentResponse,
          source: ConnectionSource.Agent,
          agent: { id: this.currentAgentId || 'unknown-agent' },
          event: {
            eventName: RooCodeEventName.TaskCreated,
            taskId,
          } as any,
          timestamp: Date.now(),
        };
        logger.info(
          `[WS->Server] Sending AgentResponse: ${RooCodeEventName.TaskCreated} taskId=${taskId}`
        );
        this.ws.send(JSON.stringify(agentResponse));
        return;
      }

      if (eventName === RooCodeEventName.TaskSpawned) {
        const parentTaskId = args?.[0];
        const childTaskId = args?.[1];
        const agentResponse: Message = {
          type: EMessageFromAgent.AgentResponse,
          source: ConnectionSource.Agent,
          agent: { id: this.currentAgentId || 'unknown-agent' },
          event: {
            eventName: RooCodeEventName.TaskSpawned,
            parentTaskId,
            childTaskId,
          } as any,
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(agentResponse));

        // Track relationship for routing and UI
        try {
          if (parentTaskId && childTaskId) {
            this.taskParentMap.set(String(childTaskId), String(parentTaskId));
            this.parentToActiveChild.set(String(parentTaskId), String(childTaskId));
            logger.info(`Tracked subtask relationship parent=${parentTaskId} -> child=${childTaskId}`);
          }
        } catch {}

        // Reinforce auto-approval settings for newly spawned subtask context (fire-and-forget)
        try {
          const adapter = this.getRooAdapter();
          if (adapter?.isActive) {
            const current = adapter.getConfiguration();
            Promise.resolve(
              adapter.setConfiguration({
                ...current,
                autoApprovalEnabled: true,
                alwaysAllowSubtasks: true,
                alwaysAllowFollowupQuestions: true,
                alwaysAllowUpdateTodoList: true,
                alwaysAllowExecute: true,
              } as any)
            )
              .then(() => {
                logger.info(`Auto-approval reinforced for spawned subtask ${childTaskId}`);
              })
              .catch((e) => {
                logger.warn('Failed to reinforce auto-approval on TaskSpawned:', e);
              });
          }
        } catch (e) {
          logger.warn('Failed to schedule auto-approval reinforcement on TaskSpawned:', e);
        }
        return;
      }

      if (eventName === (RooCodeEventName as any).TaskPaused) {
        // Nothing to do explicitly; we rely on TaskSpawned to set mapping
        return;
      }

      if (eventName === (RooCodeEventName as any).TaskUnpaused) {
        const parentTaskId = args?.[0];
        try {
          if (parentTaskId && this.parentToActiveChild.has(String(parentTaskId))) {
            this.parentToActiveChild.delete(String(parentTaskId));
            logger.info(`Cleared active child mapping for parent=${parentTaskId} on unpause`);
          }
        } catch {}
        // Fall through to generic event broadcast
      }

      if (eventName === RooCodeEventName.TaskAborted) {
        const taskId = args?.[0];
        const agentResponse: Message = {
          type: EMessageFromAgent.AgentResponse,
          source: ConnectionSource.Agent,
          agent: { id: this.currentAgentId || 'unknown-agent' },
          event: {
            eventName: RooCodeEventName.TaskAborted,
            taskId,
          } as any,
          timestamp: Date.now(),
        };
        logger.info(
          `[WS->Server] Sending AgentResponse: ${RooCodeEventName.TaskAborted} taskId=${taskId}`
        );
        this.ws.send(JSON.stringify(agentResponse));
        return;
      }

      // Fallback: send generic RooCodeEvent
      const eventMessage: Message = {
        type: EMessageFromAgent.RooCodeEvent,
        source: ConnectionSource.Agent,
        agent: { id: this.currentAgentId || 'unknown-agent' },
        data: { eventName, eventData: args, extensionId },
        timestamp: Date.now(),
      };
      logger.info(`[WS->Server] Sending RooCodeEvent: ${eventName}`);
      this.ws.send(JSON.stringify(eventMessage));
    } catch (err) {
      logger.warn('Failed to serialize/broadcast RooCode raw event', err);
    }
  }

  /**
   * Safely extract taskId from parameters, handling various data types
   */
  private extractTaskId(
    parameters: any,
    paramName: string = 'taskId'
  ): string | null {
    if (!parameters || !parameters[paramName]) {
      return null;
    }

    const value = parameters[paramName];

    // If it's already a string, return it
    if (typeof value === 'string') {
      return value;
    }

    // If it's an object, try to extract meaningful data
    if (typeof value === 'object' && value !== null) {
      // If it's an empty object, return null
      if (Object.keys(value).length === 0) {
        return null;
      }

      // Try to find a taskId-like property in the object
      if (value.taskId && typeof value.taskId === 'string') {
        return value.taskId;
      }

      // If no meaningful data, stringify the object
      return JSON.stringify(value);
    }

    // Convert other types to string
    return String(value);
  }

  /**
   * Handle RooCode commands from WebSocket server
   */
  private async handleRooCodeCommand(
    command: string,
    parameters?: any,
    extensionId?: string
  ): Promise<void> {
    try {
      // Log the command and parameters for debugging
      logger.info(`Processing RooCode command: ${command}`, {
        parameters: parameters,
        extensionId: extensionId,
        parameterTypes: parameters
          ? Object.keys(parameters).reduce(
              (acc, key) => {
                acc[key] = typeof parameters[key];
                return acc;
              },
              {} as Record<string, string>
            )
          : {},
        parameterValues: parameters
          ? Object.keys(parameters).reduce(
              (acc, key) => {
                acc[key] = parameters[key];
                return acc;
              },
              {} as Record<string, any>
            )
          : {},
      });

      const adapter = this.getRooAdapter(extensionId);
      if (!adapter) {
        this.sendRooCodeCommandResponse(
          command,
          false,
          `No RooCode adapter found for extension: ${extensionId || 'default'}`,
          extensionId
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
              result = { success: true, message: 'Configuration updated' };
            } else {
              throw new Error('Configuration parameter required');
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
              throw new Error('Profile name parameter required');
            }
            break;

          case ERooCodeCommand.CreateProfile:
            if (parameters?.name && parameters?.profile) {
              result = await adapter.createProfile(
                parameters.name,
                parameters.profile,
                parameters.activate
              );
            } else {
              throw new Error('Profile name and profile parameters required');
            }
            break;

          case ERooCodeCommand.UpdateProfile:
            if (parameters?.name && parameters?.profile) {
              result = await adapter.updateProfile(
                parameters.name,
                parameters.profile,
                parameters.activate
              );
            } else {
              throw new Error('Profile name and profile parameters required');
            }
            break;

          case ERooCodeCommand.DeleteProfile:
            if (parameters?.name) {
              await adapter.deleteProfile(parameters.name);
              result = { success: true, message: 'Profile deleted' };
            } else {
              throw new Error('Profile name parameter required');
            }
            break;

          case ERooCodeCommand.GetTaskHistory:
            result = adapter.getTaskHistory();
            break;

          case ERooCodeCommand.GetTaskDetails:
            const taskId = this.extractTaskId(parameters);
            if (taskId) {
              logger.info(`Getting task with ID: ${taskId}`);
              result = await adapter.getTaskWithId(taskId);
            } else {
              throw new Error('Task ID parameter required');
            }
            break;

          case ERooCodeCommand.ClearCurrentTask:
            if (parameters?.lastMessage) {
              await adapter.clearCurrentTask(parameters.lastMessage);
            } else {
              await adapter.clearCurrentTask();
            }
            result = { success: true, message: 'Current task cleared' };
            break;

          case ERooCodeCommand.CancelCurrentTask:
            await adapter.cancelCurrentTask();
            result = { success: true, message: 'Current task cancelled' };
            break;

          case ERooCodeCommand.ResumeTask:
            const resumeTaskId = this.extractTaskId(parameters);
            if (resumeTaskId) {
              logger.info(`Resuming task with ID: ${resumeTaskId}`);
              result = await adapter.resumeTask(resumeTaskId);
            } else {
              throw new Error('Task ID parameter required');
            }
            break;

          case ERooCodeCommand.PressPrimaryButton:
            await adapter.pressPrimaryButton();
            result = { success: true, message: 'Primary button pressed' };
            break;

          case ERooCodeCommand.PressSecondaryButton:
            await adapter.pressSecondaryButton();
            result = { success: true, message: 'Secondary button pressed' };
            break;

          case ERooCodeCommand.SwitchMode:
            if (parameters?.mode) {
              // Use Roo API setMode directly for reliability
              const modeSlug = this.mapModeSlug(parameters.mode);
              if (!modeSlug) {
                throw new Error('Mode parameter required');
              }
              await (adapter as any).api?.setMode(modeSlug);
              result = { success: true, message: `Mode set to ${modeSlug}` };
            } else {
              throw new Error('Mode parameter required');
            }
            break;

          case ERooCodeCommand.SendMessage:
            if (parameters?.message) {
              const events: any[] = [];
              for await (const event of adapter.sendMessage(
                parameters.message,
                parameters.images,
                parameters.options
              )) {
                events.push(event);
              }
              result = { events, message: 'Message sent successfully' };
            } else {
              throw new Error('Message parameter required');
            }
            break;

          case ERooCodeCommand.StartNewTask:
            if (parameters?.options) {
              const taskId = await adapter.startNewTask({
                ...parameters.options,
                configuration: createAutoApprovalTaskConfig(
                  parameters.options.configuration
                ),
              });
              result = { taskId, message: 'New task started successfully' };
            } else {
              throw new Error('Task options parameter required');
            }
            break;

          default:
            throw new Error(`Unknown RooCode command: ${command}`);
        }
      } catch (cmdError) {
        success = false;
        error = (cmdError as Error).message;
        logger.error(`RooCode command '${command}' failed:`, {
          error: cmdError,
          errorMessage: (cmdError as Error).message,
          errorStack: (cmdError as Error).stack,
          parameters: parameters,
          extensionId: extensionId,
        });
      }

      this.sendRooCodeCommandResponse(
        command,
        success,
        error,
        extensionId,
        result
      );
    } catch (error) {
      logger.error(`Error handling RooCode command '${command}':`, error);
      this.sendRooCodeCommandResponse(
        command,
        false,
        (error as Error).message,
        extensionId
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
    result?: any
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(
        'WebSocket not connected, cannot send RooCode command response'
      );
      return;
    }

    const responseMessage: Message = {
      type: EMessageFromAgent.RooCodeCommandResponse,
      source: ConnectionSource.Agent,
      agent: { id: this.currentAgentId || 'unknown-agent' },
      data: { command, success, error, result, extensionId },
      timestamp: Date.now(),
    };

    logger.info(
      `Sending RooCode command response [${command}] success=${success} [ext=${extensionId}]: ${error || 'OK'}`
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
          `Cannot broadcast status: No RooCode adapter found for extension: ${extensionId || 'default'}`
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const statusMessage: Message = {
        type: EMessageFromAgent.RooCodeStatus,
        source: ConnectionSource.Agent,
        agent: { id: this.currentAgentId || 'unknown-agent' },
        data: {
          extensionId: adapter.getExtensionId(),
          isReady: adapter.isReady(),
          lastHeartbeat: adapter.lastHeartbeat,
          activeTaskIds: adapter.getActiveTaskIds(),
        },
        timestamp: Date.now(),
      };

      this.ws.send(JSON.stringify(statusMessage));
    } catch (error) {
      logger.error('Error broadcasting RooCode status:', error);
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
          `Cannot broadcast configuration: No RooCode adapter found for extension: ${extensionId || 'default'}`
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const configMessage: Message = {
        type: EMessageFromAgent.RooCodeConfiguration,
        source: ConnectionSource.Agent,
        agent: { id: this.currentAgentId || 'unknown-agent' },
        data: {
          extensionId: adapter.getExtensionId(),
          configuration: adapter.getConfiguration(),
        },
        timestamp: Date.now(),
      };

      this.ws.send(JSON.stringify(configMessage));
    } catch (error) {
      logger.error('Error broadcasting RooCode configuration:', error);
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
          `Cannot broadcast profiles: No RooCode adapter found for extension: ${extensionId || 'default'}`
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const profilesMessage: Message = {
        type: EMessageFromAgent.RooCodeProfiles,
        source: ConnectionSource.Agent,
        agent: { id: this.currentAgentId || 'unknown-agent' },
        data: {
          extensionId: adapter.getExtensionId(),
          profiles: adapter.getProfiles(),
          activeProfile: adapter.getActiveProfile(),
        },
        timestamp: Date.now(),
      };

      this.ws.send(JSON.stringify(profilesMessage));
    } catch (error) {
      logger.error('Error broadcasting RooCode profiles:', error);
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
          `Cannot broadcast task history: No RooCode adapter found for extension: ${extensionId || 'default'}`
        );
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Silently return if not connected
      }

      const historyMessage: Message = {
        type: EMessageFromAgent.RooCodeTaskHistory,
        source: ConnectionSource.Agent,
        agent: { id: this.currentAgentId || 'unknown-agent' },
        data: {
          extensionId: adapter.getExtensionId(),
          taskHistory: adapter.getTaskHistory(),
        },
        timestamp: Date.now(),
      };

      this.ws.send(JSON.stringify(historyMessage));
    } catch (error) {
      logger.error('Error broadcasting RooCode task history:', error);
    }
  }
}

// ControllerManager removed - extension now uses single controller approach
