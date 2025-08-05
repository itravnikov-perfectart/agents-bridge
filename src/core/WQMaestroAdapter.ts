import { logger } from "../utils/logger";
import { ExtensionBaseAdapter } from "./ExtensionBaseAdapter";
import { ProcessEvent, ProcessStatus, ProcessOptions } from "../server/types";

export interface WQMaestroAPI {
  startProcess(options: ProcessOptions): Promise<string>;
  stopProcess(processId: string): Promise<void>;
  getProcessStatus(processId: string): Promise<ProcessStatus>;
  listProcesses(): Promise<string[]>;
  on(event: string, callback: (data: any) => void): void;
  removeAllListeners(): void;
}

export class WQMaestroAdapter extends ExtensionBaseAdapter<WQMaestroAPI> {
  private processEventQueues: Map<string, ProcessEvent[]> = new Map();
  private processEventResolvers: Map<string, ((event: ProcessEvent) => void)[]> = new Map();
  private extensionId: string;

  constructor(extensionId: string) {
    super();
    this.extensionId = extensionId;
  }

  public getExtensionId(): string {
    return this.extensionId;
  }

  protected async postActivation(): Promise<void> {
    this.registerProcessEventListeners();
  }

  private registerProcessEventListeners(): void {
    if (!this.api) {
      logger.error("WQ Maestro API not available for event listeners");
      return;
    }

    this.api.on("processStarted", (data: {processId: string}) => {
      logger.info(`WQ Maestro Process Started: ${data.processId}`);
      this.enqueueEvent(data.processId, {
        type: "processStarted",
        processId: data.processId,
        timestamp: Date.now()
      });
    });

    this.api.on("processStopped", (data: {processId: string, exitCode: number}) => {
      logger.info(`WQ Maestro Process Stopped: ${data.processId} (exit code: ${data.exitCode})`);
      this.enqueueEvent(data.processId, {
        type: "processStopped",
        processId: data.processId,
        exitCode: data.exitCode,
        timestamp: Date.now()
      });
    });

    this.api.on("processOutput", (data: {processId: string, outputType: string, data: any}) => {
      logger.debug(`WQ Maestro Process Output [${data.outputType}]: ${data.processId}`, data.data);
      this.enqueueEvent(data.processId, {
        type: "processOutput",
        processId: data.processId,
        outputType: data.outputType,
        data: data.data,
        timestamp: Date.now()
      });
    });

    this.api.on("processError", (data: {processId: string, error: Error}) => {
      logger.error(`WQ Maestro Process Error: ${data.processId}`, data.error);
      this.enqueueEvent(data.processId, {
        type: "processError",
        processId: data.processId,
        error: data.error,
        timestamp: Date.now()
      });
    });
  }

  private enqueueEvent(processId: string, event: ProcessEvent): void {
    const resolvers = this.processEventResolvers.get(processId);
    if (resolvers && resolvers.length > 0) {
      const resolver = resolvers.shift()!;
      resolver(event);
      return;
    }

    if (!this.processEventQueues.has(processId)) {
      this.processEventQueues.set(processId, []);
    }
    this.processEventQueues.get(processId)!.push(event);
  }

  async *startProcess(options: ProcessOptions): AsyncGenerator<ProcessEvent, void, unknown> {
    if (!this.api) {
      throw new Error("WQ Maestro API not available");
    }

    logger.info("Starting new WQ Maestro process");
    const processId = await this.api.startProcess(options);

    try {
      while (true) {
        const queue = this.processEventQueues.get(processId);
        if (queue && queue.length > 0) {
          const event = queue.shift()!;
          yield event;
          if (event.type === "processStopped") {
            break;
          }
          continue;
        }

        const event = await new Promise<ProcessEvent>((resolve) => {
          if (!this.processEventResolvers.has(processId)) {
            this.processEventResolvers.set(processId, []);
          }
          this.processEventResolvers.get(processId)!.push(resolve);
        });

        yield event;
        if (event.type === "processStopped") {
          break;
        }
      }
    } finally {
      this.cleanupProcessStream(processId);
    }
  }

  private cleanupProcessStream(processId: string): void {
    this.processEventQueues.delete(processId);
    this.processEventResolvers.delete(processId);
  }

  async stopProcess(processId: string): Promise<void> {
    if (!this.api) {
      throw new Error("WQ Maestro API not available");
    }
    await this.api.stopProcess(processId);
  }

  async getProcessStatus(processId: string): Promise<ProcessStatus> {
    if (!this.api) {
      throw new Error("WQ Maestro API not available");
    }
    return await this.api.getProcessStatus(processId);
  }

  async listProcesses(): Promise<string[]> {
    if (!this.api) {
      throw new Error("WQ Maestro API not available");
    }
    return await this.api.listProcesses();
  }

  async dispose(): Promise<void> {
    if (this.api) {
      this.api.removeAllListeners();
    }
    await super.dispose();
  }
}