import { RooCodeEventName } from "@roo-code/types";
import { WebSocket } from "ws";
import {
  EConnectionType,
  EMessageFromAgent,
  EMessageFromServer,
  EMessageFromUI,
  EMessageToServer,
} from "./message.enum";

export interface AuthMessage {
  type: "authenticate";
  token: string;
}

export interface AuthError {
  code: number;
  message: string;
}

export interface TaskEvent<T = RooCodeEventName> {
  name: T;
  data: any;
}

export interface ProcessEvent {
  type: string;
  processId: string;
  timestamp: number;
  exitCode?: number;
  outputType?: string;
  data?: any;
  error?: Error;
}

export interface ProcessStatus {
  pid?: number;
  containerId?: string;
  jobId?: string;
  status:
    | "unknown"
    | "created"
    | "running"
    | "stopped"
    | "failed"
    | "completed";
  exitCode?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  startTime?: number;
  endTime?: number;
  command?: string;
  image?: string;
  host?: string;
  ports?: number[];
  queue?: string;
  progress?: number;
  websocketConnected?: boolean;
  lastHeartbeat?: number;
  error?: string;
}

export interface ProcessOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  image?: string;
  ports?: number[];
  autoRestart?: boolean;
}
export interface Controller {
  id: string;
  workspace_path: string;
  config: string;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  controller_id: string;
  type: string;
  status: string;
  result?: string;
  created_at: Date;
}

export interface WebSocketConfig {
  port: number;
  pingInterval?: number;
  connectionTimeout?: number;
}

export interface AgentConnection {
  id: string;
  socket: WebSocket;
  lastHeartbeat: number;
  lastPingSent: number;
  connectedAt: number;
  gracePeriod?: boolean;
  metadata?: Record<string, unknown>;
}

// Redis/bullmq removed from extension side

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface WorkerConfig {
  queueName: string;
  redis: RedisConfig;
  concurrency?: number;
}

export interface IMessageToServer<D = Record<string, any>> {
  metadata?: Record<string, unknown>;
  details?: D;
}

export interface IMessageFromUI extends IMessageToServer {
  messageType: EMessageFromUI | EMessageToServer;
  connectionType: EConnectionType.UI;
}

export interface IMessageFromAgent
  extends IMessageToServer<{
    taskId?: string;
    taskType?: string;
    workspacePath?: string;
    extensionId?: string;
    partial?: boolean;
    response?: string;
    timestamp?: number;
  }> {
  messageType: EMessageFromAgent | EMessageToServer;
  connectionType: EConnectionType.Agent;
  agentId: string;
}

export interface IMessageFromServer extends IMessageToServer {
  messageType: EMessageFromServer;
  agentId?: string;
  timestamp?: number;
}

export type TMessageToServer = IMessageFromUI | IMessageFromAgent;
