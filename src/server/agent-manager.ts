import { logger } from "../utils/serverLogger";
import {
  EConnectionType,
  EMessageFromAgent,
  EMessageFromServer,
} from "./message.enum";
import {
  AgentConnection,
  IMessageFromAgent,
  IMessageFromServer,
} from "./types";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

export class AgentManager {
  public agents = new Map<string, AgentConnection>();
  private pingInterval: number;
  private heartbeatTimeout: number;
  private pingIntervalId?: NodeJS.Timeout;

  constructor(pingInterval: number, timeoutMultiplier: number = 5) {
    this.pingInterval = pingInterval;
    this.heartbeatTimeout = pingInterval * timeoutMultiplier;
    this.startHeartbeatPing();
  }

  registerAgent(socket: WebSocket, metadata?: Record<string, unknown>): string {
    const agentId = uuidv4();
    const now = Date.now();
    this.agents.set(agentId, {
      id: agentId,
      socket,
      lastHeartbeat: now,
      lastPingSent: now,
      connectedAt: now,
      gracePeriod: true, // Don't ping immediately, give client time to establish
      metadata,
    });
    logger.info(`Agent ${agentId} registered with metadata:`, metadata);

    // Remove grace period after 30 seconds
    setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.gracePeriod = false;
        logger.info(
          `Grace period ended for agent ${agentId}, will now send pings`,
        );
      }
    }, 30000);

    return agentId;
  }

  registerAgentWithId(agentId: string, socket: WebSocket, metadata?: Record<string, unknown>): string {
    const now = Date.now();
    this.agents.set(agentId, {
      id: agentId,
      socket,
      lastHeartbeat: now,
      lastPingSent: now,
      connectedAt: now,
      gracePeriod: true, // Don't ping immediately, give client time to establish
      metadata,
    });
    logger.info(`Agent ${agentId} registered with metadata:`, metadata);

    // Remove grace period after 30 seconds
    setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.gracePeriod = false;
        logger.info(`Grace period ended for agent ${agentId}, will now send pings`);
      }
    }, 30000);

    return agentId;
  }

  // Send ping messages to all connected agents
  sendHeartbeatPings(): void {
    const now = Date.now();
    this.agents.forEach((agent, id) => {
      // Skip agents in grace period
      if (agent.gracePeriod) {
        logger.info(`Agent ${id} in grace period, skipping ping`);
        return;
      }

      if (agent.socket.readyState === WebSocket.OPEN) {
        try {
          const messageToSend: IMessageFromServer = {
            messageType: EMessageFromServer.Ping,
            details: {
              timestamp: now,
            },
          };
          agent.socket.send(JSON.stringify(messageToSend));
          agent.lastPingSent = now;
          logger.info(`Ping sent to agent ${id} at ${now}`);
        } catch (error) {
          logger.error(`Failed to send ping to agent ${id}:`, error);
          this.agents.delete(id);
        }
      } else {
        logger.warn(
          `Agent ${id} socket not in OPEN state (${agent.socket.readyState}), removing`,
        );
        this.agents.delete(id);
      }
    });
  }

  // Start the heartbeat ping interval
  startHeartbeatPing(): void {
    this.pingIntervalId = setInterval(() => {
      this.sendHeartbeatPings();
    }, this.pingInterval);
  }

  // Stop the heartbeat ping interval
  stopHeartbeatPing(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  updateHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      logger.info(`Agent ${agentId} heartbeat updated`);
    }
  }

  getAgent(agentId: string): AgentConnection | undefined {
    return this.agents.get(agentId);
  }

  broadcast(message: IMessageFromServer): void {
    this.agents.forEach((agent) => {
      if (agent.socket.readyState === WebSocket.OPEN) {
        agent.socket.send(JSON.stringify(message));
      }
    });
  }

  checkHealth(): void {
    const now = Date.now();
    this.agents.forEach((agent, id) => {
      const timeSinceLastHeartbeat = now - agent.lastHeartbeat;
      const timeSinceConnected = now - agent.connectedAt;

      // During grace period, use a more lenient timeout
      const effectiveTimeout = agent.gracePeriod
        ? Math.max(this.heartbeatTimeout, 60000) // At least 60 seconds during grace period
        : this.heartbeatTimeout;

      if (timeSinceLastHeartbeat > effectiveTimeout) {
        logger.warn(
          `Agent ${id} heartbeat timeout (${timeSinceLastHeartbeat}ms since last heartbeat, connected ${timeSinceConnected}ms ago, gracePeriod: ${agent.gracePeriod})`,
        );
        agent.socket.close(4001, "Heartbeat timeout");
        this.agents.delete(id);
      } else {
        logger.info(
          `Agent ${id} healthy (${timeSinceLastHeartbeat}ms since last heartbeat, gracePeriod: ${agent.gracePeriod})`,
        );
      }
    });
  }

  // Cleanup method
  destroy(): void {
    this.stopHeartbeatPing();
    this.agents.clear();
  }
}
