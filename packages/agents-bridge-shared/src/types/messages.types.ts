export type MessageType = 'user' | 'agent';

export type UserMessage = {
  type: 'user';
  content: string;
};

export type AgentMessage = {
  type: 'agent';
  content: string;
};

export type ChatMessage = UserMessage | AgentMessage;
