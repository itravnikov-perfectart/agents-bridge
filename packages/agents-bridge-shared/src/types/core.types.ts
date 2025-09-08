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
  ShutdownContainer = "shutdownContainer",
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

export type Message = {
  type: EMessageFromAgent | EMessageFromUI | EMessageFromServer | ESystemMessage;
  source: ConnectionSource;
  timestamp?: number;
  agent?: {
    id?: string;
    workspacePath?: string;
  }
  data?: Record<string, any>;
  event?: any;
}
