import { RooCodeEventName, TaskEvent as RooCodeTaskEvent } from "@roo-code/types";

export enum AgentStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  STARTING = 'starting'
}

export interface TaskEvent<T = RooCodeEventName> {
  name: T;
  data: any;
}

export enum ESystemMessage {
  Register = "register",
  Unregister = "unregister",
  Ping = "ping",
  Pong = "pong",
  Error = "error",
}

export enum EMessageFromServer {
  Registered = "registered",
  Unregistered = "unregistered",
  Ping = "ping",
  Error = "error",
  AgentList = "agentList",
  AgentUpdate = "agentUpdate",
}

export enum EMessageFromUI {
  GetAgents = "getAgents",
  CreateTask = "createTask",
  SendMessageToTask = "sendMessageToTask",
  GetActiveTaskIds = "getActiveTaskIds",
  GetProfiles = "getProfiles",
  GetActiveProfile = "getActiveProfile",
}

export enum EMessageFromAgent {
  AgentResponse = "agentResponse",
  ActiveTaskIdsResponse = "activeTaskIdsResponse",
  ProfilesResponse = "profilesResponse", 
  ActiveProfileResponse = "activeProfileResponse",
  TaskStartedResponse = "taskStartedResponse",
  MessageSentResponse = "messageSentResponse",
}

export enum ConnectionSource {
  Agent = "agent",
  UI = "ui",
  Server = "server",
}

export type Message = {
  type: EMessageFromAgent | EMessageFromUI | EMessageFromServer | ESystemMessage;
  source: ConnectionSource;
  timestamp?: number;
  agent?: {
    id?: string;
    workspacePath?: string;
  }
  data?: Record<string, any>;
  event?: RooCodeTaskEvent;
}