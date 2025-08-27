import { TaskEvent } from "@roo-code/types";

export type MessageType = 'user' | 'agent';

export type UserMessage = {
  type: 'user';
  content: string;
}

export type AgentMessage = {
  type: 'agent';
  content: TaskEvent;
}


export type Message = UserMessage | AgentMessage;