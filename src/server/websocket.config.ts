import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../utils/serverLogger";
import { AgentManager } from "./agent-manager";

import {
  ConnectionSource,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  ESystemMessage,
  Message,
} from "../core/types";

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
  const uiClients = new Set<WebSocket>(); // Track UI clients separately
  
  const healthCheckInterval = setInterval(
    () => agentManager.checkHealth(),
    pingInterval,
  );

  wss.on("connection", (socket: WebSocket, req) => {
    logger.info(`🔗 New connection from ${req}`);
    let source: ConnectionSource | undefined;
    let agentId: string | undefined;

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        source = message.source;

        logger.info(
          `Received message from ${req.socket.remoteAddress}: ${JSON.stringify(message)}`,
        );

        if (source === ConnectionSource.UI) {
          uiClients.add(socket);
          handleUIConnection(message, socket, agentManager);
        } else if (source === ConnectionSource.Agent) {
          agentId = message.agent?.id;

          handleAgentConnection(
            message,
            socket,
            agentManager,
            uiClients,
          );
        } else {
          logger.warn(`Unknown connection type: ${source}`);
        }
      } catch (error) {
        logger.error("Invalid message format", error);
      }
    });

    socket.on("close", (code, reason) => {
      switch (source) {
        case ConnectionSource.Agent:
          if (agentId) {
            // Broadcast agent update before removing
            broadcastAgentUpdate(uiClients, agentManager, 'disconnected', agentId);
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
        case ConnectionSource.UI:
          uiClients.delete(socket);
          logger.info(
            `UI client disconnected, code: ${code}, reason: ${reason}. Total UI clients: ${uiClients.size}`,
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
      switch (source) {
        case ConnectionSource.Agent:
          if (agentId) {
            // Broadcast agent update before removing
            broadcastAgentUpdate(uiClients, agentManager, 'disconnected', agentId);
            logger.error(`WebSocket error for agent ${agentId}:`, error);
            agentManager.removeAgent(agentId);
          } else {
            logger.error(`WebSocket error for agent:`, error);
          }
          break;
        case ConnectionSource.UI:
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
  message: Message,
  socket: WebSocket,
  agentManager: AgentManager,
) => {
  const { type } = message;

  switch (type) {
    case EMessageFromUI.GetAgents:
      const agents = Array.from(agentManager.agents.entries()).map(
        ([id, agent]) => ({
          id,
          status: "connected",
          lastHeartbeat: agent.lastHeartbeat,
          connectedAt: agent.connectedAt,
          gracePeriod: agent.gracePeriod,
        }),
      );

      const messageAgentList: Message = {
        source: ConnectionSource.Server,
        type: EMessageFromServer.AgentList,
        data: {
          agents,
        },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageAgentList));
      break;
    
    case EMessageFromUI.GetActiveProfile:
    case EMessageFromUI.GetProfiles:
    case EMessageFromUI.GetActiveTaskIds:
    case EMessageFromUI.CreateTask:
    case EMessageFromUI.SendMessageToTask:
      const agentId = message.agent?.id;
      if (!agentId) {
        logger.warn(`Agent ID not found for RooCode message`);
        return;
      }
      const agentToSendMessage = agentManager.agents.get(agentId);
      if (!agentToSendMessage) {
        logger.warn(`Agent ${agentId} not found for RooCode message`);
        return;
      }
      
      const messageToSend: Message = {
        source: message.source,
        type,
        data: message.data,
        timestamp: Date.now(),
      };
      
      agentToSendMessage.socket.send(JSON.stringify(messageToSend));
      logger.info(
        `Forwarded message to RooCode via agent ${agentId}: ${JSON.stringify(message.data)}`,
      );
    break;
  
    case ESystemMessage.Register:
      logger.info(`UI client connected`);
      const messageRegistered: Message = {
        source: ConnectionSource.Server,
        type: EMessageFromServer.Registered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
      break;
    case ESystemMessage.Unregister:
      logger.info(`UI client disconnected`);
      const messageUnregistered: Message = {
        source: ConnectionSource.Server,
        type: EMessageFromServer.Unregistered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageUnregistered));
      socket.close();
      break;
    default:
      logger.warn(`Unknown UI message type: ${type}`);
      break;
  }
};

// Function to broadcast agent updates to all UI clients
const broadcastAgentUpdate = (
  uiClients: Set<WebSocket>,
  agentManager: AgentManager,
  action: 'connected' | 'disconnected',
  agentId: string,
) => {
  const agents = Array.from(agentManager.agents.entries()).map(
    ([id, agent]) => ({
      id,
      status: action === 'connected' ? "connected" : "disconnected",
      lastHeartbeat: agent.lastHeartbeat,
      connectedAt: agent.connectedAt,
      gracePeriod: agent.gracePeriod,
    }),
  );

  const updateMessage: Message = {
    source: ConnectionSource.Server,
    type: EMessageFromServer.AgentUpdate,
    data: {
      action,
      agentId,
      agents,
    },
    timestamp: Date.now(),
  };

  const messageData = JSON.stringify(updateMessage);
  uiClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageData);
        logger.info(`Sent agent update to UI client: ${action} ${agentId}`);
      } catch (error) {
        logger.error(`Failed to send agent update to UI client:`, error);
      }
    }
  });
};

const handleAgentConnection = (
  message: Message,
  socket: WebSocket,
  agentManager: AgentManager,
  uiClients: Set<WebSocket>,
) => {
  const { type, agent } = message;

  const agentId = agent?.id;

  if (!agentId) {
    logger.warn(`Agent ID not found for RooCode message`);
    return;
  }

  switch (type) {
    case ESystemMessage.Register:
      // Use the agent's provided ID instead of generating a new one
      const registredAgentId = agentManager.registerAgentWithId(
        agentId, // Use the agent's provided ID
        socket,
        agent?.workspacePath,
      );
      const totalAgentsAfterReg = agentManager.agents.size;
      logger.info(`[DEBUG] Agent connected: ${registredAgentId}. Total agents: ${totalAgentsAfterReg}`);
      
      // List all current agent IDs for debugging
      const allAgentIds = Array.from(agentManager.agents.keys());
      logger.info(`[DEBUG] All registered agent IDs: ${allAgentIds.join(', ')}`);
      
      const messageRegistered: Message = {
        source: ConnectionSource.Server,
        type: EMessageFromServer.Registered,
        agent: {
          id: registredAgentId,
        },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
      
      // Broadcast agent update to UI clients
      broadcastAgentUpdate(uiClients, agentManager, 'connected', registredAgentId);
      break;
   
    case ESystemMessage.Ping:
      // For non-register messages, check if agent exists
      const agentPing = agentManager.getAgent(agentId);
      if (!agentPing) {
        logger.warn(`Agent ${agentId} not found for ping`);
        return;
      }
      const timestamp = message?.timestamp;
      agentManager.updateHeartbeat(agentId);
      logger.info(`Received ping from agent ${agentId} at ${timestamp}`);
      break;
    case ESystemMessage.Pong:
      // For non-register messages, check if agent exists
      const agentPong = agentManager.getAgent(agentId);
      if (!agentPong) {
        logger.warn(`Agent ${agentId} not found for pong`);
        return;
      }
      agentManager.updateHeartbeat(agentId);
      logger.info(`Received pong from agent ${agentId}`);
      break;
    case EMessageFromAgent.ProfilesResponse:
    case EMessageFromAgent.ActiveProfileResponse:
    case EMessageFromAgent.TaskStartedResponse:
    case EMessageFromAgent.ActiveTaskIdsResponse:
    case EMessageFromAgent.AgentResponse:
      // Forward RooCode response to all UI clients
      const agentResponse = agentManager.getAgent(agentId);
      if (!agentResponse) {
        logger.warn(`Agent ${agentId} not found for RooCode response`);
        return;
      }
      
      const responseMessage: Message = {
        source: message.source,
        type: message.type,
        agent: message.agent,
        data: message.data,
        event: message.event,
        timestamp: Date.now(),
      };
      
      // Broadcast to UI clients only
      const responseData = JSON.stringify(responseMessage);
      uiClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(responseData);
        } else {
          // Remove closed connections from UI clients set
          uiClients.delete(client);
        }
      });
      logger.info(`Forwarded RooCode response from agent ${agentId} to ${uiClients.size} UI clients: ${JSON.stringify(message)}`);
      break;
      
   
    case ESystemMessage.Unregister:
      agentManager.removeAgent(agentId);
      logger.info(`Agent disconnected: ${agentId}`);
      socket.close();
      break;
    default:
      logger.warn(`Unknown agent message type: ${type}`);
      break;
  }
};
