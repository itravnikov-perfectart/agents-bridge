import { useState, useEffect, useCallback, useRef } from 'react';
import type { Agent, ChatMessage } from '../types';

// Импортируем типы и енумы из оригинального проекта
import {
  EConnectionType,
  EMessageToServer,
  EMessageFromUI,
  EMessageFromServer,
} from '../server/message.enum';

import type { IMessageFromUI, IMessageFromServer } from '../types/messages';

export interface UseWebSocketReturn {
  agents: Agent[];
  chatMessages: ChatMessage[];
  wsConnected: boolean;
  loading: boolean;
  sendMessage: (message: IMessageFromUI) => void;
  sendToRooCode: (agentId: string, message: string) => Promise<void>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  reconnect: () => void;
  connectionAttempts: number;
}

export function useWebSocket(): UseWebSocketReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('agent-chat-messages');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load chat messages from localStorage:', error);
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  const uiClientId = useRef(`ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const hasConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  // Сохранение сообщений в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('agent-chat-messages', JSON.stringify(chatMessages));
    } catch (error) {
      console.warn('Failed to save chat messages to localStorage:', error);
    }
  }, [chatMessages]);

  const connectWebSocket = useCallback(() => {
    // Проверяем, не превышено ли количество попыток переподключения
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error('🚫 Max reconnection attempts reached');
      setLoading(false);
      return;
    }

    if (isConnecting) {
      console.log('🔒 Already connecting...');
      return;
    }

    // Очищаем предыдущее соединение
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      console.log('🔌 Closing existing connection');
      ws.close(1000, 'Reconnecting');
      setWs(null);
    }

    // Очищаем таймеры
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setIsConnecting(true);
    reconnectAttemptsRef.current += 1;

    console.log(`🔗 Connecting to WebSocket (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
    
    const websocket = new WebSocket('ws://localhost:8080');
    
    // Устанавливаем таймаут для подключения
    const connectionTimeout = setTimeout(() => {
      if (websocket.readyState === WebSocket.CONNECTING) {
        console.log('⏰ Connection timeout');
        websocket.close();
      }
    }, 10000); // 10 секунд таймаут

    websocket.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('🔗 WebSocket connection opened');
      
      // Сброс счетчика попыток при успешном подключении
      reconnectAttemptsRef.current = 0;
      hasConnectedRef.current = true;
      setWsConnected(true);
      setLoading(false);
      setIsConnecting(false);
      setWs(websocket);

      // Регистрируемся как UI клиент
      const identifyMessage: IMessageFromUI = {
        messageType: EMessageToServer.Register,
        connectionType: EConnectionType.UI,
        details: {
          uiClientId: uiClientId.current,
        },
      };
      
      try {
        websocket.send(JSON.stringify(identifyMessage));
      } catch (error) {
        console.error('❌ Failed to send registration message:', error);
      }

      // Настраиваем heartbeat - отправляем обычное сообщение для проверки соединения
      pingIntervalRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          try {
            // Отправляем ping сообщение серверу
            const pingMessage: IMessageFromUI = {
              messageType: EMessageToServer.Register, // Используем безопасное сообщение
              connectionType: EConnectionType.UI,
              details: { ping: true, timestamp: Date.now() },
            };
            websocket.send(JSON.stringify(pingMessage));
          } catch (error) {
            console.warn('💓 Heartbeat failed, reconnecting...', error);
            connectWebSocket();
          }
        } else {
          console.log('🔌 WebSocket not open during heartbeat, reconnecting...');
          connectWebSocket();
        }
      }, 30000); // heartbeat каждые 30 секунд
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as IMessageFromServer;
        console.log('🔔 Received WebSocket message:', message);

        switch (message.messageType) {
          case EMessageFromServer.AgentList:
            const agentList = message.details?.agents || [];
            const validAgents = agentList.filter((agent: any) => agent && agent.id);
            setAgents(validAgents);
            break;

          case EMessageFromServer.AgentUpdate:
            const updatedAgentList = message.details?.agents || [];
            const validUpdatedAgents = updatedAgentList.filter((agent: any) => agent && agent.id);
            setAgents(validUpdatedAgents);
            break;

          case EMessageFromServer.Registered:
            console.log('UI client registration confirmed');
            const messageToSend: IMessageFromUI = {
              messageType: EMessageFromUI.GetAgents,
              connectionType: EConnectionType.UI,
            };
            websocket.send(JSON.stringify(messageToSend));
            break;

          case EMessageFromServer.RooCodeResponse:
            console.log('🤖 Received RooCode response:', message.details);
            
            if (loadingMessageId) {
              setChatMessages((prev) => prev.filter(msg => msg.id !== loadingMessageId));
              setLoadingMessageId(null);
            }

            const messageContent = message.details?.response || 'No response';
            const messageTimestamp = message.timestamp || Date.now();
            const messageId = `agent-${messageTimestamp}-${messageContent.substring(0, 50).replace(/\s+/g, '-')}`;

            setChatMessages((prev) => {
              const messageExists = prev.some(msg => 
                msg.type === 'agent' &&
                msg.content === messageContent && 
                Math.abs(msg.timestamp - messageTimestamp) < 1000
              );
              
              if (messageExists) {
                return prev;
              }

              const agentMessage: ChatMessage = {
                id: messageId,
                agentId: message.details?.agentId || 'unknown',
                type: 'agent',
                content: messageContent,
                timestamp: messageTimestamp,
                status: 'delivered',
              };
              
              return [...prev, agentMessage];
            });
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.error('❌ WebSocket error:', error);
      setWsConnected(false);
      setIsConnecting(false);
      setWs(null);
      
      // Очищаем ping интервал при ошибке
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    websocket.onclose = (event) => {
      clearTimeout(connectionTimeout);
      const { code, reason } = event;
      
      console.log(`🔌 WebSocket connection closed:`, {
        code,
        reason,
        wasClean: event.wasClean,
        attempt: reconnectAttemptsRef.current
      });
      
      setWsConnected(false);
      setIsConnecting(false);
      setWs(null);
      hasConnectedRef.current = false;
      
      // Очищаем ping интервал
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      // Определяем, нужно ли переподключаться
      const shouldReconnect = 
        code !== 1000 && // не нормальное закрытие
        code !== 1001 && // not going away 
        reconnectAttemptsRef.current < maxReconnectAttempts;
      
      if (shouldReconnect) {
        // Экспоненциальная задержка для переподключения
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
        
        console.log(`🔄 Scheduling reconnection in ${delay}ms...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!wsConnected && !isConnecting) {
            connectWebSocket();
          }
        }, delay);
      } else {
        console.log('🚫 Not reconnecting:', 
          code === 1000 ? 'Normal closure' : 
          code === 1001 ? 'Going away' : 
          'Max attempts reached'
        );
        setLoading(false);
      }
    };

    setWs(websocket);
  }, []); // Убираем зависимости, чтобы избежать лишних пересозданий

  useEffect(() => {
    // Подключаемся только при первом монтировании
    if (!hasConnectedRef.current && !isConnecting) {
      connectWebSocket();
    }

    // Cleanup при размонтировании компонента
    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      
      setIsConnecting(false);
      hasConnectedRef.current = false;
      
      // Очищаем все таймеры
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      // Закрываем соединение
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close(1000, 'Component unmounting');
        setWs(null);
      }
      
      setWsConnected(false);
      setLoading(false);
    };
  }, []); // Пустые зависимости - выполняется только при монтировании/размонтировании

  const sendMessage = useCallback((message: IMessageFromUI) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ Failed to send message:', error);
        // Попытка переподключения при ошибке отправки
        if (!isConnecting) {
          connectWebSocket();
        }
      }
    } else {
      console.warn('⚠️ WebSocket not connected, current state:', 
        ws ? 
          ws.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
          ws.readyState === WebSocket.CLOSING ? 'CLOSING' :
          ws.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN'
        : 'NULL'
      );
      
      // Автоматически пытаемся переподключиться
      if (!isConnecting && !wsConnected) {
        console.log('🔄 Auto-reconnecting...');
        connectWebSocket();
      }
    }
  }, [ws, isConnecting, wsConnected, connectWebSocket]);

  const sendToRooCode = useCallback(async (agentId: string, message: string) => {
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const userMessage: ChatMessage = {
      id: userMessageId,
      agentId,
      type: 'user',
      content: message,
      timestamp: Date.now(),
      status: 'sent',
    };

    setChatMessages((prev) => [...prev, userMessage]);

    const loadingMessageId = `loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      agentId,
      type: 'loading',
      content: '',
      timestamp: Date.now(),
      status: 'loading',
    };

    setChatMessages((prev) => [...prev, loadingMessage]);
    setLoadingMessageId(loadingMessageId);

    const messageToSend: IMessageFromUI = {
      messageType: EMessageFromUI.SendToRooCode,
      connectionType: EConnectionType.UI,
      details: {
        agentId,
        message,
      },
    };

    sendMessage(messageToSend);
  }, [sendMessage]);

  // Функция для ручного переподключения
  const reconnect = useCallback(() => {
    console.log('🔄 Manual reconnection requested');
    
    // Сбрасываем счетчик попыток
    reconnectAttemptsRef.current = 0;
    hasConnectedRef.current = false;
    
    // Принудительно закрываем текущее соединение
    if (ws) {
      ws.close(1000, 'Manual reconnection');
    }
    
    // Очищаем таймеры
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    setWsConnected(false);
    setIsConnecting(false);
    setLoading(true);
    
    // Подключаемся заново
    setTimeout(() => connectWebSocket(), 100);
  }, [ws, connectWebSocket]);

  return {
    agents,
    chatMessages,
    wsConnected,
    loading,
    sendMessage,
    sendToRooCode,
    setChatMessages,
    reconnect,
    connectionAttempts: reconnectAttemptsRef.current,
  };
}
