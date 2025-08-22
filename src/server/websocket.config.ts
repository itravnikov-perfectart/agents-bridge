import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../utils/logger";
import { AgentManager } from "./agent-manager";
import { WebSocketConfig } from "./types";
import { EMessageType } from "./message.enum";

export const createWebSocketServer = (config: WebSocketConfig) => {
  const { port, pingInterval = 10000, connectionTimeout = 30000 } = config;

  const wss = new WebSocketServer({
    port,
    verifyClient: (info, cb) => {
      const token = info.req.headers["sec-websocket-protocol"]
        ?.toString()
        .split(", ")[1];
      if (!token) {
        cb(false, 401, "Unauthorized");
        return;
      }
      // TODO: Add JWT verification
      cb(true);
    },
  });

  const agentManager = new AgentManager(pingInterval);
  const healthCheckInterval = setInterval(
    () => agentManager.checkHealth(),
    pingInterval,
  );

  wss.on("connection", (socket: WebSocket, req) => {
    const agentId = agentManager.registerAgent(socket);
    logger.info(`Agent connected: ${agentId}`);

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle heartbeat messages
        if (message.type === EMessageType.Ping) {
          agentManager.updateHeartbeat(agentId);
          return;
        }

        // Handle agent registration
        if (message.type === EMessageType.Register) {
          agentManager.registerAgent(socket, message.metadata);
          socket.send(
            JSON.stringify({
              type: "registered",
              agentId,
              timestamp: Date.now(),
            }),
          );
          return;
        }

        // Handle task requests
        if (message.type === EMessageType.RequestTask) {
          const workspacePath = message.workspacePath || "";
          logger.info(
            `Agent ${agentId} requested task for workspace: ${workspacePath}`,
          );
          // TODO: Implement task assignment logic with workspace context
          return;
        }

        // Handle task results
        if (message.type === EMessageType.TaskResult) {
          // TODO: Process task results
          logger.info(`Agent ${agentId} completed task`, message.result);
          return;
        }

        logger.warn(`Unknown message type: ${message.type}`);
      } catch (error) {
        logger.error("Invalid message format", error);
      }
    });

    socket.on("close", () => {
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
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    },
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(healthCheckInterval);
        wss.close(() => resolve());
      }),
  };
};

export type WebSocketServerInstance = ReturnType<typeof createWebSocketServer>;
