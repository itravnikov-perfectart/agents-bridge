export enum ConnectionSource {
  Agent = "agent",
  UI = "ui",
  Server = "server",
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

// RooCode command set used across UI/Server/Extension
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

import type { RooCodeEventName } from '@roo-code/types';

// Base envelope shared by all messages
interface BaseMessageEnvelope {
  source: ConnectionSource;
  timestamp?: number;
  agent?: {
    id?: string;
    workspacePath?: string;
  };
}

// Agent → UI messages (typed where commonly used)
interface AgentResponseMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.AgentResponse;
  // Bridge event envelope as received by UI
  // Matches the adapter output: { eventName, taskId?, message? }
  event: {
    eventName: RooCodeEventName;
    taskId?: string | number;
    message?: Record<string, any>;
    // Allow future fields without breaking
    [key: string]: any;
  };
  data?: undefined;
}

interface ActiveTaskIdsResponseMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.ActiveTaskIdsResponse;
  data: { activeTaskIds: string[] };
  event?: undefined;
}

interface ProfilesResponseMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.ProfilesResponse;
  data: { profiles: string[] };
  event?: undefined;
}

interface ActiveProfileResponseMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.ActiveProfileResponse;
  data: { activeProfile?: string };
  event?: undefined;
}

interface RooCodeCommandResponseMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.RooCodeCommandResponse;
  data: { command: string; success: boolean; result?: any; error?: string; extensionId?: string; taskId?: string };
  event?: undefined;
}

interface RooCodeTaskHistoryMessage extends BaseMessageEnvelope {
  type: EMessageFromAgent.RooCodeTaskHistory;
  data: { taskId?: string; history?: any[]; messages?: any[] };
  event?: undefined;
}

// Fallback for other messages we haven't modeled yet
interface GenericAgentMessage extends BaseMessageEnvelope {
  type:
    | EMessageFromAgent.Register
    | EMessageFromAgent.Unregister
    | EMessageFromAgent.Ping
    | EMessageFromAgent.Pong
    | EMessageFromAgent.MessageSentResponse
    | EMessageFromAgent.TaskStartedResponse
    | EMessageFromAgent.ConfigurationApplied
    | EMessageFromAgent.RooCodeResponse
    | EMessageFromAgent.RooCodeEvent
    | EMessageFromAgent.RooCodeStatus
    | EMessageFromAgent.RooCodeConfiguration
    | EMessageFromAgent.RooCodeProfiles
    | EMessageFromAgent.RooCodeTaskDetails;
  data?: Record<string, any>;
  event?: any;
}

// UI → Server/Agent messages (leave data generic for now)
interface UIMessage extends BaseMessageEnvelope {
  type: EMessageFromUI;
  data?: Record<string, any>;
  event?: undefined;
}

// Server → UI/Agent messages
interface ServerMessage extends BaseMessageEnvelope {
  type: EMessageFromServer | ESystemMessage;
  data?: Record<string, any>;
  event?: undefined;
}

export type Message =
  | AgentResponseMessage
  | ActiveTaskIdsResponseMessage
  | ProfilesResponseMessage
  | ActiveProfileResponseMessage
  | RooCodeCommandResponseMessage
  | RooCodeTaskHistoryMessage
  | GenericAgentMessage
  | UIMessage
  | ServerMessage;
