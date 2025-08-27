import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { ConnectionSource, Message, EMessageFromServer, EMessageFromUI, ESystemMessage, EMessageFromAgent} from '../../../core/types'
import { useAddAgents, useUpdateAgents } from '../queries/useAgents';
import { getMessagesByTaskId, useAddMessage, useAddMessages } from '../queries/useMessages';
import { getTasksByAgentId, useAddTask, useAddTasks, useUpdateTask } from '../queries/useTasks';
import { useAddProfiles, useUpdateActiveProfile } from '../queries/useProfiles';
import { useQueryClient } from '@tanstack/react-query';
import { RooCodeEventName } from '@roo-code/types';

export interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connectionAttempts: number;
  
  // Основные методы
  sendMessage: (message: Message) => void;
  reconnect: () => void;

  getAgents: () => void;
  getActiveTaskIds: (agentId: string) => void;
  getProfiles: (agentId: string) => void;
  getActiveProfile: (agentId: string) => void;
  startNewTask: (agentId: string, taskId: string, message: string, profile?: string | null) => void;
  sendMessageToTask: (agentId: string, taskId: string, message: string) => void;
  
  onConnectionStateChange: (handler: (isConnected: boolean) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps extends React.PropsWithChildren {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url = 'ws://localhost:8080',
  reconnectInterval = 1000,
  maxReconnectAttempts = 10,
  heartbeatInterval = 30000,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const queryClient = useQueryClient();

  const addAgentsMutation = useAddAgents();
  const updateAgentsMutation = useUpdateAgents();
  const addMessageMutation = useAddMessage();
  const addMessagesMutation = useAddMessages();
  const updateTaskMutation = useUpdateTask();
  const addTasksMutation = useAddTasks();
  const addProfilesMutation = useAddProfiles();
  const updateActiveProfileMutation = useUpdateActiveProfile();
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uiClientIdRef = useRef(`ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  const connectionHandlersRef = useRef<Set<(isConnected: boolean) => void>>(new Set());
  
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const notifyConnectionHandlers = useCallback((connected: boolean) => {
    connectionHandlersRef.current.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Ошибка в обработчике состояния подключения:', error);
      }
    });
  }, []);

  const handleServerMessage = useCallback((message: Message) => {
    switch (message.type) {
      case EMessageFromServer.AgentList:
        addAgentsMutation.mutate(message.data?.agents || []);
        break;
      case EMessageFromServer.AgentUpdate:
        updateAgentsMutation.mutate(message.data?.agents || []);
        break;
    }
  }, []);

  const handleAgentMessage = useCallback((message: Message) => {
    switch (message.type) {
      case EMessageFromAgent.AgentResponse:
        switch (message.event?.eventName) {
          case RooCodeEventName.TaskCreated:
            getActiveTaskIds(message.agent?.id || "");
            break;
          case RooCodeEventName.Message:

            console.log('isEmpty',!message.event?.message.text, message.event?.message.text, message.event, )
            const isEmpty = !message.event?.message.text
            const isPartial = message.event?.message.partial
            if (isEmpty || isPartial) {
              break;
            }
            const isUser = message.event?.message.say === 'user_feedback'
            addMessageMutation.mutate({
              taskId: message.event!.taskId!.toString(),
              message: {
                type: isUser ? 'user' : 'agent',
                content: message.event?.message?.text
              }
            });
            break;
        }
        
        break;
      case EMessageFromAgent.ActiveTaskIdsResponse:
        addTasksMutation.mutate({
          agentId: message.agent?.id || "",
          tasks: message.data?.taskIds.map((taskId: string) => ({
            id: taskId,
            agentId: message.agent?.id || "",
          })) || []
        });
        break;
      case EMessageFromAgent.ProfilesResponse:
        addProfilesMutation.mutate(message.data?.profiles || []);
        break;
      case EMessageFromAgent.ActiveProfileResponse:
        updateActiveProfileMutation.mutate(message.data?.activeProfile);
        break;
      case EMessageFromAgent.TaskStartedResponse:
        console.log('TaskCreatedResponse', message)
        if (message.data?.clientTaskId && message.data?.agentTaskId) {
          const previousMessages = queryClient.getQueryData(getMessagesByTaskId(message.data?.clientTaskId).queryKey);

          addMessagesMutation.mutate({
            taskId: message.data?.agentTaskId || "",
            messages: previousMessages || []
          });

          updateTaskMutation.mutate({
            agentId: message.agent?.id || "",
            taskId: message.data?.clientTaskId || "",
            task: {
              id: message.data?.agentTaskId || "",
              agentId: message.agent?.id || "",
              isNewTask: false,
            }
          });
        } else {
          addTasksMutation.mutate({
            agentId: message.agent?.id || "",
            tasks: [{
              id: message.data?.agentTaskId || "",
              agentId: message.agent?.id || "",
            }]
          });
        }
        break;

    }
  }, []);


  const connect = useCallback(() => {
    if (connectionAttempts >= maxReconnectAttempts) {
      console.error('🚫 Достигнуто максимальное количество попыток переподключения');
      setIsConnecting(false);
      return;
    }

    if (isConnecting) {
      console.log('🔒 Подключение уже в процессе...');
      return;
    }

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close(1000, 'Переподключение');
    }

    clearTimers();
    setIsConnecting(true);
    setConnectionAttempts(prev => {
      const newAttempts = prev + 1;
      console.log(`🔗 Подключение к WebSocket (попытка ${newAttempts}/${maxReconnectAttempts})`);
      return newAttempts;
    });

    const websocket = new WebSocket(url);

    websocket.onopen = () => {
      console.log('🔗 WebSocket подключен');
      
      wsRef.current = websocket;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionAttempts(0);
      notifyConnectionHandlers(true);

      // Регистрируемся как UI клиент
      const registerMessage: Message = {
        type: ESystemMessage.Register,
        source: ConnectionSource.UI,
        data: {
          uiClientId: uiClientIdRef.current,
        },
      };

      try {
        websocket.send(JSON.stringify(registerMessage));
      } catch (error) {
        console.error('❌ Ошибка отправки сообщения регистрации:', error);
      }

      heartbeatIntervalRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          try {
            const pingMessage: Message = {
              type: ESystemMessage.Ping,
              source: ConnectionSource.UI,
              data: { ping: true, timestamp: Date.now() },
            };
            websocket.send(JSON.stringify(pingMessage));
          } catch (error) {
            console.warn('💓 Ошибка heartbeat, переподключение...', error);
            connect();
          }
        } else {
          console.log('🔌 WebSocket не открыт во время heartbeat, переподключение...');
          connect();
        }
      }, heartbeatInterval);
    };

    // Обработчик входящих сообщений
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Message;
        console.log('🔔 Получено WebSocket сообщение:', message);

        switch (message.source) {
          case ConnectionSource.Server:
            handleServerMessage(message);
            break;
          case ConnectionSource.Agent:
            handleAgentMessage(message);
            break;
        }

      } catch (error) {
        console.error('❌ Ошибка обработки WebSocket сообщения:', error);
      }
    };

    // Обработчик ошибок
    websocket.onerror = (error) => {
      console.error('❌ Ошибка WebSocket:', error);
      setIsConnected(false);
      setIsConnecting(false);
      notifyConnectionHandlers(false);
      clearTimers();
    };

    // Обработчик закрытия соединения
    websocket.onclose = (event) => {
      const { code, reason } = event;
      console.log(`🔌 WebSocket соединение закрыто:`, {
        code,
        reason,
        wasClean: event.wasClean,
        attempt: connectionAttempts
      });

      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;
      notifyConnectionHandlers(false);
      clearTimers();

      // Автоматическое переподключение при необходимости
      const shouldReconnect = 
        code !== 1000 && // не нормальное закрытие
        code !== 1001 && // уход пользователя
        connectionAttempts < maxReconnectAttempts;

      if (shouldReconnect) {
        const delay = Math.min(reconnectInterval * Math.pow(2, connectionAttempts), 30000);
        console.log(`🔄 Планируется переподключение через ${delay}мс...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isConnected && !isConnecting) {
            connect();
          }
        }, delay);
      } else {
        console.log('🚫 Переподключение не требуется:', 
          code === 1000 ? 'Нормальное закрытие' : 
          code === 1001 ? 'Уход пользователя' : 
          'Достигнуто максимальное количество попыток'
        );
      }
    };
  }, []);

  // Отправка сообщения
  const sendMessage = useCallback((message: Message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        if (!isConnecting) {
          connect();
        }
      }
    } else {
      console.warn('⚠️ WebSocket не подключен, текущее состояние:', 
        wsRef.current ? 
          wsRef.current.readyState === WebSocket.CONNECTING ? 'ПОДКЛЮЧЕНИЕ' :
          wsRef.current.readyState === WebSocket.CLOSING ? 'ЗАКРЫТИЕ' :
          wsRef.current.readyState === WebSocket.CLOSED ? 'ЗАКРЫТО' : 'НЕИЗВЕСТНО'
        : 'NULL'
      );
      
      if (!isConnecting && !isConnected) {
        console.log('🔄 Автоматическое переподключение...');
        connect();
      }
    }
  }, [isConnecting, isConnected, connect]);

  // Ручное переподключение
  const reconnect = useCallback(() => {
    console.log('🔄 Запрошено ручное переподключение');
    
    setConnectionAttempts(0);
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Ручное переподключение');
    }
    
    clearTimers();
    setIsConnected(false);
    setIsConnecting(false);
    
    setTimeout(() => connect(), 100);
  }, [connect, clearTimers]);

  const getActiveTaskIds = useCallback(async (agentId: string) => {
    const message: Message = {
      type: EMessageFromUI.GetActiveTaskIds,
      source: ConnectionSource.UI,
      agent: { id: agentId },
    };
    
    sendMessage(message);
  }, [sendMessage]);

  const getAgents = useCallback(async () => {
    const message: Message = {
      type: EMessageFromUI.GetAgents,
      source: ConnectionSource.UI,
    };
    
    sendMessage(message);
  }, [sendMessage]);


  const getProfiles = useCallback(async (agentId: string) => {
    const message: Message = {
      type: EMessageFromUI.GetProfiles,
      source: ConnectionSource.UI,
      agent: { id: agentId },
    };
    
    sendMessage(message);
  }, [sendMessage]);

  const getActiveProfile = useCallback(async (agentId: string) => {
    const message: Message = {
      type: EMessageFromUI.GetActiveProfile,
      source: ConnectionSource.UI,
      agent: { id: agentId },
    };
    
    sendMessage(message);
  }, [sendMessage]);

  const startNewTask = useCallback(async (agentId: string, taskId: string, message: string, profile?: string | null) => {
    const wsMessage: Message = {
      type: EMessageFromUI.CreateTask,
      source: ConnectionSource.UI,
      agent: { id: agentId },
      data: { 
        taskId, 
        message, 
        ...(profile ? { profile } : {})
      },
    };
    
    sendMessage(wsMessage);
  }, [sendMessage]);

  const sendMessageToTask = useCallback(async (agentId: string, taskId: string, message: string) => {
    const wsMessage: Message = {
      type: EMessageFromUI.SendMessageToTask,
      source: ConnectionSource.UI,
      agent: { id: agentId },
      data: { taskId, message },
    };
    
    sendMessage(wsMessage);
  }, [sendMessage]);

  const onConnectionStateChange = useCallback((handler: (isConnected: boolean) => void) => {
    connectionHandlersRef.current.add(handler);
    return () => {
      connectionHandlersRef.current.delete(handler);
    };
  }, []);

  // Эффект для автоматического подключения при монтировании
  useEffect(() => {
    connect();
    
    return () => {
      console.log('🧹 Очистка WebSocket соединения');
      clearTimers();
      
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // Значение контекста
  const contextValue: WebSocketContextType = {
    isConnected,
    isConnecting,
    connectionAttempts,
    sendMessage,
    reconnect,
    getAgents,
    getActiveTaskIds,
    getProfiles,
    getActiveProfile,
    startNewTask,
    sendMessageToTask,
    onConnectionStateChange,
  };

  return React.createElement(
    WebSocketContext.Provider,
    { value: contextValue },
    children
  );
};

// Хук для использования WebSocket контекста
export const useWebSocketConnection = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketConnection должен использоваться внутри WebSocketProvider');
  }
  return context;
};

// Экспорт по умолчанию
export default WebSocketProvider;
