import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import type { Chat, Agent, ChatMessage } from '../types';
import { cn } from '../utils/cn';

interface ChatWindowProps {
  chat: Chat;
  agent: Agent;
  onSendMessage: (message: string) => Promise<void>;
}

export const ChatWindow = ({ chat, agent, onSendMessage }: ChatWindowProps) => {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    const messageText = message.trim();
    setMessage('');
    setIsLoading(true);

    try {
      await onSendMessage(messageText);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessageContent = (msg: ChatMessage) => {
    // Если это JSON ответ, пытаемся его распарсить и красиво отобразить
    if (msg.type === 'agent' && msg.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg.content);
        
        // Проверяем, есть ли вопрос и предложения
        if (parsed.question && parsed.suggest && Array.isArray(parsed.suggest)) {
          return (
            <div className="space-y-3">
              <div className="font-medium">{parsed.question}</div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Варианты ответов:</div>
                <div className="grid gap-2">
                  {parsed.suggest.map((suggestion: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(suggestion.answer)}
                      className="text-left p-3 bg-accent/50 hover:bg-accent rounded-md transition-colors text-sm"
                    >
                      {suggestion.answer}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        // Обычный JSON ответ
        return (
          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        // Если не JSON, отображаем как обычный текст
        return msg.content;
      }
    }

    return msg.content;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Заголовок чата */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{chat.title}</h3>
            <p className="text-sm text-muted-foreground">
              Агент: {agent.id} • Тип чата: {chat.type}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Создан: {formatTime(chat.createdAt)}
          </div>
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chat.messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="h-8 w-8 mx-auto mb-2" />
            <p>Начните диалог с агентом</p>
          </div>
        ) : (
          <>
            {chat.messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 max-w-[80%]",
                  msg.type === 'user' ? "ml-auto" : "mr-auto"
                )}
              >
                {/* Аватар */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  msg.type === 'user' ? "bg-primary text-primary-foreground order-2" : "bg-secondary"
                )}>
                  {msg.type === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : msg.type === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                {/* Сообщение */}
                <div className={cn(
                  "rounded-lg p-3 max-w-full",
                  msg.type === 'user' ? "bg-primary text-primary-foreground order-1" : "bg-muted"
                )}>
                  {msg.type === 'loading' ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Агент думает...</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm">
                        {renderMessageContent(msg)}
                      </div>
                      <div className="text-xs opacity-70">
                        {formatTime(msg.timestamp)}
                        {msg.status && (
                          <span className="ml-2">• {msg.status}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Ввод сообщения */}
      <div className="p-4 border-t border-border bg-card">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Введите сообщение..."
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[60px] max-h-32"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!message.trim() || isLoading}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
