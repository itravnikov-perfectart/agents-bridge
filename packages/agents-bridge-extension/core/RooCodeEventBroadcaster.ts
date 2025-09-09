import {logger} from '../utils/logger';
import {RooCodeAdapter} from './RooCodeAdapter';
import {RooCodeEventName} from '@roo-code/types';
import type {TaskEvent} from './types';

/**
 * Wrapper for RooCodeAdapter that handles raw event broadcasting
 * This class extends the functionality without modifying the original RooCodeAdapter
 */
export class RooCodeEventBroadcaster {
  private adapter: RooCodeAdapter;
  private onRawEventCallback?: (eventName: string, ...args: any[]) => void;

  constructor(adapter: RooCodeAdapter) {
    this.adapter = adapter;
    this.setupRawEventBroadcasting();
  }

  /**
   * Setup raw event broadcasting by intercepting the adapter's API events
   * Since RooCodeAdapter doesn't expose onEvent directly, we need to work with the API
   */
  private setupRawEventBroadcasting(): void {
    // For now, we'll use a simpler approach that doesn't interfere with the API
    // The event broadcasting will be handled through the existing async generator methods
    logger.info('Raw event broadcasting setup - using async generator approach');

    // We can still try to set up API event wrapping, but make it optional
    try {
      const api = (this.adapter as any).api;
      if (api) {
        // Only wrap if we have a callback set
        if (this.onRawEventCallback) {
          this.wrapApiEventListeners(api);
        }
      } else {
        // If API is not available yet, wait for it to be initialized
        this.waitForApiAndSetup();
      }
    } catch (error) {
      logger.warn('API event wrapping not available, using fallback approach:', error);
    }
  }

  /**
   * Wait for API to be available and then setup event listeners
   */
  private waitForApiAndSetup(): void {
    const checkApi = () => {
      const api = (this.adapter as any).api;
      if (api && this.onRawEventCallback) {
        this.wrapApiEventListeners(api);
      } else if (!api) {
        // Check again in 100ms, but only for a limited time
        setTimeout(checkApi, 100);
      }
    };
    checkApi();
  }

  /**
   * Wrap the API event listeners to also broadcast raw events
   */
  private wrapApiEventListeners(api: any): void {
    if (!api || !api.on) {
      logger.warn('API does not support event listeners');
      return;
    }

    logger.info('Setting up API event listener wrapping for raw event broadcasting');

    // Store original listeners
    const originalListeners = new Map();

    // Wrap each event type
    const eventTypes = [
      RooCodeEventName.Message,
      RooCodeEventName.TaskCreated,
      RooCodeEventName.TaskStarted,
      RooCodeEventName.TaskCompleted,
      RooCodeEventName.TaskAborted,
      RooCodeEventName.TaskPaused,
      RooCodeEventName.TaskUnpaused,
      RooCodeEventName.TaskModeSwitched,
      RooCodeEventName.TaskSpawned,
      RooCodeEventName.TaskAskResponded,
      RooCodeEventName.TaskTokenUsageUpdated,
      RooCodeEventName.TaskToolFailed
    ];

    eventTypes.forEach((eventType) => {
      // Store the original listener if it exists
      const originalListener = api.listeners ? api.listeners(eventType) : [];
      originalListeners.set(eventType, originalListener);

      // Remove existing listeners
      api.removeAllListeners(eventType);

      // Add our wrapper listener
      api.on(eventType, (...args: any[]) => {
        try {
          // Call original listeners if they exist
          const original = originalListeners.get(eventType);
          if (original && original.length > 0) {
            original.forEach((listener: Function) => {
              try {
                listener(...args);
              } catch (error) {
                logger.error(`Error in original listener for ${eventType}:`, error);
              }
            });
          }

          // Broadcast the raw event
          this.broadcastRawEvent(eventType, ...args);
        } catch (error) {
          logger.error(`Error in wrapped listener for ${eventType}:`, error);
        }
      });
    });

    logger.info('Successfully wrapped API event listeners for raw event broadcasting');
  }

  /**
   * Set the callback for raw event broadcasting
   */
  public setRawEventCallback(callback: (eventName: string, ...args: any[]) => void): void {
    this.onRawEventCallback = callback;

    // If we now have a callback and the API is available, try to set up event wrapping
    if (this.onRawEventCallback !== undefined) {
      try {
        const api = (this.adapter as any).api;
        if (api) {
          this.wrapApiEventListeners(api);
        }
      } catch (error) {
        logger.warn('Could not set up API event wrapping:', error);
      }
    }
  }

  /**
   * Manually broadcast a raw event (for use with async generators)
   */
  public broadcastRawEvent(eventName: string, ...args: any[]): void {
    if (this.onRawEventCallback) {
      try {
        this.onRawEventCallback(eventName, ...args);
      } catch (error) {
        logger.error(`Error broadcasting raw event [${eventName}]:`, error);
      }
    }
  }

  /**
   * Extract raw event data from TaskEvent and broadcast
   */
  private broadcastRawEventFromTaskEvent(taskEvent: TaskEvent): void {
    if (!this.onRawEventCallback) {
      return;
    }

    try {
      const {name, data} = taskEvent;

      // Convert TaskEvent back to raw format based on event type
      switch (name) {
        case RooCodeEventName.Message:
          // Message events have the full data structure
          this.onRawEventCallback(name, data);
          break;

        case RooCodeEventName.TaskCreated:
        case RooCodeEventName.TaskStarted:
        case RooCodeEventName.TaskAborted:
        case RooCodeEventName.TaskPaused:
        case RooCodeEventName.TaskUnpaused:
        case RooCodeEventName.TaskModeSwitched:
        case RooCodeEventName.TaskSpawned:
        case RooCodeEventName.TaskAskResponded:
          // These events have taskId as the main data
          this.onRawEventCallback(name, data.taskId);
          break;

        case RooCodeEventName.TaskCompleted:
          // TaskCompleted has taskId, tokenUsage, toolUsage
          this.onRawEventCallback(name, data.taskId, data.tokenUsage, data.toolUsage);
          break;

        case RooCodeEventName.TaskTokenUsageUpdated:
          // TaskTokenUsageUpdated has taskId and tokenUsage
          this.onRawEventCallback(name, data.taskId, data.tokenUsage);
          break;

        case RooCodeEventName.TaskToolFailed:
          // TaskToolFailed has taskId, tool, and error
          this.onRawEventCallback(name, data.taskId, data.tool, data.error);
          break;

        default:
          // For unknown events, pass the entire data
          this.onRawEventCallback(name, data);
          break;
      }
    } catch (error) {
      logger.error(`Error broadcasting raw event [${taskEvent.name}]:`, error);
    }
  }

  /**
   * Get the underlying RooCodeAdapter
   */
  public getAdapter(): RooCodeAdapter {
    return this.adapter;
  }

  /**
   * Delegate all other method calls to the original adapter
   * Note: getExtensionId is protected in RooCodeAdapter, so we can't access it directly
   */
  public getExtensionId(): string {
    // Since getExtensionId is protected, we need to access it through the adapter's internal structure
    try {
      return (this.adapter as any).extensionId || 'unknown';
    } catch (error) {
      logger.error('Error getting extension ID:', error);
      return 'unknown';
    }
  }

  public get isActive(): boolean {
    return this.adapter.isActive;
  }

  public isReady(): boolean {
    return this.adapter.isReady();
  }

  public getConfiguration(): any {
    return this.adapter.getConfiguration();
  }

  public async setConfiguration(values: any): Promise<void> {
    return this.adapter.setConfiguration(values);
  }

  public getProfiles(): string[] {
    return this.adapter.getProfiles();
  }

  public getActiveProfile(): string | undefined {
    return this.adapter.getActiveProfile();
  }

  public async setActiveProfile(name: string): Promise<string | undefined> {
    return this.adapter.setActiveProfile(name);
  }

  public async createProfile(name: string, profile?: any, activate?: boolean): Promise<string> {
    return this.adapter.createProfile(name, profile, activate);
  }

  public async updateProfile(
    name: string,
    profile: any,
    activate?: boolean
  ): Promise<string | undefined> {
    return this.adapter.updateProfile(name, profile, activate);
  }

  public async deleteProfile(name: string): Promise<void> {
    return this.adapter.deleteProfile(name);
  }

  public getTaskHistory(): any[] {
    return this.adapter.getTaskHistory();
  }

  public async getTaskWithId(taskId: string): Promise<any> {
    return this.adapter.getTaskWithId(taskId);
  }

  /**
   * Get current task stack
   */
  public getCurrentTaskStack(): string[] {
    return this.adapter.getCurrentTaskStack();
  }

  public async clearCurrentTask(lastMessage?: string): Promise<void> {
    return this.adapter.clearCurrentTask(lastMessage);
  }

  public async cancelCurrentTask(): Promise<void> {
    return this.adapter.cancelCurrentTask();
  }

  public async resumeTask(taskId: string): Promise<void> {
    return this.adapter.resumeTask(taskId);
  }

  public async pressPrimaryButton(): Promise<void> {
    return this.adapter.pressPrimaryButton();
  }

  public async pressSecondaryButton(): Promise<void> {
    return this.adapter.pressSecondaryButton();
  }

  public async *sendMessage(
    message?: string,
    images?: string[],
    options?: any
  ): AsyncGenerator<any, void, unknown> {
    yield* this.adapter.sendMessage(message, images, options);
  }

  public async *startNewTask(options: any = {}): AsyncGenerator<TaskEvent, void, unknown> {
    yield* this.adapter.startNewTask(options);
  }

  public getActiveTaskIds(): string[] {
    return this.adapter.getActiveTaskIds();
  }

  public async dispose(): Promise<void> {
    return this.adapter.dispose();
  }

  /**
   * Initialize the adapter
   */
  public async initialize(): Promise<void> {
    return this.adapter.initialize();
  }

  /**
   * Check if extension is installed
   */
  public get isInstalled(): boolean {
    return this.adapter.isInstalled();
  }

  /**
   * Get extension version
   */
  public getVersion(): string | undefined {
    return this.adapter.getVersion?.();
  }

  /**
   * Get last heartbeat
   * Note: lastHeartbeat property doesn't exist on RooCodeAdapter
   */
  public get lastHeartbeat(): number {
    // Since lastHeartbeat doesn't exist on RooCodeAdapter, return 0 as default
    return 0;
  }

  /**
   * Get container ID
   * Note: containerId property doesn't exist on RooCodeAdapter
   */
  public get containerId(): string | undefined {
    // Since containerId doesn't exist on RooCodeAdapter, return undefined
    return undefined;
  }
}
