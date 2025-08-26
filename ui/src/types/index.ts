// Копируем типы из старого проекта
export interface Agent {
  id: string;
  status: 'connected' | 'disconnected' | 'timeout';
  lastHeartbeat: number;
  connectedAt: number;
  metadata?: Record<string, any>;
  gracePeriod?: boolean;
}

export interface Task {
  id: string;
  agentId: string;
  type: string;
  payload: any;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  type: 'user' | 'agent' | 'loading' | 'partial';
  content: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'error' | 'loading' | 'streaming';
}

export interface Chat {
  id: string;
  agentId: string;
  type: 'general' | 'task' | 'debug';
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  config?: ChatConfig;
}

export interface ChatConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
