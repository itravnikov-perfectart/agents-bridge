import React, { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { ChatTabs } from './ChatTabs';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Chat } from '../types';

export function App() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  
  const { 
    agents, 
    chatMessages, 
    wsConnected, 
    loading, 
    sendToRooCode,
    reconnect,
    connectionAttempts
  } = useWebSocket();

  // Находим выбранного агента
  const selectedAgentData = selectedAgent 
    ? agents.find(agent => agent.id === selectedAgent) 
    : null;

  // Создание нового чата
  const handleCreateChat = useCallback((
    agentId: string, 
    type: Chat['type'], 
    title: string, 
    config?: any
  ) => {
    const newChat: Chat = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type,
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config,
    };

    setChats(prev => [...prev, newChat]);
  }, []);

  // Закрытие чата
  const handleCloseChat = useCallback((chatId: string) => {
    setChats(prev => prev.filter(chat => chat.id !== chatId));
  }, []);

  // Отправка сообщения в конкретный чат
  const handleSendMessage = useCallback(async (chatId: string, message: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    // Создаем сообщение пользователя
    const userMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId: chat.agentId,
      type: 'user' as const,
      content: message,
      timestamp: Date.now(),
      status: 'sent' as const,
    };

    // Добавляем сообщение в чат
    setChats(prev => prev.map(c => 
      c.id === chatId 
        ? { 
            ...c, 
            messages: [...c.messages, userMessage],
            updatedAt: Date.now()
          }
        : c
    ));

    // Отправляем сообщение через WebSocket
    try {
      await sendToRooCode(chat.agentId, message);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Можно добавить обработку ошибки
    }
  }, [chats, sendToRooCode]);

  // Синхронизация сообщений из WebSocket с чатами
  React.useEffect(() => {
    // Добавляем новые сообщения от агентов в соответствующие чаты
    chatMessages.forEach(msg => {
      if (msg.type === 'agent' || msg.type === 'partial' || msg.type === 'loading') {
        setChats(prev => prev.map(chat => {
          if (chat.agentId === msg.agentId) {
            // Проверяем, есть ли уже это сообщение
            const messageExists = chat.messages.some(existingMsg => existingMsg.id === msg.id);
            if (!messageExists) {
              return {
                ...chat,
                messages: [...chat.messages, msg],
                updatedAt: Date.now(),
              };
            }
          }
          return chat;
        }));
      }
    });
  }, [chatMessages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Connecting to server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        wsConnected={wsConnected}
        onReconnect={reconnect}
        connectionAttempts={connectionAttempts}
      />
      <ChatTabs
        selectedAgent={selectedAgentData}
        chats={chats}
        onCreateChat={handleCreateChat}
        onCloseChat={handleCloseChat}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
