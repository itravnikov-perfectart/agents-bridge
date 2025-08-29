import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../utils/cn';
import { useAddMessage, useMessagesByTaskId } from '../queries/useMessages';
import { useActiveProfile, useProfiles } from '../queries/useProfiles';
import { useWebSocketConnection } from '../providers/connection.provider';

import { useUpdateTask } from '../queries/useTasks';
import { ChatMessage } from 'agents-bridge-shared';
import { ModeSelector } from './ModeSelector';

interface ChatWindowProps {
  agentId: string;
  taskId: string;
  isNewTaskChat: boolean;
  isCompleted: boolean;
}

export const ChatWindow = ({ 
  agentId, 
  taskId,
  isNewTaskChat,
  isCompleted,
}: ChatWindowProps) => {

  const { getProfiles, getActiveProfile, startNewTask, sendMessageToTask } = useWebSocketConnection();

  const addMessageMutation = useAddMessage();
  const { data: messages = [] } = useMessagesByTaskId(taskId);
  const { data: profiles = [] } = useProfiles();
  const { data: activeProfile } = useActiveProfile();
  const updateTaskMutation = useUpdateTask();

  const [message, setMessage] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('code');
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Объединяем сообщения из чата и задачи
  const allMessages = React.useMemo(() => {
   return messages
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  useEffect(() => {
    getProfiles(agentId),
    getActiveProfile(agentId)
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const messageText = message.trim();
    setMessage('');

    try {
      if (!isNewTaskChat) {
        // Существующая задача - используем sendMessage
        sendMessageToTask(agentId, taskId, messageText);
      } else {
        // Новая задача - используем startNewTask
        const profile = selectedProfile || activeProfile;
        startNewTask(agentId, taskId, messageText, profile);
        updateTaskMutation.mutate({
          agentId,
          taskId,
          task: {
            id: taskId,
            agentId,
            isNewTask: false,
          }
        });
        console.log('🚀 Started new task');
      }
      addMessageMutation.mutate({
        taskId: taskId,
        message: {
          type: 'user',
          content: messageText
        }
      })
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleSendMessage = (message: string) => {
    sendMessageToTask(agentId, taskId, message);
    addMessageMutation.mutate({
      taskId: taskId,
      message: {
        type: 'user',
        content: message
      }
    })
  }

  const renderMessageContent = (msg: ChatMessage) => {
    console.log('🔔 msg', msg);
    if (msg.type === 'agent') {
      if (msg.content?.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg.content);
          
          // Проверяем, есть ли вопрос и предложения
          if (parsed.question && parsed.suggest && Array.isArray(parsed.suggest)) {
            return (
              <div className="space-y-3">
                <div className="font-medium">
                  <ReactMarkdown>{parsed.question}</ReactMarkdown>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Варианты ответов:</div>
                  <div className="grid gap-2">
                    {parsed.suggest.map((suggestion: any, index: number) => (
                      <button
                        key={index}
                        onClick={() => handleSendMessage(suggestion.answer)}
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
          // Если не JSON, отображаем как Markdown
          return (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          );
        }
      } else {
        // Отображаем обычный текст как Markdown
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        );
      }

    } else {
      // Пользовательские сообщения тоже рендерим как Markdown
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }

  };


  return (
    <div className="flex flex-col w-full h-full bg-background">


      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {allMessages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="h-8 w-8 mx-auto mb-2" />
            <p>Start a conversation with the agent</p>
          </div>
        ) : (
          <>
            {allMessages.map((msg, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3 w-full",
                  msg.type === 'user' ? "ml-auto" : "mr-auto"
                )}
              >
                {/* Аватар */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  msg.type === 'user' ? "bg-primary text-primary-foreground" : "bg-secondary"
                )}>
                  {msg.type === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                {/* Сообщение */}
                <div className={cn(
                  "rounded-lg p-3 max-w-full",
                  msg.type === 'user' ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <div className="space-y-2">
                    <div className="text-sm">
                      {renderMessageContent(msg)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>


      <div className="flex-shrink-0 p-4 border-t border-border bg-card">
      {isCompleted && <div>Task is completed</div>}
      {!isCompleted &&
        (<form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 flex flex-col gap-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isNewTaskChat 
                  ? "Start new task..."
                  : "Send message to task..."
              }
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[60px] max-h-32"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            
            {/* Нижняя строка с профилем и кнопкой отправки */}
            <div className="flex items-center gap-2">
              {/* Выбор профиля для новых чатов */}
              {profiles.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Profile:</span>
                  <select
                    value={selectedProfile || ''}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                    className="text-xs border border-input rounded bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring min-w-32"
                  >
                    {profiles.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile} {profile === activeProfile ? '(Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <ModeSelector
                selectedMode={selectedMode}
                onModeChange={setSelectedMode}
                disabled={isCompleted}
              />
              
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={!message.trim()}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </form>)}
      </div>
    </div>
  );
}
