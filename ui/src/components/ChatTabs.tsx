import React, { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Plus, MessageCircle, Settings, Bug } from 'lucide-react';
import type { Chat, Agent } from '../types';
import { cn } from '../utils/cn';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';

interface ChatTabsProps {
  selectedAgent?: Agent | null;
  chats: Chat[];
  onCreateChat: (agentId: string, type: Chat['type'], title: string, config?: any) => void;
  onCloseChat: (chatId: string) => void;
  onSendMessage: (chatId: string, message: string) => Promise<void>;
}

export function ChatTabs({ 
  selectedAgent, 
  chats, 
  onCreateChat, 
  onCloseChat, 
  onSendMessage 
}: ChatTabsProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);

  // Фильтруем чаты для выбранного агента
  const agentChats = selectedAgent 
    ? chats.filter(chat => chat.agentId === selectedAgent.id)
    : [];

  // Устанавливаем активный таб автоматически
  React.useEffect(() => {
    if (agentChats.length > 0 && (!activeTab || !agentChats.find(c => c.id === activeTab))) {
      setActiveTab(agentChats[0].id);
    }
  }, [agentChats, activeTab]);

  const getChatIcon = (type: Chat['type']) => {
    switch (type) {
      case 'general':
        return <MessageCircle className="h-4 w-4" />;
      case 'task':
        return <Settings className="h-4 w-4" />;
      case 'debug':
        return <Bug className="h-4 w-4" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
    }
  };



  const handleCreateChat = (type: Chat['type'], title: string, config?: any) => {
    if (selectedAgent) {
      onCreateChat(selectedAgent.id, type, title, config);
      setShowNewChatDialog(false);
    }
  };

  if (!selectedAgent) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Выберите агента</h3>
          <p>Выберите агента в левой панели, чтобы начать чат</p>
        </div>
      </div>
    );
  }

  if (agentChats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Нет активных чатов</h3>
          <p className="text-muted-foreground mb-4">
            Создайте новый чат с агентом {selectedAgent.id}
          </p>
          <button
            onClick={() => setShowNewChatDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Создать чат
          </button>
        </div>

        <NewChatDialog
          open={showNewChatDialog}
          onOpenChange={setShowNewChatDialog}
          onCreateChat={handleCreateChat}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Tabs.Root 
        value={activeTab || undefined} 
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        {/* Табы */}
        <div className="flex items-center border-b border-border bg-background">
          <Tabs.List className="flex items-center h-12 px-4 gap-1">
            {agentChats.map((chat) => (
              <Tabs.Trigger
                key={chat.id}
                value={chat.id}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md",
                  "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
                  "hover:bg-accent/50 transition-colors group max-w-48"
                )}
              >
                {getChatIcon(chat.type)}
                <span className="truncate">{chat.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseChat(chat.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground rounded p-0.5 transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Кнопка создания нового чата */}
          <button
            onClick={() => setShowNewChatDialog(true)}
            className="ml-auto mr-4 inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          >
            <Plus className="h-4 w-4" />
            Новый чат
          </button>
        </div>

        {/* Содержимое табов */}
        <div className="flex-1 overflow-hidden">
          {agentChats.map((chat) => (
            <Tabs.Content
              key={chat.id}
              value={chat.id}
              className="h-full data-[state=active]:flex data-[state=inactive]:hidden"
            >
              <ChatWindow
                chat={chat}
                agent={selectedAgent}
                onSendMessage={(message) => onSendMessage(chat.id, message)}
              />
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>

      <NewChatDialog
        open={showNewChatDialog}
        onOpenChange={setShowNewChatDialog}
        onCreateChat={handleCreateChat}
      />
    </div>
  );
}
