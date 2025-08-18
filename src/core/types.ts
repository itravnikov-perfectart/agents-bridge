import { RooCodeEventName } from "@roo-code/types";

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