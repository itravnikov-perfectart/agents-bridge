export type Agent = {
  id: string;
  workspacePath: string;
  status: 'connected' | 'disconnected' | 'timeout';
  lastHeartbeat: number;
  connectedAt: number;
  isRemote?: boolean;
}
