export enum EConnectionSource {
  Agent = "agent",
  UI = "ui",
  Server = "server",
}

// Alias for backward compatibility
export enum EConnectionType {
  Agent = "agent",
  UI = "ui",
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
  TaskAssigned = "taskAssigned",
  RooCodeMessage = "rooCodeMessage",
  RooCodeResponse = "rooCodeResponse",
  RooCodePartial = "rooCodePartial",
  CreateTask = "createTask",
  RooCodeCommand = "rooCodeCommand",
  RooCodeCommandResponse = "rooCodeCommandResponse",
}

export enum EMessageToServer {
  Register = "register",
  Unregister = "unregister",
}

export enum EMessageFromUI {
  Register = "register",
  Unregister = "unregister",
  GetAgents = "getAgents",
  SendToAgent = "sendToAgent",
  GetActiveTaskIds = "getActiveTaskIds",
  GetProfiles = "getProfiles",
  GetActiveProfile = "getActiveProfile",
  SendToRooCode = "sendToRooCode",
  SendMessageToTask = "sendMessageToTask",
  StartProcess = "startProcess",
  StopProcess = "stopProcess",
  GetProcessStatus = "getProcessStatus",
  ListProcesses = "listProcesses",
  CreateTask = "createTask",
  RooCodeCommand = "rooCodeCommand",
  GetRooCodeStatus = "getRooCodeStatus",
  GetRooCodeConfiguration = "getRooCodeConfiguration",
  SetRooCodeConfiguration = "setRooCodeConfiguration",
  GetRooCodeProfiles = "getRooCodeProfiles",
  CreateRooCodeProfile = "createRooCodeProfile",
  UpdateRooCodeProfile = "updateRooCodeProfile",
  DeleteRooCodeProfile = "deleteRooCodeProfile",
  SetRooCodeActiveProfile = "setRooCodeActiveProfile",
  GetRooCodeTaskHistory = "getRooCodeTaskHistory",
  GetRooCodeTaskDetails = "getRooCodeTaskDetails",
  ClearRooCodeCurrentTask = "clearRooCodeCurrentTask",
  CancelRooCodeCurrentTask = "cancelRooCodeCurrentTask",
  ResumeRooCodeTask = "resumeRooCodeTask",
  PressRooCodePrimaryButton = "pressRooCodePrimaryButton",
  PressRooCodeSecondaryButton = "pressRooCodeSecondaryButton",
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
  TaskAssigned = "agentTaskAssigned",
  RooCodeResponse = "rooCodeResponse",
  RooCodeEvent = "rooCodeEvent",
  RooCodeCommandResponse = "rooCodeCommandResponse",
  RooCodeStatus = "rooCodeStatus",
  RooCodeConfiguration = "rooCodeConfiguration",
  RooCodeProfiles = "rooCodeProfiles",
  RooCodeTaskHistory = "rooCodeTaskHistory",
  RooCodeTaskDetails = "rooCodeTaskDetails",
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

export type TMessage =
  | EMessageFromServer
  | EMessageFromUI
  | EMessageFromAgent
  | EMessageToServer;
