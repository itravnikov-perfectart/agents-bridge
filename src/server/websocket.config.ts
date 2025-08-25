import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../utils/serverLogger";
import { AgentManager } from "./agent-manager";
import {
  EConnectionType,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  EMessageToServer,
} from "./message.enum";
import {
  IMessageFromAgent,
  IMessageFromServer,
  IMessageFromUI,
  TMessageToServer,
  WebSocketConfig,
} from "./types";

export const createWebSocketServer = (config: WebSocketConfig) => {
  const { port, pingInterval = 10000, connectionTimeout = 30000 } = config;

  const wss = new WebSocketServer({
    port,
    verifyClient: (info, cb) => {
      // const token = info.req.headers["sec-websocket-protocol"]
      //   ?.toString()
      //   .split(", ")[1];
      // if (!token) {
      //   cb(false, 401, "Unauthorized");
      //   return;
      // }
      // TODO: Add JWT verification
      cb(true);
    },
  });

  const agentManager = new AgentManager(pingInterval, 5); // 5x timeout multiplier
  const healthCheckInterval = setInterval(
    () => agentManager.checkHealth(),
    pingInterval,
  );

  wss.on("connection", (socket: WebSocket, req) => {
    logger.info(`🔗 New connection from ${req}`);
    let connectionType: EConnectionType | undefined;
    let agentId: string | undefined;

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as TMessageToServer;
        connectionType = message.connectionType;

        logger.info(
          `Received message from ${req.socket.remoteAddress}: ${JSON.stringify(message)}`,
        );

        if (connectionType === EConnectionType.UI) {
          handleUIConnection(message as IMessageFromUI, socket, agentManager);
        } else if (connectionType === EConnectionType.Agent) {
          agentId = (message as IMessageFromAgent).agentId;

          handleAgentConnection(
            message as IMessageFromAgent,
            socket,
            agentManager,
          );
        } else {
          logger.warn(`Unknown connection type: ${connectionType}`);
        }
      } catch (error) {
        logger.error("Invalid message format", error);
      }
    });

    socket.on("close", (code, reason) => {
      switch (connectionType) {
        case EConnectionType.Agent:
          if (agentId) {
            agentManager.removeAgent(agentId);
            logger.info(
              `Agent disconnected: ${agentId}, code: ${code}, reason: ${reason}`,
            );
          } else {
            logger.error(
              `Agent disconnected: code: ${code}, reason: ${reason}`,
            );
          }
          break;
        case EConnectionType.UI:
          logger.info(
            `UI client disconnected, code: ${code}, reason: ${reason}`,
          );
          break;
        default:
          logger.info(
            `Unknown connection disconnected, code: ${code}, reason: ${reason}`,
          );
          break;
      }
    });

    socket.on("error", (error) => {
      switch (connectionType) {
        case EConnectionType.Agent:
          if (agentId) {
            logger.error(`WebSocket error for agent ${agentId}:`, error);
            agentManager.removeAgent(agentId);
          } else {
            logger.error(`WebSocket error for agent:`, error);
          }
          break;
        case EConnectionType.UI:
          logger.error(`WebSocket error for UI connection:`, error);
          break;
        default:
          logger.error(`WebSocket error for unknown connection:`, error);
          break;
      }
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

const handleUIConnection = (
  message: IMessageFromUI,
  socket: WebSocket,
  agentManager: AgentManager,
) => {
  const { messageType } = message;

  switch (messageType) {
    case EMessageFromUI.GetAgents:
      const agents = Array.from(agentManager.agents.entries()).map(
        ([id, agent]) => ({
          id,
          status: "connected",
          lastHeartbeat: agent.lastHeartbeat,
          connectedAt: agent.connectedAt,
          metadata: agent.metadata,
          gracePeriod: agent.gracePeriod,
        }),
      );

      const messageAgentList: IMessageFromServer = {
        messageType: EMessageFromServer.AgentList,
        details: {
          agents,
        },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageAgentList));
      break;
    case EMessageFromUI.SendToRooCode:
      const agentId = message.details?.agentId;
      const messageFromUI = message.details?.message;
      const agentToSendMessage = agentManager.agents.get(agentId);
      if (!agentToSendMessage) {
        logger.warn(`Agent ${agentId} not found for RooCode message`);
        return;
      }
      const messageToSend: IMessageFromServer = {
        messageType: EMessageFromServer.RooCodeMessage,
        details: {
          message: messageFromUI,
        },
        timestamp: Date.now(),
      };
      agentToSendMessage.socket.send(JSON.stringify(messageToSend));
      logger.info(
        `Forwarded message to RooCode via agent ${agentId}: ${messageFromUI}`,
      );
      break;
    case EMessageFromUI.CreateTask:
    case EMessageFromUI.StartProcess:
    case EMessageFromUI.StopProcess:
    case EMessageFromUI.GetProcessStatus:
    case EMessageFromUI.ListProcesses:
      logger.info(
        `Received message from UI: ${messageType} which is not handled`,
      );

      break;

    //   const agentIdToCreateTask = message.details?.agentId;
    //   const agentToAssignTask = agentManager.agents.get(agentIdToCreateTask);
    //   if (!agentToAssignTask) {
    //     logger.warn(
    //       `Agent ${agentIdToCreateTask} not found for task assignment`,
    //     );
    //     return;
    //   }

    //   const messageToCreateTask: IMessageFromServer = {
    //     messageType: EMessageFromServer.CreateTask,
    //     details: {
    //       task: message.details?.task,
    //     },
    //     timestamp: Date.now(),
    //   };
    //   agentToAssignTask.socket.send(JSON.stringify(messageToCreateTask));
    //   logger.info(
    //     `Assigned task ${message.details?.task.id} to agent ${agentIdToCreateTask}`,
    //   );
    //   break;
    case EMessageToServer.Register:
      logger.info(`UI client connected`);
      const messageRegistered: IMessageFromServer = {
        messageType: EMessageFromServer.Registered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
    case EMessageToServer.Unregister:
      logger.info(`UI client disconnected`);
      const messageUnregistered: IMessageFromServer = {
        messageType: EMessageFromServer.Unregistered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageUnregistered));
      socket.close();
      break;
    default:
      logger.warn(`Unknown UI message type: ${messageType}`);
      break;
  }
};

const handleAgentConnection = (
  message: IMessageFromAgent,
  socket: WebSocket,
  agentManager: AgentManager,
) => {
  const { messageType, agentId } = message;

  switch (messageType) {
    case EMessageToServer.Register:
      // Use the agent's provided ID instead of generating a new one
      const registredAgentId = agentManager.registerAgentWithId(
        agentId, // Use the agent's provided ID
        socket,
        message.metadata,
      );
      logger.info(`Agent connected: ${registredAgentId}`);
      const messageRegistered: IMessageFromServer = {
        messageType: EMessageFromServer.Registered,
        agentId: registredAgentId,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
      break;
    case EMessageFromAgent.TaskAssigned:
      // For non-register messages, check if agent exists
      const agent = agentManager.getAgent(agentId);
      if (!agent) {
        logger.warn(`Agent ${agentId} not found`);
        return;
      }
      const taskId = message.details?.taskId;
      const taskType = message.details?.taskType;
      const workspacePath = message.details?.workspacePath;
      logger.info(
        `Received task assigned from UI: ${taskId}, ${taskType}, ${workspacePath}`,
      );
      break;
    case EMessageFromAgent.Ping:
      // For non-register messages, check if agent exists
      const agentPing = agentManager.getAgent(agentId);
      if (!agentPing) {
        logger.warn(`Agent ${agentId} not found for ping`);
        return;
      }
      const timestamp = message.details?.timestamp;
      agentManager.updateHeartbeat(agentId);
      logger.info(`Received ping from agent ${agentId} at ${timestamp}`);
      break;
    case EMessageFromAgent.Pong:
      // For non-register messages, check if agent exists
      const agentPong = agentManager.getAgent(agentId);
      if (!agentPong) {
        logger.warn(`Agent ${agentId} not found for pong`);
        return;
      }
      agentManager.updateHeartbeat(agentId);
      logger.info(`Received pong from agent ${agentId}`);
      break;
    case EMessageToServer.Unregister:
      agentManager.removeAgent(agentId);
      logger.info(`Agent disconnected: ${agentId}`);
      socket.close();
      break;
    default:
      logger.warn(`Unknown agent message type: ${messageType}`);
      break;
  }
};
