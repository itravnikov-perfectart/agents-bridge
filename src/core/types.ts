export enum AgentStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  STARTING = 'starting'
}

export interface AgentHealth {
  agentId: string;
  status: AgentStatus;
  lastHeartbeat: number;
  containerHealth: string;
  healthy: boolean;
}