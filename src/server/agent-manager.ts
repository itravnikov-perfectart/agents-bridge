import { logger } from "../utils/logger";
import { AgentConnection } from "./types";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

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
      metadata,
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
    this.agents.forEach((agent) => {
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
        agent.socket.close(4001, "Heartbeat timeout");
        this.agents.delete(id);
      }
    });
  }
}
