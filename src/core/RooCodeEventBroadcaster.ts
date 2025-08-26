import { logger } from "../utils/logger";
import { RooCodeAdapter } from "./RooCodeAdapter";
import { EMessageFromAgent, EConnectionSource } from "../server/message.enum";
import { IMessageFromAgent } from "../server/types";

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
   * Setup raw event broadcasting by intercepting the adapter's onEvent callback
   */
  private setupRawEventBroadcasting(): void {
    // Store the original onEvent callback if it exists
    const originalOnEvent = this.adapter.onEvent;

    // Override the onEvent to also broadcast raw events immediately
    this.adapter.onEvent = (event) => {
      try {
        // Call the original callback if it exists
        if (originalOnEvent) {
          originalOnEvent(event);
        }

        // Immediately broadcast the raw event when it occurs
        this.broadcastRawEvent(event);
      } catch (error) {
        logger.error("Error in raw event broadcasting:", error);
      }
    };
  }

  /**
   * Set the callback for raw event broadcasting
   */
  public setRawEventCallback(callback: (eventName: string, ...args: any[]) => void): void {
    this.onRawEventCallback = callback;
  }

  /**
   * Extract raw event data from TaskEvent and broadcast
   */
  private broadcastRawEvent(taskEvent: any): void {
    if (!this.onRawEventCallback) {
      return;
    }

    try {
      const { name, data } = taskEvent;
      
      // Convert TaskEvent back to raw format based on event type
      switch (name) {
        case 'Message':
          // Message events have the full data structure
          this.onRawEventCallback(name, data);
          break;
          
        case 'TaskCreated':
        case 'TaskStarted':
        case 'TaskAborted':
        case 'TaskPaused':
        case 'TaskUnpaused':
        case 'TaskModeSwitched':
        case 'TaskSpawned':
        case 'TaskAskResponded':
          // These events have taskId as the main data
          this.onRawEventCallback(name, data.taskId);
          break;
          
        case 'TaskCompleted':
          // TaskCompleted has taskId, tokenUsage, toolUsage
          this.onRawEventCallback(name, data.taskId, data.tokenUsage, data.toolUsage);
          break;
          
        case 'TaskTokenUsageUpdated':
          // TaskTokenUsageUpdated has taskId and tokenUsage
          this.onRawEventCallback(name, data.taskId, data.tokenUsage);
          break;
          
        case 'TaskToolFailed':
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
   */
  public getExtensionId(): string {
    return this.adapter.getExtensionId();
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

  public async updateProfile(name: string, profile: any, activate?: boolean): Promise<string | undefined> {
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

  public async *sendMessage(message?: string, images?: string[], options?: any): AsyncGenerator<any, void, unknown> {
    yield* this.adapter.sendMessage(message, images, options);
  }

  public async *startNewTask(options: any = {}): AsyncGenerator<any, void, unknown> {
    yield* this.adapter.startNewTask(options);
  }

  public async *executeRooTasks(tasks: any[], maxConcurrent = 5): AsyncGenerator<any[], void, unknown> {
    yield* this.adapter.executeRooTasks(tasks, maxConcurrent);
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
   */
  public get lastHeartbeat(): number {
    return this.adapter.lastHeartbeat;
  }

  /**
   * Get container ID
   */
  public get containerId(): string | undefined {
    return this.adapter.containerId;
  }
}
