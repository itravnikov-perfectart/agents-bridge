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
  RooCodeMessage = "rooCodeMessage",
  RooCodeResponse = "rooCodeResponse",
  RooCodePartial = "rooCodePartial",
  RooCodeCommand = "rooCodeCommand",
  CreateTask = "createTask",
}

export enum EMessageFromUI {
  GetAgents = "getAgents",
  CreateTask = "createTask",
  SendMessageToTask = "sendMessageToTask",
  GetActiveTaskIds = "getActiveTaskIds",
  GetProfiles = "getProfiles",
  GetActiveProfile = "getActiveProfile",
  SetConfiguration = "setConfiguration",
  GetConfiguration = "getConfiguration",
  Register = "register",
  Unregister = "unregister",
  SendToRooCode = "sendToRooCode",
  RooCodeCommand = "rooCodeCommand",
}

export enum EMessageFromAgent {
  Register = "register",
  Unregister = "unregister",
  Pong = "pong",
  Ping = "ping",
  AgentResponse = "agentResponse",
  ActiveTaskIdsResponse = "activeTaskIdsResponse",
  ProfilesResponse = "profilesResponse", 
  ActiveProfileResponse = "activeProfileResponse",
  TaskStartedResponse = "taskStartedResponse",
  MessageSentResponse = "messageSentResponse",
  ConfigurationApplied = "configurationApplied",
  RooCodeResponse = "rooCodeResponse",
  RooCodeEvent = "rooCodeEvent",
  RooCodeCommandResponse = "rooCodeCommandResponse",
  RooCodeStatus = "rooCodeStatus",
  RooCodeConfiguration = "rooCodeConfiguration",
  RooCodeProfiles = "rooCodeProfiles",
  RooCodeTaskHistory = "rooCodeTaskHistory",
  RooCodeTaskDetails = "rooCodeTaskDetails",
}

export enum EMessageToServer {
  Register = "register",
  Unregister = "unregister",
}

export enum ERooCodeCommand {
  GetStatus = "getStatus",
  GetConfiguration = "getConfiguration",
  SetConfiguration = "setConfiguration",
  GetProfiles = "getProfiles",
  GetActiveProfile = "getActiveProfile",
  SetActiveProfile = "setActiveProfile",
  CreateProfile = "createProfile",
  UpdateProfile = "updateProfile",
  DeleteProfile = "deleteProfile",
  GetTaskHistory = "getTaskHistory",
  GetTaskDetails = "getTaskDetails",
  ClearCurrentTask = "clearCurrentTask",
  CancelCurrentTask = "cancelCurrentTask",
  ResumeTask = "resumeTask",
  PressPrimaryButton = "pressPrimaryButton",
  PressSecondaryButton = "pressSecondaryButton",
  SendMessage = "sendMessage",
  StartNewTask = "startNewTask",
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
