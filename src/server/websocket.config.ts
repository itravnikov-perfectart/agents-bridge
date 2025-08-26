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
  const uiClients = new Set<WebSocket>(); // Track UI clients separately

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
          // Add UI client to tracking set
          uiClients.add(socket);
          logger.info(
            `[DEBUG] UI client connected. Total UI clients: ${uiClients.size}`,
          );
          handleUIConnection(
            message as IMessageFromUI,
            socket,
            agentManager,
            uiClients,
          );
        } else if (connectionType === EConnectionType.Agent) {
          agentId = (message as IMessageFromAgent).agentId;

          handleAgentConnection(
            message as IMessageFromAgent,
            socket,
            agentManager,
            uiClients,
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
            // Broadcast agent update before removing
            broadcastAgentUpdate(
              uiClients,
              agentManager,
              "disconnected",
              agentId,
            );
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
      switch (connectionType) {
        case EConnectionType.Agent:
          if (agentId) {
            // Broadcast agent update before removing
            broadcastAgentUpdate(
              uiClients,
              agentManager,
              "disconnected",
              agentId,
            );
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
  uiClients: Set<WebSocket>,
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

      // Debug: Check how many agents are registered
      const totalAgents = agentManager.agents.size;
      logger.info(
        `[DEBUG] Server has ${totalAgents} registered agents. Sending to agent ${agentId}`,
      );

      const messageToSend: IMessageFromServer = {
        messageType: EMessageFromServer.RooCodeMessage,
        details: {
          message: messageFromUI,
        },
        timestamp: Date.now(),
      };

      logger.info(
        `[DEBUG] Server sending RooCode message to agent ${agentId}: ${JSON.stringify(messageToSend)}`,
      );
      agentToSendMessage.socket.send(JSON.stringify(messageToSend));
      logger.info(
        `Forwarded message to RooCode via agent ${agentId}: ${messageFromUI}`,
      );
      break;
    case EMessageFromUI.CreateTask:
      try {
        const task = message.details?.task as any;
        const targetAgentId = task?.agentId || message.details?.agentId;
        const agentSocket = targetAgentId
          ? agentManager.agents.get(targetAgentId)?.socket
          : undefined;
        if (!agentSocket) {
          logger.warn(`Agent ${targetAgentId} not found for CreateTask`);
          return;
        }

        const createTaskMsg: IMessageFromServer = {
          messageType: EMessageFromServer.CreateTask,
          details: {
            task,
          },
          timestamp: Date.now(),
        };
        agentSocket.send(JSON.stringify(createTaskMsg));
        logger.info(`Forwarded CreateTask to agent ${targetAgentId}: ${task?.id}`);
      } catch (err) {
        logger.error("Failed to forward CreateTask to agent", err);
      }
      break;
    case EMessageFromUI.StartProcess:
    case EMessageFromUI.StopProcess:
    case EMessageFromUI.GetProcessStatus:
    case EMessageFromUI.ListProcesses:
      logger.info(`Received message from UI: ${messageType} which is not handled`);
      break;

    //   const agentIdToCreateTask = message.details?.agentId;
    //   const agentToAssignTask = agentManager.agents.get(agentIdToCreateTask);
    //   if (!agentToAssignTask) {
    //     logger.error(
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
    //   agentToAssignTask.socket.send(JSON.stringify(messageToSend));
    //   logger.info(
    //     `Assigned task ${message.details?.task.id} to agent ${agentIdToCreateTask}`,
    //     );
    //   break;
    case EMessageToServer.Register:
      logger.info(`UI client connected`);
      const messageRegistered: IMessageFromServer = {
        messageType: EMessageFromServer.Registered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
      break;
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

// Function to broadcast agent updates to all UI clients
const broadcastAgentUpdate = (
  uiClients: Set<WebSocket>,
  agentManager: AgentManager,
  action: "connected" | "disconnected",
  agentId: string,
) => {
  const agents = Array.from(agentManager.agents.entries()).map(
    ([id, agent]) => ({
      id,
      status: action === "connected" ? "connected" : "disconnected",
      lastHeartbeat: agent.lastHeartbeat,
      connectedAt: agent.connectedAt,
      metadata: agent.metadata,
      gracePeriod: agent.gracePeriod,
    }),
  );

  const updateMessage: IMessageFromServer = {
    messageType: EMessageFromServer.AgentUpdate,
    details: {
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
  message: IMessageFromAgent,
  socket: WebSocket,
  agentManager: AgentManager,
  uiClients: Set<WebSocket>,
) => {
  const { messageType, agentId } = message;
  // Debug: log every agent message entering the server
  try {
    const preview = JSON.stringify(message.details)?.slice(0, 200);
    logger.info(
      `[AGENT->SERVER] agentId=${agentId} type=${messageType} details=${preview}${preview && preview.length === 200 ? '…' : ''}`,
    );
  } catch {}

  switch (messageType) {
    case EMessageToServer.Register:
      // Use the agent's provided ID instead of generating a new one
      const registredAgentId = agentManager.registerAgentWithId(
        agentId, // Use the agent's provided ID
        socket,
        message.metadata,
      );
      const totalAgentsAfterReg = agentManager.agents.size;
      logger.info(
        `[DEBUG] Agent connected: ${registredAgentId}. Total agents: ${totalAgentsAfterReg}`,
      );

      // List all current agent IDs for debugging
      const allAgentIds = Array.from(agentManager.agents.keys());
      logger.info(
        `[DEBUG] All registered agent IDs: ${allAgentIds.join(", ")}`,
      );

      const messageRegistered: IMessageFromServer = {
        messageType: EMessageFromServer.Registered,
        agentId: registredAgentId,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));

      // Broadcast agent update to UI clients
      broadcastAgentUpdate(
        uiClients,
        agentManager,
        "connected",
        registredAgentId,
      );
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
    case EMessageFromAgent.RooCodeResponse:
      logger.info(`[AGENT->SERVER] RooCodeResponse received from ${agentId}`);
      // Forward RooCode response (partial or final) to all UI clients
      const agentResponse = agentManager.getAgent(agentId);
      if (!agentResponse) {
        logger.warn(`Agent ${agentId} not found for RooCode response`);
        return;
      }

      const isPartial = !!message?.details?.partial;
      const extensionId = message?.details?.extensionId as string | undefined;
      // Sanitize overly-technical content so UI does not filter it out
      const rawResponse = String(message?.details?.response ?? "");
      const sanitizedResponse = rawResponse
        // Remove JSON keys that UI filters on
        .replace(/\"apiProtocol\"\s*:\s*\".*?\"/g, '')
        .replace(/\"tokensIn\"\s*:\s*\d+/g, '')
        .replace(/\"tokensOut\"\s*:\s*\d+/g, '')
        .replace(/\"cacheWrites\"\s*:\s*\d+/g, '')
        .replace(/\"cacheReads\"\s*:\s*\d+/g, '')
        .replace(/\"cost\"\s*:\s*\d+(?:\.\d+)?/g, '')
        // Remove environment_details blocks
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/g, '')
        // Remove Current time boilerplate
        .replace(/Current time in ISO 8601 UTC format:[^\n]*/g, '')
        // Clean up extra commas and whitespace from JSON-looking strings
        .replace(/,\s*,/g, ',')
        .replace(/\{\s*,/g, '{')
        .replace(/,\s*\}/g, '}')
        .trim();

      const responseMessage: IMessageFromServer = {
        messageType: isPartial
          ? EMessageFromServer.RooCodePartial
          : EMessageFromServer.RooCodeResponse,
        details: {
          agentId,
          extensionId,
          response: sanitizedResponse || rawResponse,
        },
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
      logger.info(
        `Forwarded RooCode ${isPartial ? "partial" : "final"} response from agent ${agentId}${extensionId ? ` (ext ${extensionId})` : ""} to ${uiClients.size} UI clients: ${(message as any).details?.response}`,
      );
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
