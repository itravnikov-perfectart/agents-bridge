// Centralize all message types in shared
export {
  ConnectionSource as EConnectionSource,
  ESystemMessage,
  EMessageFromServer,
  EMessageFromUI,
  EMessageFromAgent,
  ERooCodeCommand
} from 'agents-bridge-shared';

// Backward-compatibility alias (kept to avoid breaking imports)
export enum EMessageToServer {
  Register = 'register',
  Unregister = 'unregister'
}

// Convenience union type sourced from shared enums
export type TMessage =
  | import('agents-bridge-shared').EMessageFromServer
  | import('agents-bridge-shared').EMessageFromUI
  | import('agents-bridge-shared').EMessageFromAgent
  | EMessageToServer;
