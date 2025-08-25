export enum EMessageFromServer {
  Registered = "registered",
  Unregistered = "unregistered",
  Ping = "ping",
  Error = "error",
  TaskAssigned = "taskAssigned",
  AgentList = "agentList",
  RooCodeMessage = "rooCodeMessage",
  CreateTask = "createTask",
}

export enum EMessageToServer {
  Register = "register",
  Unregister = "unregister",
}

export enum EMessageFromUI {
  GetAgents = "getAgents",
  SendToRooCode = "sendToRooCode",
  StartProcess = "startProcess",
  StopProcess = "stopProcess",
  GetProcessStatus = "getProcessStatus",
  ListProcesses = "listProcesses",
  CreateTask = "createTask",
}

export enum EMessageFromAgent {
  TaskAssigned = "agentTaskAssigned",
  // TaskResult = "taskResult",
  Pong = "pong",
  Ping = "ping",
}

export type TMessage =
  | EMessageFromServer
  | EMessageFromUI
  | EMessageFromAgent
  | EMessageToServer;

export enum EConnectionType {
  Agent = "agent",
  UI = "ui",
}
