import { RooCodeEventName } from "@roo-code/types";

export interface AuthMessage {
  type: 'authenticate';
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
  status: 'unknown' | 'created' | 'running' | 'stopped' | 'failed' | 'completed';
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