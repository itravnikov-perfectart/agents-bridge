import { EConnectionSource, EMessageFromAgent, EMessageFromServer, EMessageFromUI } from "./message.enum";
import { RooCodeEventName, TaskEvent } from "@roo-code/types";

export interface Message {
  type: EMessageFromAgent | EMessageFromUI | EMessageFromServer;
  source: EConnectionSource;
  timestamp?: number;
  agent?: {
    id: string;
    workspacePath: string;
  }
  data: Record<string, any>;
  event?: TaskEvent;
}

export interface AuthMessage {
  type: "authenticate";
  token: string;
}

export interface AuthError {
  code: number;
  message: string;
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

export interface Agent {
  id: string;
  socket: any;
  lastHeartbeat: number;
  connectedAt: number;
  metadata?: {
    workspacePath?: string;
    agentId?: string;
  };
  gracePeriod: number;
}

export interface AgentMaestroConfiguration {
  defaultRooIdentifier: string;
  rooVariantIdentifiers: string[];
  websocketPort: number;
  redisConfig?: RedisConfig;
  workerConfig?: WorkerConfig;
}

// Redis/bullmq removed from extension side

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface WorkerConfig {
  concurrency: number;
  timeout: number;
}

export interface IMessageFromAgent {
  messageType: EMessageFromAgent;
  connectionType: EConnectionSource;
  agentId: string;
  details: {
    extensionId?: string;
    isReady?: boolean;
    lastHeartbeat?: number;
    activeTaskIds?: string[];
    configuration?: any;
    profiles?: string[];
    activeProfile?: string;
    taskHistory?: any[];
    event?: any;
    eventName?: string;
    eventData?: any[];
    timestamp?: number;
    [key: string]: any;
  };
}

export interface IMessageFromServer {
  messageType: EMessageFromServer;
  details?: {
    agents?: any[];
    message?: string;
    command?: string;
    parameters?: any;
    extensionId?: string;
    task?: any;
    timestamp?: number;
    [key: string]: any;
  };
  timestamp?: number;
}

export interface IMessageFromUI {
  messageType: EMessageFromUI;
  connectionType: EConnectionSource;
  details?: {
    agentId?: string;
    message?: string;
    options?: any;
    [key: string]: any;
  };
}

export interface TMessageToServer {
  messageType: EMessageFromUI | EMessageFromAgent;
  connectionType: EConnectionSource;
  agentId?: string;
  details?: Record<string, any>;
}

export interface IRooCodeCommand {
  command: string;
  extensionId?: string;
  parameters?: any;
  taskId?: string;
}

export interface IRooCodeCommandResponse {
  command: string;
  success: boolean;
  result?: any;
  error?: string;
  extensionId?: string;
  taskId?: string;
}
