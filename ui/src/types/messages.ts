// Импортируем енумы из оригинального проекта
import {
  EConnectionType,
  EMessageToServer,
  EMessageFromUI,
  EMessageFromServer,
} from '../server/message.enum';

// Базовый интерфейс для сообщений на сервер
export interface IMessageToServer {
  metadata?: Record<string, unknown>;
  details?: Record<string, any>;
}

// Сообщение от UI клиента
export interface IMessageFromUI extends IMessageToServer {
  messageType: EMessageFromUI | EMessageToServer;
  connectionType: EConnectionType.UI;
}

// Сообщение от агента  
export interface IMessageFromAgent extends IMessageToServer {
  messageType: any; // Будет использоваться позже
  connectionType: EConnectionType.Agent;
  agentId: string;
}

// Сообщение от сервера
export interface IMessageFromServer extends IMessageToServer {
  messageType: EMessageFromServer;
  agentId?: string;
  timestamp?: number;
}

// Объединенный тип всех сообщений на сервер
export type TMessageToServer = IMessageFromUI | IMessageFromAgent;
