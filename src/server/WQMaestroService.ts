import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import Docker from 'dockerode';
import { ProcessEvent, ProcessStatus, ProcessOptions } from './types';
import { createWebSocketServer, WebSocketServerInstance } from './websocket.config';
import { createTaskQueue, createWorker, RedisConfig } from './worker.config';
import { Worker as BullWorker } from 'bullmq';

export class WQMaestroService {
  private wss: WebSocketServerInstance;
  private docker: Docker;
  private taskQueue: ReturnType<typeof createTaskQueue>;
  private agents: Map<string, { ws: WebSocket, lastPing: number }> = new Map();
  private instances: Map<string, { ws: WebSocket, lastPing: number }> = new Map();
  private processStatuses: Map<string, ProcessStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private worker!: BullWorker;

  constructor(
    port: number = 8080,
    redisConfig: RedisConfig = { host: 'localhost', port: 6379 }
  ) {
    this.wss = createWebSocketServer({ port });
    this.docker = new Docker();
    this.taskQueue = createTaskQueue({
      queueName: 'wq-maestro-tasks',
      redis: redisConfig
    });

    this.setupWorkers();
    this.startHealthChecks();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      // Check agents
      this.agents.forEach((agent, id) => {
        if (now - agent.lastPing > timeout) {
          logger.warn(`Agent ${id} connection stale, disconnecting`);
          agent.ws.terminate();
          this.agents.delete(id);
        }
      });

      // Check instances
      this.instances.forEach((instance, id) => {
        if (now - instance.lastPing > timeout) {
          logger.warn(`Instance ${id} connection stale, disconnecting`);
          instance.ws.terminate();
          this.instances.delete(id);
        }
      });
    }, 10000); // Run every 10 seconds
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(ws, message);
        } catch (err) {
          logger.error('Invalid message format', err);
        }
      });

      ws.on('close', () => {
        this.cleanupAgent(ws);
      });
    });
  }

  private handleMessage(ws: WebSocket, message: unknown): void {
    try {
      if (typeof message !== 'object' || message === null || !('type' in message)) {
        throw new Error('Invalid message format - expected object with type field');
      }

      const msg = message as {
        type: string;
        agentId?: string;
        instanceId?: string;
        event?: ProcessEvent;
        processId?: string;
        status?: ProcessStatus;
      };

      if (typeof msg.type !== 'string') {
        throw new Error('Message type must be string');
      }

    if (msg.type === 'registerInstance' && msg.instanceId) {
      this.instances.set(msg.instanceId, { ws, lastPing: Date.now() });
      logger.info(`Instance registered: ${msg.instanceId}`);
      return;
    }
    switch (message.type) {
      case 'register':
        if (!msg.agentId) {
          logger.error('Register message missing agentId');
          break;
        }
        this.agents.set(msg.agentId, { ws, lastPing: Date.now() });
        logger.info(`Agent registered: ${msg.agentId}`);
        break;
      case 'processEvent':
        if (!msg.event) {
          logger.error('ProcessEvent message missing event');
          break;
        }
        this.broadcastProcessEvent(msg.event);
        break;
      case 'statusUpdate':
        if (!msg.processId || !msg.status) {
          logger.error('StatusUpdate message missing processId or status');
          break;
        }
        this.processStatuses.set(msg.processId, msg.status);
        break;
    }
  }catch(err) {

  }
  }

  private broadcastProcessEvent(event: ProcessEvent): void {
    const message = JSON.stringify({
      type: 'processEvent',
      event
    });

    let sentCount = 0;
    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message, (err) => {
            if (err) {
              logger.error('Failed to send process event', err);
            } else {
              sentCount++;
            }
          });
        } catch (error) {
          logger.error('Error sending message to client', error);
        }
      }
    });
    logger.debug(`Broadcasted event ${event.type} to ${sentCount} clients`);
  }

  private sendToInstance(instanceId: string, type: string, data: any): void {
    const instance = this.instances.get(instanceId);
    const instanceConn = this.instances.get(instanceId);
    if (instanceConn && instanceConn.ws.readyState === WebSocket.OPEN) {
      instanceConn.ws.send(JSON.stringify({ type, data }));
    } else {
      logger.warn(`Instance ${instanceId} not connected`);
    }
  }

  private cleanupAgent(ws: WebSocket): void {
    for (const [agentId, agentWs] of this.agents) {
      if (agentWs.ws === ws) {
        this.agents.delete(agentId);
        logger.info(`Agent disconnected: ${agentId}`);
        break;
      }
    }
  }

  private setupWorkers(): void {
    this.worker = createWorker(
      {
        queueName: 'wq-maestro-tasks',
        redis: { host: 'localhost', port: 6379 }
      },
      this.docker,
      {
        startContainer: this.startDockerContainer.bind(this),
        stopContainer: this.stopDockerContainer.bind(this)
      }
    );
  }

  private async checkDockerAvailable(): Promise<void> {
    try {
      await this.docker.ping();
    } catch (error) {
      logger.error('Docker is not available', error);
      throw new Error('Docker service is not running');
    }
  }

  private async startDockerContainer(options: {
    image: string;
    command: string[];
    env?: Record<string, string>;
    ports?: number[];
  }): Promise<string> {
    await this.checkDockerAvailable();
    
    try {
      const container = await this.docker.createContainer({
        Image: options.image,
        Cmd: options.command,
        Env: options.env ? Object.entries(options.env).map(([k,v]) => `${k}=${v}`) : undefined,
        HostConfig: {
          PortBindings: options.ports?.reduce((acc, port) => ({
            ...acc,
            [`${port}/tcp`]: [{}] // Bind to random host port
          }), {})
        }
      });

      await container.start();
      
      const containerInfo = await container.inspect();
      logger.info(`Container started: ${containerInfo.Id} (${containerInfo.Name})`);
      
      return containerInfo.Id;
    } catch (error) {
      logger.error('Failed to start container', error);
      throw new Error(`Container startup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async stopDockerContainer(containerId: string): Promise<void> {
    await this.checkDockerAvailable();
    
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      
      if (info.State.Running) {
        await container.stop();
        logger.info(`Container ${containerId} stopped`);
      }
      
      await container.remove();
      logger.info(`Container ${containerId} removed`);
    } catch (error) {
      logger.error(`Failed to stop container ${containerId}`, error);
      throw error;
    }
  }

  public async startProcess(options: ProcessOptions): Promise<string> {
    const job = await this.taskQueue.add('startContainer', options);
    if (!job.id) {
      throw new Error('Job missing id');
    }
    return job.id;
  }

  public async stopProcess(processId: string): Promise<void> {
    await this.taskQueue.add('stopContainer', { containerId: processId });
  }

  public async getProcessStatus(processId: string): Promise<ProcessStatus> {
    return this.processStatuses.get(processId) || { status: 'unknown' };
  }

  public async listProcesses(): Promise<string[]> {
    return Array.from(this.processStatuses.keys());
  }

  public async stop(): Promise<void> {
    // Остановка интервала проверки состояния
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Закрытие worker
    if (this.worker) {
      await this.worker.close();
    }

    // Закрытие всех соединений
    this.wss.clients.forEach(client => client.terminate());
    this.agents.clear();
    this.instances.clear();

    // Закрытие WebSocket сервера
    await new Promise<void>((resolve) => {
      this.wss.server.close(() => resolve());
    });
  }
}