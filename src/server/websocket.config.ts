import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

export interface WebSocketConfig {
  port: number;
  pingInterval?: number;
  connectionTimeout?: number;
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
  logger.info(`WebSocket server started on port ${port}`);

  return {
    server: wss,
    pingInterval,
    connectionTimeout,
    on: wss.on.bind(wss),
    clients: wss.clients,
    close: () => new Promise<void>((resolve) => {
      wss.close(() => resolve());
    })
  };
};

export type WebSocketServerInstance = ReturnType<typeof createWebSocketServer>;