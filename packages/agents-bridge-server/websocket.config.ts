import { WebSocket, WebSocketServer } from "ws";
import { AgentManager } from "./agent-manager";
import { logger } from "./serverLogger";

import {
  EConnectionSource,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  ESystemMessage,
  Message,
} from "./types";

export interface WebSocketConfig {
  port: number;
  pingInterval?: number;
  connectionTimeout?: number;
  autoApproveTools?: boolean;
  autoFollowups?: boolean;
  autoFollowupDefault?: string;
}

export const createWebSocketServer = (config: WebSocketConfig) => {
  const { port, pingInterval = 10000, connectionTimeout = 30000, autoApproveTools = false, autoFollowups = false, autoFollowupDefault = '' } = config;

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
    let source: EConnectionSource | undefined;
    let agentId: string | undefined;

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        source = message.source;

        logger.info(
          `Received message from ${req.socket.remoteAddress}: ${JSON.stringify(message)}`,
        );

        if (source === EConnectionSource.UI) {
          uiClients.add(socket);
          handleUIConnection(message, socket, agentManager);
        } else if (source === EConnectionSource.Agent) {
          agentId = message.agent?.id;

          handleAgentConnection(
            message,
            socket,
            agentManager,
            uiClients,
            {
              autoApproveTools,
              autoFollowups,
              autoFollowupDefault,
            },
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
        case EConnectionSource.Agent:
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
        case EConnectionSource.UI:
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
        case EConnectionSource.Agent:
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
        case EConnectionSource.UI:
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
          workspacePath: agent.workspacePath,
        }),
      );

      const messageAgentList: Message = {
        source: EConnectionSource.Server,
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
    case EMessageFromUI.GetConfiguration:
    case EMessageFromUI.SetConfiguration:
    case EMessageFromUI.CreateTask:
    case EMessageFromUI.SendMessageToTask:
    case EMessageFromUI.RooCodeCommand:
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



    //   const agentIdToCreateTask = message.details?.agentId;
    //   const agentToAssignTask = agentManager.agents.get(agentIdToCreateTask);
    //   if (!agentToAssignTask) {
    //     logger.error(
    //       `Agent ${agentIdToCreateTask} not found for task assignment`,
    //     );
    //     return;
    //   }

    //   const messageToCreateTask: Message = {
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
    case ESystemMessage.Register:
      logger.info(`UI client connected`);
      const messageRegistered: Message = {
        source: EConnectionSource.Server,
        type: EMessageFromServer.Registered,
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(messageRegistered));
      break;
    case ESystemMessage.Ping:
      // UI heartbeat/ping, acknowledge silently
      break;
    case ESystemMessage.Unregister:
      logger.info(`UI client disconnected`);
      const messageUnregistered: Message = {
        source: EConnectionSource.Server,
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
  action: "connected" | "disconnected",
  agentId: string,
) => {
  const agents = Array.from(agentManager.agents.entries()).map(
    ([id, agent]) => ({
      id,
      status: action === "connected" ? "connected" : "disconnected",
      lastHeartbeat: agent.lastHeartbeat,
      connectedAt: agent.connectedAt,
      gracePeriod: agent.gracePeriod,
      workspacePath: agent.workspacePath,
    }),
  );

  const updateMessage: Message = {
    source: EConnectionSource.Server,
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

type AutoConfig = { autoApproveTools: boolean; autoFollowups: boolean; autoFollowupDefault: string };

const handleAgentConnection = (
  message: Message,
  socket: WebSocket,
  agentManager: AgentManager,
  uiClients: Set<WebSocket>,
  autoConfig: AutoConfig,
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
      logger.info(
        `[DEBUG] Agent connected: ${registredAgentId}. Total agents: ${totalAgentsAfterReg}`,
      );

      // List all current agent IDs for debugging
      const allAgentIds = Array.from(agentManager.agents.keys());
      logger.info(`[DEBUG] All registered agent IDs: ${allAgentIds.join(', ')}`);
      
      const messageRegistered: Message = {
        source: EConnectionSource.Server,
        type: EMessageFromServer.Registered,
        agent: {
          id: registredAgentId,
        },
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
   
    case ESystemMessage.Ping:
      // For non-register messages, check if agent exists
      const agentPing = agentManager.getAgent(agentId);
      if (!agentPing) {
        logger.warn(`Agent ${agentId} not found for ping`);
        return;
      }
      agentManager.updateHeartbeat(agentId);
      // Ping received silently - no logging
      break;
    case ESystemMessage.Pong:
      // For non-register messages, check if agent exists
      const agentPong = agentManager.getAgent(agentId);
      if (!agentPong) {
        logger.warn(`Agent ${agentId} not found for pong`);
        return;
      }
      agentManager.updateHeartbeat(agentId);
      // Pong received silently - no logging
      break;
    case EMessageFromAgent.ProfilesResponse:
    case EMessageFromAgent.ActiveProfileResponse:
    case EMessageFromAgent.TaskStartedResponse:
    case EMessageFromAgent.ActiveTaskIdsResponse:
    case EMessageFromAgent.AgentResponse:
    case EMessageFromAgent.RooCodeCommandResponse:
    case EMessageFromAgent.RooCodeConfiguration:
    case EMessageFromAgent.RooCodeEvent:
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

      // Auto-approval / auto-followup logic
      try {
        const evt: any = (message as any)?.event?.message;
        const taskId: string | undefined = (message as any)?.event?.taskId?.toString?.();
        if (!evt || !taskId) break;

        const say = evt?.say;
        const isAsk = evt?.type === 'ask' || say === 'ask';
        const isPartial = !!evt?.partial;

        if (!isAsk || isPartial) break; // Only act on final ask events

        // If tool approval is requested
        if (autoConfig.autoApproveTools && (evt?.ask === 'tool' || evt?.tool)) {
          // Try to parse JSON payload if present to extract tool
          let toolPayload: any = null;
          const text = evt?.text;
          if (typeof text === 'string' && text.trim().startsWith('{')) {
            try { toolPayload = JSON.parse(text); } catch {}
          }
          const toolName = toolPayload?.tool || evt?.tool?.name || evt?.tool || 'unknown_tool';
          const responseMsg: Message = {
            source: EConnectionSource.UI,
            type: EMessageFromUI.SendMessageToTask,
            agent: { id: agentId },
            data: {
              taskId,
              message: JSON.stringify({ approved: true, tool: toolName, data: toolPayload || evt?.tool || {} })
            },
            timestamp: Date.now(),
          };
          const agentConn = agentManager.getAgent(agentId);
          if (agentConn?.socket?.readyState === WebSocket.OPEN) {
            agentConn.socket.send(JSON.stringify(responseMsg));
            logger.info(`Auto-approved tool '${toolName}' for task ${taskId} on agent ${agentId}`);
          }
          break;
        }

        // Generic follow-up question auto-answer
        if (autoConfig.autoFollowups) {
          const candidates: string[] = [];
          const rawSuggest = (evt?.suggest || evt?.options || evt?.choices || []) as any[];
          if (Array.isArray(rawSuggest)) {
            for (const s of rawSuggest) {
              const val = s?.answer ?? s?.text ?? s?.label ?? s?.value ?? s?.name;
              if (typeof val === 'string' && val.trim()) candidates.push(val.trim());
            }
          }
          if (evt?.buttons) {
            const primary = evt.buttons.primary ?? evt.buttons.ok ?? evt.buttons.confirm;
            const secondary = evt.buttons.secondary ?? evt.buttons.cancel;
            if (typeof primary === 'string' && primary.trim()) candidates.push(primary.trim());
            if (typeof secondary === 'string' && secondary.trim()) candidates.push(secondary.trim());
          }
          let answer = autoConfig.autoFollowupDefault && autoConfig.autoFollowupDefault.trim()
            ? autoConfig.autoFollowupDefault.trim()
            : (candidates[0] || 'Yes');

          const responseMsg: Message = {
            source: EConnectionSource.UI,
            type: EMessageFromUI.SendMessageToTask,
            agent: { id: agentId },
            data: { taskId, message: answer },
            timestamp: Date.now(),
          };
          const agentConn = agentManager.getAgent(agentId);
          if (agentConn?.socket?.readyState === WebSocket.OPEN) {
            agentConn.socket.send(JSON.stringify(responseMsg));
            logger.info(`Auto-answered follow-up for task ${taskId} on agent ${agentId} with: ${answer}`);
          }
        }
      } catch (e) {
        logger.error('Auto-approval/followup handling error:', e);
      }
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
