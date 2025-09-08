import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../utils/cn';
import { useAddMessage, useMessagesByTaskId } from '../queries/useMessages';
import { useActiveProfile, useProfiles } from '../queries/useProfiles';
import { useWebSocketConnection } from '../providers/connection.provider';

import { useUpdateTask, useAddTask } from '../queries/useTasks';
import { ChatMessage } from 'agents-bridge-shared';
import { ModeSelector } from './ModeSelector';
import { useSettings } from './Settings';

// Default configuration for auto-approval timer (in seconds) - will be overridden by settings
const DEFAULT_AUTO_APPROVAL_TIMEOUT = 10;

interface ChatWindowProps {
  agentId: string;
  taskId: string;
  isNewTaskChat: boolean;
  isCompleted: boolean;
  onResumeTask?: (taskId: string) => void;
  onSetLoading?: (taskId: string, isLoading: boolean) => void;
}

export const ChatWindow = ({ 
  agentId, 
  taskId,
  isNewTaskChat,
  isCompleted,
  onResumeTask,
  onSetLoading,
}: ChatWindowProps) => {

  const { getProfiles, getActiveProfile, startNewTask, sendMessageToTask, sendToolApprovalResponse } = useWebSocketConnection();
  const { settings } = useSettings();

  const addMessageMutation = useAddMessage();
  const addTaskMutation = useAddTask();
  const { data: messages = [] } = useMessagesByTaskId(taskId);
  const { data: profiles = [] } = useProfiles();
  const { data: activeProfile } = useActiveProfile();
  const updateTaskMutation = useUpdateTask();

  const [message, setMessage] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('code');
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const lastMessageCountRef = useRef<number>(0);
  
  // Error retry state management
  const [retryState, setRetryState] = useState<{
    isRetrying: boolean;
    retryCount: number;
    retryTimeoutId: NodeJS.Timeout | null;
  }>({
    isRetrying: false,
    retryCount: 0,
    retryTimeoutId: null
  });

  const [agentRetryCount, setAgentRetryCount] = useState<number>(0);
  
  // Use parent's loading state management if available
  const setLoading = (isLoading: boolean) => {
    setIsWaitingForResponse(isLoading);
    if (onSetLoading) {
      onSetLoading(taskId, isLoading);
    }
  };

  // Get auto-approval timeout from settings
  const autoApprovalTimeout = settings.autoApproval ? settings.autoApprovalTimeout : DEFAULT_AUTO_APPROVAL_TIMEOUT;

  // Retry logic with exponential backoff
  const getRetryDelay = (retryCount: number): number => {
    const delays = [10000, 30000, 60000]; // 10s, 30s, 60s
    return delays[Math.min(retryCount, delays.length - 1)];
  };

  const scheduleRetry = (retryCount: number) => {
    const delay = getRetryDelay(retryCount);
    
    const timeoutId = setTimeout(() => {
      setRetryState(prev => ({ ...prev, isRetrying: true }));
      
      // Send the last user message again
      const lastUserMessage = allMessages
        .slice()
        .reverse()
        .find(m => m.type === 'user');
      
      if (lastUserMessage && typeof lastUserMessage.content === 'string') {
        const cleanMessage = stripMeta(lastUserMessage.content).trim();
        if (cleanMessage) {
          setLoading(true);
          sendMessageToTask(agentId, taskId, cleanMessage);
        }
      }
      
      setRetryState(prev => ({ 
        ...prev, 
        isRetrying: false, 
        retryTimeoutId: null 
      }));
    }, delay);

    setRetryState(prev => ({ 
      ...prev, 
      retryCount: retryCount + 1, 
      retryTimeoutId: timeoutId 
    }));
  };

  const cancelRetry = () => {
    if (retryState.retryTimeoutId) {
      clearTimeout(retryState.retryTimeoutId);
    }
    setRetryState({
      isRetrying: false,
      retryCount: 0,
      retryTimeoutId: null
    });
  };

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryState.retryTimeoutId) {
        clearTimeout(retryState.retryTimeoutId);
      }
    };
  }, [retryState.retryTimeoutId]);

  // Объединяем сообщения из чата и задачи
  const stripMeta = (text: string): string => {
    if (!text || typeof text !== 'string') return '';
    
    let cleaned = text
      .replace(/<environment_details[\s\S]*?<\/environment_details>/gi, '')
      .replace(/<task[\s\S]*?<\/task>/gi, '')
      .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
      .replace(/<ask_followup_question[\s\S]*?<\/ask_followup_question>/gi, '')
      // Keep generic bracketed markers like "[-]", only remove explicit "[...] Result:" prefix
      .replace(/\[[^\]]+\]\s*Result:\s*/gi, '')
      // Remove internal IDs and hashes (40+ character hex strings)
      .replace(/\b[a-f0-9]{40,}\b/gi, '')
      // Remove file paths with IDs
      .replace(/\[src\/[^\]]+\]\([^)]+\)/g, '[file]')
      // Remove standalone [ID] markers
      .replace(/\s*\[ID\]\s*/g, ' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    
    // If the cleaned text is just "false", "true", "null", or "undefined", return empty string
    if (cleaned === 'false' || cleaned === 'true' || cleaned === 'null' || cleaned === 'undefined') {
      return '';
    }
    
    // If the cleaned text is empty or just whitespace, return the original text
    if (cleaned.length === 0) {
      return text.trim();
    }
    
    return cleaned;
  };

  const allMessages = useMemo(() => {
    // Deduplicate messages based on content and type, but be less aggressive
    const seen = new Set<string>();
    const deduplicated = (messages || []).filter((m) => {
      const text = (m as any)?.content;
      if (typeof text !== 'string') return false;
      
      // Always keep JSON messages (tool approvals, follow-up questions)
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === 'tool_approval' || parsed.type === 'tool_result' || parsed.type === 'api_error' || 
              (parsed.type === 'say' && (parsed.say === 'completion_result' || parsed.say === 'auto_followup'))) {
            return true; // Always keep important JSON messages
          }
          return true; // Keep all valid JSON
        } catch {
          // Invalid JSON, continue with regular filtering
        }
      }
      
      // For regular messages, check if cleaned content is non-empty
      const cleaned = stripMeta(text).trim();
      
      // Skip messages that are just "false", "true", etc. (now handled in stripMeta)
      if (cleaned === '') {
        return false;
      }
      
      // Skip very short messages that are likely noise, but be more lenient
      if (cleaned.length < 2) {
        return false;
      }
      
      // Create a unique key for deduplication, but only for very similar messages
      const key = `${m.type}-${cleaned}`;
      if (seen.has(key)) {
        return false; // Skip exact duplicate
      }
      seen.add(key);
      
      // Also check for very similar messages (same content with minor differences)
      const similarKey = `${m.type}-${cleaned.substring(0, 50)}`;
      if (seen.has(similarKey) && cleaned.length > 50) {
        return false; // Skip very similar messages
      }
      seen.add(similarKey);
      
      return true; // Keep all messages that pass basic filtering
    });
    
    return deduplicated;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  // Note: pending approvals are managed by connection.provider

  useEffect(() => {
    getProfiles(agentId);
    getActiveProfile(agentId);
  }, [agentId, getProfiles, getActiveProfile]);

  // Clear loading state when agent response is received
  useEffect(() => {
    if (isWaitingForResponse && allMessages.length > lastMessageCountRef.current) {
      // New message received, clear loading state
      setLoading(false);
      
      // Reset retry state on successful response
      if (retryState.retryCount > 0) {
        cancelRetry();
      }
    }
    lastMessageCountRef.current = allMessages.length;
  }, [allMessages, isWaitingForResponse, retryState.retryCount]);

  // Note: tool approval timing/auto-approval is handled in connection.provider



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const messageText = message.trim();
    setMessage('');
    setLoading(true);

    try {
      if (!isNewTaskChat) {
        // Существующая задача - используем sendMessage
        // Don't add message locally - agent will send it back via WebSocket
        sendMessageToTask(agentId, taskId, messageText);
      } else {
        // Новая задача - используем startNewTask
        const profile = selectedProfile || activeProfile;
        // For new tasks, add the message locally since it won't be echoed back
        addMessageMutation.mutate({
          taskId: taskId,
          message: {
            type: 'user',
            content: messageText
          }
        });
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
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleSendMessage = (message: string) => {
    // Set loading state when sending message
    setLoading(true);
    // Don't add message locally - agent will send it back via WebSocket
    sendMessageToTask(agentId, taskId, message);
  }

  // Loading component for when waiting for agent response
  const LoadingMessage = () => (
    <div className="flex items-start space-x-3 p-4">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
          <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          Agent
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <span>Thinking...</span>
        </div>
      </div>
    </div>
  );

  // Tool approval state management - moved to component level to fix React Hooks violation
  const [toolApprovalStates, setToolApprovalStates] = useState<Record<string, {
    timeLeft: number;
    isApproved: boolean;
    isDenied: boolean;
  }>>({});
  
  // Track individual timers to prevent restarting
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const handleToolApproval = (messageId: string, approved: boolean, data: any) => {
    setToolApprovalStates(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        isApproved: approved,
        isDenied: !approved
      }
    }));
    sendToolApprovalResponse(agentId, taskId, approved, data);
  };

  // Start timer for a specific approval
  const startTimer = (messageId: string) => {
    // Clear existing timer if any
    if (timersRef.current[messageId]) {
      clearInterval(timersRef.current[messageId]);
    }

    const timer = setInterval(() => {
      setToolApprovalStates(prev => {
        const currentState = prev[messageId];
        if (!currentState || currentState.isApproved || currentState.isDenied) {
          // Clean up timer if approval is done
          if (timersRef.current[messageId]) {
            clearInterval(timersRef.current[messageId]);
            delete timersRef.current[messageId];
          }
          return prev;
        }

        if (currentState.timeLeft <= 1) {
          // Auto-approve
          handleToolApproval(messageId, true, null);
          // Clean up timer
          if (timersRef.current[messageId]) {
            clearInterval(timersRef.current[messageId]);
            delete timersRef.current[messageId];
          }
          return {
            ...prev,
            [messageId]: {
              ...currentState,
              timeLeft: 0,
              isApproved: true
            }
          };
        }

        return {
          ...prev,
          [messageId]: {
            ...currentState,
            timeLeft: currentState.timeLeft - 1
          }
        };
      });
    }, 1000);

    timersRef.current[messageId] = timer;
  };

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(timer => clearInterval(timer));
      timersRef.current = {};
    };
  }, []);

  // Effect to detect new approval requests and start fresh timers
  useEffect(() => {
    const approvalMessages = allMessages.filter(msg => 
      msg.type === 'agent' && 
      msg.content?.startsWith('{') && 
      (() => {
        try {
          const parsed = JSON.parse(msg.content);
          return parsed.type === 'tool_approval' || parsed.type === 'command_approval';
        } catch {
          return false;
        }
      })()
    );

    approvalMessages.forEach(msg => {
      try {
        const parsed = JSON.parse(msg.content);
        let messageId: string;
        
        if (parsed.type === 'tool_approval') {
          messageId = `${parsed.tool}-${JSON.stringify(parsed.data).slice(0, 50)}`;
        } else if (parsed.type === 'command_approval') {
          messageId = `command-${parsed.command}-${Date.now()}`;
        } else {
          return;
        }
        
        // Only start timer if this is a new approval request (not already processed)
        setToolApprovalStates(prev => {
          if (!prev[messageId] || prev[messageId].isApproved || prev[messageId].isDenied) {
            const newState = {
              ...prev,
              [messageId]: {
                timeLeft: autoApprovalTimeout,
                isApproved: false,
                isDenied: false
              }
            };
            // Start timer for new approval
            startTimer(messageId);
            return newState;
          }
          return prev;
        });
      } catch (error) {
        console.error('Error parsing approval message:', error);
      }
    });

    // Check for agent retry messages
    const retryMessages = allMessages.filter(msg => 
      msg.type === 'agent' && 
      msg.content?.startsWith('{') && 
      (() => {
        try {
          const parsed = JSON.parse(msg.content);
          return parsed.type === 'say' && parsed.say === 'api_req_retry_delayed';
        } catch {
          return false;
        }
      })()
    );

    if (retryMessages.length > 0) {
      const lastRetryMessage = retryMessages[retryMessages.length - 1];
      try {
        const parsed = JSON.parse(lastRetryMessage.content);
        const retryMatch = parsed.text?.match(/Retry attempt (\d+)/);
        if (retryMatch) {
          const retryNumber = parseInt(retryMatch[1], 10);
          setAgentRetryCount(retryNumber);
        }
      } catch (error) {
        console.error('Error parsing retry message:', error);
      }
    }
  }, [allMessages]);

  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.type === 'agent') {
      if (msg.content?.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg.content);
          
          // Handle tool approval requests
          if (parsed.type === 'tool_approval') {
            const messageId = `${parsed.tool}-${JSON.stringify(parsed.data).slice(0, 50)}`;
            const state = toolApprovalStates[messageId] || {
              timeLeft: autoApprovalTimeout,
              isApproved: false,
              isDenied: false
            };

            const progressPercentage = ((autoApprovalTimeout - state.timeLeft) / autoApprovalTimeout) * 100;

            return (
              <div className="space-y-3">
                <div className="font-medium text-orange-600 dark:text-orange-400">
                  🔧 Tool Approval Required
                </div>
                <div className="text-sm">
                  <strong>Tool:</strong> {parsed.tool}
                </div>
                {parsed.data?.todos && (
                  <div className="text-sm">
                    <strong>Action:</strong> {parsed.data.todos.map((todo: any) => todo.content).join(', ')}
                  </div>
                )}
                
                {state.isApproved ? (
                  <div className="text-green-600 dark:text-green-400 font-medium">
                    ✅ Auto-approved: {parsed.tool} {parsed.data?.todos ? `(${parsed.data.todos.map((todo: any) => todo.content).join(', ')})` : ''}
                  </div>
                ) : state.isDenied ? (
                  <div className="text-red-600 dark:text-red-400 font-medium">
                    ❌ Denied
                  </div>
                ) : (
                  <>
                    {settings.showTimer && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Auto-approving in {state.timeLeft} seconds...
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToolApproval(messageId, true, null)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-sm"
                      >
                        ✅ Approve Now
                      </button>
                      <button
                        onClick={() => handleToolApproval(messageId, false, null)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm"
                      >
                        ❌ Deny
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          }

          // Handle command approval requests
          if (parsed.type === 'command_approval') {
            const messageId = `command-${parsed.command}-${Date.now()}`;
            const state = toolApprovalStates[messageId] || {
              timeLeft: autoApprovalTimeout,
              isApproved: false,
              isDenied: false
            };

            const progressPercentage = ((autoApprovalTimeout - state.timeLeft) / autoApprovalTimeout) * 100;

            return (
              <div className="space-y-3">
                <div className="font-medium text-orange-600 dark:text-orange-400">
                  ⚡ Command Execution Required
                </div>
                <div className="text-sm">
                  <strong>Command:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">{parsed.command}</code>
                </div>
                
                {state.isApproved ? (
                  <div className="text-green-600 dark:text-green-400 font-medium">
                    ✅ Auto-executed: {parsed.command}
                  </div>
                ) : state.isDenied ? (
                  <div className="text-red-600 dark:text-red-400 font-medium">
                    ❌ Denied
                  </div>
                ) : (
                  <>
                    {settings.showTimer && (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Auto-approving in {state.timeLeft} seconds...
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToolApproval(messageId, true, null)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-sm"
                      >
                        ✅ Execute Now
                      </button>
                      <button
                        onClick={() => handleToolApproval(messageId, false, null)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm"
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          }

          // Render final tool result payload
          if (parsed.type === 'tool_result') {
            return (
              <div className="space-y-2">
                <div className="text-sm text-green-600 dark:text-green-400">
                  ✅ {parsed.tool} completed
                </div>
                {parsed.content && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{stripMeta(parsed.content)}</ReactMarkdown>
                  </div>
                )}
                {!parsed.content && parsed.data && (
                  <div className="text-xs text-muted-foreground">
                    {typeof parsed.data === 'string' ? stripMeta(parsed.data) : 'Operation completed'}
                  </div>
                )}
              </div>
            );
          }

          // Handle file content display
          if (parsed.type === 'file_content' || 
              (parsed.type === 'say' && parsed.text?.includes('```')) ||
              (parsed.type === 'say' && parsed.text?.includes('package.json')) ||
              (parsed.type === 'say' && parsed.text?.includes('{') && parsed.text?.includes('"name"'))) {
            const content = parsed.content || parsed.text || '';
            const lines = content.split('\n');
            
            // Check if it's a package.json file
            const isPackageJson = content.includes('"name":') && content.includes('"version":') && content.includes('"dependencies":');
            
            // Check if it's a file list (lots of file paths)
            const isFileList = lines.length > 10 && lines.every((line: string) => 
              line.trim().match(/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/) || 
              line.trim().match(/^[a-zA-Z0-9._-]+\/$/) ||
              line.trim().match(/^[a-zA-Z0-9._-]+$/)
            );
            
            if (isFileList) {
              return (
                <div className="space-y-2">
                  <div className="font-medium text-blue-600 dark:text-blue-400">
                    📁 File List ({lines.length} items)
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      {lines.slice(0, 20).map((line: string, index: number) => (
                        <div key={index} className="truncate text-gray-700 dark:text-gray-300">
                          {line.trim()}
                        </div>
                      ))}
                      {lines.length > 20 && (
                        <div className="col-span-2 text-gray-500 text-xs mt-2">
                          ... and {lines.length - 20} more files
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div className="space-y-2">
                <div className="font-medium text-blue-600 dark:text-blue-400">
                  {isPackageJson ? '📦 package.json' : '📄 File Content'}
                </div>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-sm">
                    {lines.map((line: string, index: number) => (
                      <div key={index} className="flex">
                        <span className="text-gray-500 mr-4 select-none w-8 text-right">
                          {String(index + 1).padStart(2, ' ')}
                        </span>
                        <span className="flex-1">{line}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            );
          }

          // Handle API error messages with retry options
          if (parsed.type === 'api_error') {
            const handleRetry = () => {
              // Cancel any existing retry
              cancelRetry();
              // Set loading state when retrying
              setLoading(true);
              // Send the last user message again to retry
              const lastUserMessage = allMessages
                .slice()
                .reverse()
                .find(m => m.type === 'user');
              
              if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                // Clean the message content before retrying
                const cleanMessage = stripMeta(lastUserMessage.content).trim();
                if (cleanMessage) {
                  sendMessageToTask(agentId, taskId, cleanMessage);
                }
              } else {
                // Fallback: send a generic retry message
                sendMessageToTask(agentId, taskId, "Please retry the previous request.");
              }
            };

            const handleAutoRetry = () => {
              if (settings.retryOnError && retryState.retryCount < settings.maxRetries) {
                scheduleRetry(retryState.retryCount);
              }
            };

            // Auto-retry on error if enabled in settings
            useEffect(() => {
              if (settings.retryOnError && retryState.retryCount === 0 && !retryState.isRetrying) {
                // Auto-start retry after a short delay
                const autoRetryTimeout = setTimeout(() => {
                  handleAutoRetry();
                }, 2000); // 2 second delay before auto-retry
                
                return () => clearTimeout(autoRetryTimeout);
              }
            }, [settings.retryOnError, retryState.retryCount, retryState.isRetrying]);

            const handleStartNewTask = () => {
              // Create a new task with the same agent
              const newTaskId = `new-task-${Date.now()}`;
              const lastUserMessage = allMessages
                .slice()
                .reverse()
                .find(m => m.type === 'user');
              
              if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                // Clean the message content before starting new task
                const cleanMessage = stripMeta(lastUserMessage.content).trim();
                if (cleanMessage) {
                  startNewTask(agentId, newTaskId, cleanMessage);
                }
              } else {
                // Fallback: start a new task with a generic message
                startNewTask(agentId, newTaskId, "Please help me with a new task.");
              }
            };

            return (
              <div className="space-y-3">
                <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                  ⚠️ API Error
                </div>
                <div className="text-sm text-red-700 dark:text-red-300">
                  {parsed.error}
                </div>
                
                {retryState.isRetrying && (
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    🔄 Auto-retrying in {Math.ceil((getRetryDelay(retryState.retryCount - 1) - (Date.now() - (retryState.retryTimeoutId ? Date.now() : 0))) / 1000)} seconds...
                  </div>
                )}
                
                {!retryState.isRetrying && retryState.retryCount === 0 && settings.retryOnError && (
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    🔄 Auto-retry will start in 2 seconds...
                  </div>
                )}
                
                {retryState.retryCount > 0 && !retryState.isRetrying && (
                  <div className="text-sm text-orange-600 dark:text-orange-400">
                    ⚠️ Retry attempt {retryState.retryCount}/{settings.maxRetries} failed
                  </div>
                )}
                
                {agentRetryCount > 0 && (
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    🔄 Agent retry attempt {agentRetryCount}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button
                    onClick={handleRetry}
                    disabled={retryState.isRetrying}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors text-sm"
                  >
                    🔄 Retry Now
                  </button>
                  
                  {settings.retryOnError && retryState.retryCount < settings.maxRetries && !retryState.isRetrying && (
                    <button
                      onClick={handleAutoRetry}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-sm"
                    >
                      ⏰ Auto Retry ({getRetryDelay(retryState.retryCount) / 1000}s)
                    </button>
                  )}
                  
                  {retryState.retryTimeoutId && (
                    <button
                      onClick={cancelRetry}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-sm"
                    >
                      ❌ Cancel Retry
                    </button>
                  )}
                  
                  <button
                    onClick={handleStartNewTask}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-sm"
                  >
                    ➕ Start New Task
                  </button>
                </div>
              </div>
            );
          }

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

          // Handle completion result messages
                      if (parsed.type === 'say' && parsed.say === 'completion_result') {
              return (
                <div className="space-y-2">
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                    ✅ Task Completed
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{parsed.text || ''}</ReactMarkdown>
                  </div>
                </div>
              );
            }
            
            if (parsed.type === 'say' && parsed.say === 'auto_followup') {
              return (
                <div className="space-y-2">
                  <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                    🔍 Auto Follow-up
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{parsed.text || ''}</ReactMarkdown>
                  </div>
                </div>
              );
            }
            
            // Handle package.json display specifically
            if (parsed.type === 'say' && parsed.text?.includes('package.json')) {
              const content = parsed.text || '';
              const lines = content.split('\n');
              
              return (
                <div className="space-y-2">
                  <div className="font-medium text-blue-600 dark:text-blue-400">
                    📦 package.json (Auto Follow-up)
                  </div>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                    <pre className="text-sm">
                      {lines.map((line: string, index: number) => (
                        <div key={index} className="flex">
                          <span className="text-gray-500 mr-4 select-none w-8 text-right">
                            {String(index + 1).padStart(2, ' ')}
                          </span>
                          <span className="flex-1">{line}</span>
                        </div>
                      ))}
                    </pre>
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
          // Если не JSON, отображаем как Markdown (cleaned)
          const cleaned = stripMeta(msg.content);
          
          // Special handling for API error messages
          if (cleaned.includes('❌ **API Error:**')) {
            return (
              <div className="space-y-2">
                <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                  ⚠️ API Error
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{cleaned}</ReactMarkdown>
                </div>
              </div>
            );
          }
          
          return (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{cleaned}</ReactMarkdown>
            </div>
          );
        }
      } else {
        // Strip meta tags before rendering
        const cleaned = stripMeta(msg.content);
        
        // Special handling for API error messages
        if (cleaned.includes('❌ **API Error:**')) {
          return (
            <div className="space-y-2">
              <div className="text-sm text-red-600 dark:text-red-400 font-medium">
                ⚠️ API Error
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{cleaned}</ReactMarkdown>
              </div>
            </div>
          );
        }
        
        // Check if it's a file list (lots of file paths)
        const lines = cleaned.split('\n').filter(line => line.trim().length > 0);
        const isFileList = lines.length > 10 && lines.every((line: string) => {
          const trimmed = line.trim();
          return trimmed.match(/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/) || 
                 trimmed.match(/^[a-zA-Z0-9._-]+\/$/) ||
                 trimmed.match(/^[a-zA-Z0-9._-]+$/) ||
                 trimmed.match(/^[a-zA-Z0-9._-]+\s*$/) ||
                 trimmed.match(/^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+/) ||
                 trimmed.match(/^[a-zA-Z0-9._-]+\//);
        });
        
        if (isFileList) {
          return (
            <div className="space-y-2">
              <div className="font-medium text-blue-600 dark:text-blue-400">
                📁 File List ({lines.length} items)
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg max-h-60 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {lines.slice(0, 20).map((line: string, index: number) => (
                    <div key={index} className="truncate text-gray-700 dark:text-gray-300">
                      {line.trim()}
                    </div>
                  ))}
                  {lines.length > 20 && (
                    <div className="col-span-2 text-gray-500 text-xs mt-2">
                      ... and {lines.length - 20} more files
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }
        
        // Check if it's package.json content
        const isPackageJson = cleaned.includes('"name":') && cleaned.includes('"version":') && cleaned.includes('"dependencies":');
        if (isPackageJson) {
          const contentLines = cleaned.split('\n');
          return (
            <div className="space-y-2">
              <div className="font-medium text-blue-600 dark:text-blue-400">
                📦 package.json
              </div>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm">
                  {contentLines.map((line: string, index: number) => (
                    <div key={index} className="flex">
                      <span className="text-gray-500 mr-4 select-none w-8 text-right">
                        {String(index + 1).padStart(2, ' ')}
                      </span>
                      <span className="flex-1">{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          );
        }
        
        // Отображаем обычный текст как Markdown
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{cleaned}</ReactMarkdown>
          </div>
        );
      }

    } else {
      // Пользовательские сообщения тоже рендерим как Markdown (cleaned)
      const cleaned = typeof msg.content === 'string' ? stripMeta(msg.content) : '';
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{cleaned}</ReactMarkdown>
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
                  msg.type === 'user' ? "bg-primary/20 text-primary" : "bg-secondary"
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
                  msg.type === 'user' ? "bg-primary/10 text-foreground border border-primary/20" : "bg-muted text-foreground border border-border"
                )}>
                  <div className="space-y-2">
                    <div className="text-sm">
                      {renderMessageContent(msg)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isWaitingForResponse && <LoadingMessage />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>


      <div className="flex-shrink-0 p-4 border-t border-border bg-card">
      {isCompleted && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <span className="text-green-600 dark:text-green-400 text-lg">✓</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                Task Completed Successfully
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                The current task has been completed. What would you like to do next?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onResumeTask ? onResumeTask(taskId) : undefined}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors"
                >
                  Continue This Task
                </button>
                <button
                  onClick={() => {
                    const newTaskId = `new-task-${Date.now()}`;
                    // Create new task without starting conversation
                    addTaskMutation.mutate({
                      agentId: agentId,
                      task: {
                        id: newTaskId,
                        agentId: agentId,
                        isNewTask: true,
                      },
                    }, {
                      onSuccess: () => {
                        // Focus on the new task
                        onResumeTask?.(newTaskId);
                      }
                    });
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                >
                  Create New Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

 