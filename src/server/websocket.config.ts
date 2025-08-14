import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface WebSocketConfig {
  port: number;
  pingInterval?: number;
  connectionTimeout?: number;
}

export interface AgentConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
  metadata?: Record<string, unknown>;
}

export class AgentManager {
  private agents = new Map<string, AgentConnection>();
  private pingInterval: number;

  constructor(pingInterval: number) {
    this.pingInterval = pingInterval;
  }

  registerAgent(socket: WebSocket, metadata?: Record<string, unknown>): string {
    const agentId = uuidv4();
    this.agents.set(agentId, {
      id: agentId,
      socket,
      lastHeartbeat: Date.now(),
      metadata
    });
    return agentId;
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  updateHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
    }
  }

  getAgent(agentId: string): AgentConnection | undefined {
    return this.agents.get(agentId);
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.agents.forEach(agent => {
      if (agent.socket.readyState === WebSocket.OPEN) {
        agent.socket.send(data);
      }
    });
  }

  checkHealth(): void {
    const now = Date.now();
    this.agents.forEach((agent, id) => {
      if (now - agent.lastHeartbeat > this.pingInterval * 3) {
        logger.warn(`Agent ${id} heartbeat timeout`);
        agent.socket.close(4001, 'Heartbeat timeout');
        this.agents.delete(id);
      }
    });
  }
}

export const createWebSocketServer = (config: WebSocketConfig) => {
  const { port, pingInterval = 10000, connectionTimeout = 30000 } = config;
  
  const wss = new WebSocketServer({
    port,
    verifyClient: (info, cb) => {
      const token = info.req.headers['sec-websocket-protocol']?.toString().split(', ')[1];
      if (!token) {
        cb(false, 401, 'Unauthorized');
        return;
      }
      // TODO: Add JWT verification
      cb(true);
    }
  });

  const agentManager = new AgentManager(pingInterval);
  const healthCheckInterval = setInterval(() => agentManager.checkHealth(), pingInterval);

  wss.on('connection', (socket: WebSocket, req) => {
    const agentId = agentManager.registerAgent(socket);
    logger.info(`Agent connected: ${agentId}`);

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle heartbeat messages
        if (message.type === 'heartbeat') {
          agentManager.updateHeartbeat(agentId);
          return;
        }

        // Handle agent registration
        if (message.type === 'register') {
          agentManager.registerAgent(socket, message.metadata);
          socket.send(JSON.stringify({
            type: 'registered',
            agentId,
            timestamp: Date.now()
          }));
          return;
        }

        // Handle task requests
        if (message.type === 'requestTask') {
          const workspacePath = message.workspacePath || '';
          logger.info(`Agent ${agentId} requested task for workspace: ${workspacePath}`);
          // TODO: Implement task assignment logic with workspace context
          return;
        }

        // Handle task results
        if (message.type === 'taskResult') {
          // TODO: Process task results
          logger.info(`Agent ${agentId} completed task`, message.result);
          return;
        }

        logger.warn(`Unknown message type: ${message.type}`);
      } catch (error) {
        logger.error('Invalid message format', error);
      }
    });

    socket.on('close', () => {
      agentManager.removeAgent(agentId);
      logger.info(`Agent disconnected: ${agentId}`);
    });
  });

  logger.info(`WebSocket server started on port ${port}`);

  return {
    server: wss,
    agentManager,
    pingInterval,
    connectionTimeout,
    on: wss.on.bind(wss),
    broadcast: (message: any) => {
      const data = JSON.stringify(message);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    },
    close: () => new Promise<void>((resolve) => {
      clearInterval(healthCheckInterval);
      wss.close(() => resolve());
    })
  };
};

export type WebSocketServerInstance = ReturnType<typeof createWebSocketServer>;