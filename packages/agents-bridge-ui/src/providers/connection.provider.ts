import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
  useState,
} from 'react';
import {
  ConnectionSource,
  Message,
  EMessageFromServer,
  EMessageFromUI,
  ESystemMessage,
  EMessageFromAgent,
} from 'agents-bridge-shared';
import { useUpdateAgents } from '../queries/useAgents';
import {
  getMessagesByTaskId,
  useAddMessage,
  useAddMessages,
  useUpsertAgentStreamMessage,
} from '../queries/useMessages';
import {
  useAddTasks,
  useUpdateTask,
  getTasksByAgentId,
} from '../queries/useTasks';
import { useAddProfiles, useUpdateActiveProfile } from '../queries/useProfiles';
import { useQueryClient } from '@tanstack/react-query';
import { RooCodeEventName, RooCodeSettings } from '@roo-code/types';
import { useAddAgentConfiguration } from '../queries/useAgentConfiguration';

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
  getAgentConfiguration: (agentId: string) => void;
  sendAgentConfiguration: (agentId: string, configuration: RooCodeSettings) => void;
  getTaskHistory: (agentId: string) => void;
  getTaskDetails: (agentId: string, taskId: string) => void;
  startNewTask: (
    agentId: string,
    taskId: string,
    message: string,
    profile?: string | null
  ) => void;
  sendMessageToTask: (agentId: string, taskId: string, message: string) => void;
  resumeTask: (agentId: string, taskId: string) => void;
  sendToolApprovalResponse: (
    agentId: string,
    taskId: string,
    approved: boolean,
    toolData?: any
  ) => void;

  onConnectionStateChange: (
    handler: (isConnected: boolean) => void
  ) => () => void;
  onLoadingStateChange: (
    handler: (taskId: string, isLoading: boolean) => void
  ) => () => void;
  onTaskIdChange: (
    handler: (oldTaskId: string, newTaskId: string) => void
  ) => () => void;
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

  const updateAgentsMutation = useUpdateAgents();
  const addMessageMutation = useAddMessage();
  const addMessagesMutation = useAddMessages();
  const upsertAgentStreamMessage = useUpsertAgentStreamMessage();
  const updateTaskMutation = useUpdateTask();
  const addTasksMutation = useAddTasks();
  const addProfilesMutation = useAddProfiles();
  const updateActiveProfileMutation = useUpdateActiveProfile();
    const addAgentConfigurationMutation = useAddAgentConfiguration();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uiClientIdRef = useRef(
    `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const requestedProfilesRef = useRef<Set<string>>(new Set());
  const requestedActiveProfileRef = useRef<Set<string>>(new Set());
  const requestedAgentConfigurationRef = useRef<Set<string>>(new Set());
  const requestedTaskHistoryRef = useRef<Set<string>>(new Set());
  const processedMessageTimestamps = useRef<Set<string>>(new Set());

  // Cleanup old deduplication entries periodically to prevent memory leaks
  const cleanupDeduplicationSet = useCallback(() => {
    if (processedMessageTimestamps.current.size > 1000) {
      // Keep only the most recent 500 entries
      const entries = Array.from(processedMessageTimestamps.current);
      processedMessageTimestamps.current.clear();
      entries
        .slice(-500)
        .forEach((entry) => processedMessageTimestamps.current.add(entry));
    }
  }, []);

  const connectionHandlersRef = useRef<Set<(isConnected: boolean) => void>>(
    new Set()
  );

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
    connectionHandlersRef.current.forEach((handler) => {
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
        updateAgentsMutation.mutate(message.data?.agents || []);
        (message.data?.agents || []).forEach((agent: any) => {
          if (agent?.id) getActiveTaskIds(agent.id);
        });
        break;
      case EMessageFromServer.AgentUpdate:
        updateAgentsMutation.mutate(message.data?.agents || []);
        (message.data?.agents || []).forEach((agent: any) => {
          if (agent?.id) getActiveTaskIds(agent.id);
        });
        break;
    }
  }, []);

  const handleAgentMessage = useCallback((message: Message) => {
    switch (message.type) {
      case EMessageFromAgent.AgentResponse:
        switch (message.event?.eventName) {
          case RooCodeEventName.TaskAborted:
            updateTaskMutation.mutate({
              agentId: message.agent?.id || '',
              taskId: message.event!.taskId?.toString() || '',
              task: {
                id: message.event!.taskId?.toString() || '',
                agentId: message.agent?.id || '',
                isCompleted: true,
              },
            });
            break;
          case RooCodeEventName.TaskCreated:
            getActiveTaskIds(message.agent?.id || '');
            break;
          case RooCodeEventName.Message: {
            const evt = (message.event as any)?.message ?? (message.event as any);
            const text = evt?.text || '';
            const isEmpty = !text;
            const isPartial = !!evt?.partial;
            const say = evt?.say;
            const isAsk = evt?.type === 'ask' || say === 'ask';
            const messageTimestamp = evt?.ts?.toString();

            // Create a unique key for this message to prevent duplicates
            // For streaming messages, we should only deduplicate based on message ID and timestamp
            // not content, since content changes as the message streams
            const messageKey = `${message.event!.taskId}-${messageTimestamp || 'no-ts'}-${say || 'unknown'}-${isAsk ? 'ask' : 'normal'}`;

            // For streaming messages (partial=true), we should allow updates to the same message
            // Only skip if it's a complete message (not partial) and we've seen it before
            if (!isPartial && processedMessageTimestamps.current.has(messageKey)) {
              console.log('Skipping duplicate complete message:', messageKey);
              break;
            }
            
            // For partial messages, we don't add to the deduplication set
            // For complete messages, we add to prevent future duplicates
            if (!isPartial) {
              processedMessageTimestamps.current.add(messageKey);
            }

            // Cleanup deduplication set if it gets too large
            cleanupDeduplicationSet();

            if (say === 'api_req_started') {
              // Trigger loading state for this task
              triggerLoadingStateChange(
                message.event!.taskId!.toString(),
                true
              );
              break;
            }

            if (isEmpty) {
              break;
            }

            // Handle API error messages specially
            const isApiErrorPartial =
              say === 'api_req_failed' ||
              say === 'error' ||
              evt?.ask === 'api_req_failed' ||
              evt?.ask === 'error' ||
              (typeof evt?.ask === 'string' && evt.ask.includes('error'));

            if (isApiErrorPartial) {
              // Format the error message to be more user-friendly
              let errorMessage =
                text || 'An error occurred while processing the request.';

              // If it's a quota error, make it more user-friendly
              if (
                errorMessage.includes('quota') ||
                errorMessage.includes('billing')
              ) {
                errorMessage =
                  'API quota exceeded. Please check your OpenAI billing details.';
              }

              addMessageMutation.mutate({
                taskId: message.event!.taskId!.toString(),
                message: {
                  type: 'agent',
                  content: JSON.stringify({
                    type: 'api_error',
                    error: errorMessage,
                    originalText: text,
                    taskId: message.event!.taskId!.toString(),
                    agentId: message.agent?.id,
                  }),
                },
              });
              // Ensure loading indicator is cleared on API error
              triggerLoadingStateChange(
                message.event!.taskId!.toString(),
                false
              );
              break;
            }

            // Stream only plain agent text; also stream ask/followup as structured JSON so UI shows options live
            if (isPartial) {
              if (!isAsk && say === 'text') {
                upsertAgentStreamMessage.mutate({
                  taskId: message.event!.taskId!.toString(),
                  content: text,
                });
              } else if (isAsk) {
                // Handle tool approval requests specifically
                if (
                  evt?.ask === 'tool' &&
                  typeof text === 'string' &&
                  text.trim().startsWith('{')
                ) {
                  try {
                    const toolData = JSON.parse(text);
                    if (toolData.tool) {
                      const contentJson = {
                        type: 'tool_approval',
                        tool: toolData.tool,
                        data: toolData,
                        question: `Approve ${toolData.tool}?`,
                        suggest: [{ answer: 'Approve' }, { answer: 'Deny' }],
                      };

                      const taskKey = getMessagesByTaskId(
                        message.event!.taskId!.toString()
                      ).queryKey;
                      const prev = queryClient.getQueryData(taskKey) as
                        | any[]
                        | undefined;
                      const last =
                        prev && prev.length > 0
                          ? prev[prev.length - 1]
                          : undefined;
                      let updated = false;

                      if (
                        last?.type === 'agent' &&
                        typeof last?.content === 'string' &&
                        last.content.startsWith('{')
                      ) {
                        try {
                          const parsed = JSON.parse(last.content);
                          if (parsed && parsed.type === 'tool_approval') {
                            queryClient.setQueryData(
                              taskKey,
                              (old: any[] | undefined) => {
                                const list = old ? old.slice() : [];
                                if (list.length > 0) {
                                  list[list.length - 1] = {
                                    type: 'agent',
                                    content: JSON.stringify(contentJson),
                                  };
                                } else {
                                  list.push({
                                    type: 'agent',
                                    content: JSON.stringify(contentJson),
                                  });
                                }
                                return list;
                              }
                            );
                            updated = true;
                          }
                        } catch {}
                      }

                      if (!updated) {
                        addMessageMutation.mutate({
                          taskId: message.event!.taskId!.toString(),
                          message: {
                            type: 'agent',
                            content: JSON.stringify(contentJson),
                          },
                        });
                      }
                      // Ensure task is marked active while waiting for approval
                      updateTaskMutation.mutate({
                        agentId: message.agent?.id || '',
                        taskId: message.event!.taskId!.toString(),
                        task: {
                          id: message.event!.taskId!.toString(),
                          agentId: message.agent?.id || '',
                          isCompleted: false,
                        },
                      });
                      break;
                    }
                  } catch (e) {
                    console.error('Failed to parse tool approval data:', e);
                  }
                }

                // Handle command approval requests specifically
                if (evt?.ask === 'command') {
                  const commandText = text || 'Unknown command';
                  const contentJson = {
                    type: 'command_approval',
                    command: commandText,
                    question: `Execute command: ${commandText}`,
                    suggest: [{ answer: 'Execute' }, { answer: 'Cancel' }],
                  };

                  const taskKey = getMessagesByTaskId(
                    message.event!.taskId!.toString()
                  ).queryKey;
                  const prev = queryClient.getQueryData(taskKey) as
                    | any[]
                    | undefined;
                  const last =
                    prev && prev.length > 0
                      ? prev[prev.length - 1]
                      : undefined;
                  let updated = false;

                  if (
                    last?.type === 'agent' &&
                    typeof last?.content === 'string' &&
                    last.content.startsWith('{')
                  ) {
                    try {
                      const parsed = JSON.parse(last.content);
                      if (parsed && parsed.type === 'command_approval') {
                        queryClient.setQueryData(
                          taskKey,
                          (old: any[] | undefined) => {
                            const list = old ? old.slice() : [];
                            if (list.length > 0) {
                              list[list.length - 1] = {
                                type: 'agent',
                                content: JSON.stringify(contentJson),
                              };
                            } else {
                              list.push({
                                type: 'agent',
                                content: JSON.stringify(contentJson),
                              });
                            }
                            return list;
                          }
                        );
                        updated = true;
                      }
                    } catch {}
                  }

                  if (!updated) {
                    addMessageMutation.mutate({
                      taskId: message.event!.taskId!.toString(),
                      message: {
                        type: 'agent',
                        content: JSON.stringify(contentJson),
                      },
                    });
                  }
                  // Ensure task is marked active while waiting for approval
                  updateTaskMutation.mutate({
                    agentId: message.agent?.id || '',
                    taskId: message.event!.taskId!.toString(),
                    task: {
                      id: message.event!.taskId!.toString(),
                      agentId: message.agent?.id || '',
                      isCompleted: false,
                    },
                  });
                  break;
                }

                // Handle other ask messages (follow-up questions, etc.)
                const candidates: string[] = [];
                const rawSuggest = (evt?.suggest ||
                  evt?.options ||
                  evt?.choices ||
                  []) as any[];
                if (Array.isArray(rawSuggest)) {
                  for (const s of rawSuggest) {
                    const val =
                      s?.answer ?? s?.text ?? s?.label ?? s?.value ?? s?.name;
                    if (typeof val === 'string' && val.trim())
                      candidates.push(val.trim());
                  }
                }
                if (evt?.buttons) {
                  const primary =
                    evt.buttons.primary ??
                    evt.buttons.ok ??
                    evt.buttons.confirm;
                  const secondary = evt.buttons.secondary ?? evt.buttons.cancel;
                  if (typeof primary === 'string' && primary.trim())
                    candidates.push(primary.trim());
                  if (typeof secondary === 'string' && secondary.trim())
                    candidates.push(secondary.trim());
                }
                const question = (evt?.question ||
                  (typeof evt?.ask === 'string'
                    ? evt.ask
                    : evt?.ask?.question) ||
                  evt?.tool?.message ||
                  evt?.tool?.name ||
                  text ||
                  'Waiting for approval') as string;
                const contentJson = {
                  question,
                  suggest: candidates.map((answer) => ({ answer })),
                };
                // Skip if no usable content
                if (
                  !contentJson.question &&
                  (!contentJson.suggest || contentJson.suggest.length === 0)
                ) {
                  break;
                }
                const taskKey = getMessagesByTaskId(
                  message.event!.taskId!.toString()
                ).queryKey;
                const prev = queryClient.getQueryData(taskKey) as
                  | any[]
                  | undefined;
                const last =
                  prev && prev.length > 0 ? prev[prev.length - 1] : undefined;
                let updated = false;
                if (
                  last?.type === 'agent' &&
                  typeof last?.content === 'string' &&
                  last.content.startsWith('{')
                ) {
                  try {
                    const parsed = JSON.parse(last.content);
                    if (
                      parsed &&
                      (parsed.question !== undefined ||
                        Array.isArray(parsed.suggest))
                    ) {
                      queryClient.setQueryData(
                        taskKey,
                        (old: any[] | undefined) => {
                          const list = old ? old.slice() : [];
                          if (list.length > 0) {
                            list[list.length - 1] = {
                              type: 'agent',
                              content: JSON.stringify(contentJson),
                            };
                          } else {
                            list.push({
                              type: 'agent',
                              content: JSON.stringify(contentJson),
                            });
                          }
                          return list;
                        }
                      );
                      updated = true;
                    }
                  } catch {}
                }
                if (!updated) {
                  addMessageMutation.mutate({
                    taskId: message.event!.taskId!.toString(),
                    message: {
                      type: 'agent',
                      content: JSON.stringify(contentJson),
                    },
                  });
                }
                // Ensure task is marked active while waiting for approval
                updateTaskMutation.mutate({
                  agentId: message.agent?.id || '',
                  taskId: message.event!.taskId!.toString(),
                  task: {
                    id: message.event!.taskId!.toString(),
                    agentId: message.agent?.id || '',
                    isCompleted: false,
                  },
                });
              }
              break;
            }

            // Handle API error messages in final processing
            const isApiErrorFinal =
              say === 'api_req_failed' ||
              say === 'error' ||
              evt?.ask === 'api_req_failed' ||
              evt?.ask === 'error' ||
              (typeof evt?.ask === 'string' && evt.ask.includes('error'));

            if (isApiErrorFinal) {
              // Format the error message to be more user-friendly
              let errorMessage =
                text || 'An error occurred while processing the request.';

              // If it's a quota error, make it more user-friendly
              if (
                errorMessage.includes('quota') ||
                errorMessage.includes('billing')
              ) {
                errorMessage =
                  'API quota exceeded. Please check your OpenAI billing details.';
              }

              addMessageMutation.mutate({
                taskId: message.event!.taskId!.toString(),
                message: {
                  type: 'agent',
                  content: JSON.stringify({
                    type: 'api_error',
                    error: errorMessage,
                    originalText: text,
                    taskId: message.event!.taskId!.toString(),
                    agentId: message.agent?.id,
                  }),
                },
              });
              // Ensure loading indicator is cleared on API error
              triggerLoadingStateChange(
                message.event!.taskId!.toString(),
                false
              );
              break;
            }

            if (say === 'completion_result') {
              // Add the completion message to the chat
              addMessageMutation.mutate({
                taskId: message.event!.taskId!.toString(),
                message: {
                  type: 'agent',
                  content: JSON.stringify({
                    type: 'say',
                    say: 'completion_result',
                    text: text,
                  }),
                },
              });
              
              // Update task completion status
              updateTaskMutation.mutate({
                agentId: message.agent?.id || '',
                taskId: message.event!.taskId!.toString(),
                task: {
                  id: message.event!.taskId!.toString(),
                  agentId: message.agent?.id || '',
                  isCompleted: true,
                },
              });
              break;
            }

            const isUser = say === 'user_feedback';

            // Final plain text replaces last streamed message; others append/upsert appropriately
            if (!isAsk && say === 'text') {
              upsertAgentStreamMessage.mutate({
                taskId: message.event!.taskId!.toString(),
                content: text,
              });
            } else {
              // For ask/approval or other structured messages
              if (isAsk) {
                // Prefer using JSON provided in text if present
                let finalJson: any | null = null;

                // If this is a tool ask final payload, emit a structured tool_result
                if (
                  evt?.ask === 'tool' &&
                  typeof text === 'string' &&
                  text.trim().startsWith('{')
                ) {
                  try {
                    const toolPayload = JSON.parse(text);
                    finalJson = {
                      type: 'tool_result',
                      tool: toolPayload.tool,
                      data: toolPayload,
                      content:
                        typeof toolPayload.content === 'string'
                          ? toolPayload.content
                          : undefined,
                    };
                  } catch {}
                }

                if (
                  !finalJson &&
                  typeof text === 'string' &&
                  text.trim().startsWith('{')
                ) {
                  try {
                    const parsed = JSON.parse(text);
                    if (
                      parsed &&
                      (parsed.question !== undefined ||
                        Array.isArray(parsed.suggest))
                    ) {
                      finalJson = parsed;
                    }
                  } catch {}
                }

                if (!finalJson) {
                  const candidates: string[] = [];
                  const rawSuggest = (evt?.suggest ||
                    evt?.options ||
                    evt?.choices ||
                    []) as any[];
                  if (Array.isArray(rawSuggest)) {
                    for (const s of rawSuggest) {
                      const val =
                        s?.answer ?? s?.text ?? s?.label ?? s?.value ?? s?.name;
                      if (typeof val === 'string' && val.trim())
                        candidates.push(val.trim());
                    }
                  }
                  if (evt?.buttons) {
                    const primary =
                      evt.buttons.primary ??
                      evt.buttons.ok ??
                      evt.buttons.confirm;
                    const secondary =
                      evt.buttons.secondary ?? evt.buttons.cancel;
                    if (typeof primary === 'string' && primary.trim())
                      candidates.push(primary.trim());
                    if (typeof secondary === 'string' && secondary.trim())
                      candidates.push(secondary.trim());
                  }
                  const question = (evt?.question ||
                    (typeof evt?.ask === 'string'
                      ? evt.ask
                      : evt?.ask?.question) ||
                    evt?.tool?.message ||
                    evt?.tool?.name ||
                    (typeof text === 'string' && text !== 'followup'
                      ? text
                      : '') ||
                    'Waiting for approval') as string;
                  finalJson = {
                    question,
                    suggest: candidates.map((answer) => ({ answer })),
                  };
                }

                // Replace last interactive message if exists; else append
                const taskKey = getMessagesByTaskId(
                  message.event!.taskId!.toString()
                ).queryKey;
                const prev = queryClient.getQueryData(taskKey) as
                  | any[]
                  | undefined;
                const last =
                  prev && prev.length > 0 ? prev[prev.length - 1] : undefined;
                let replaced = false;
                if (
                  last?.type === 'agent' &&
                  typeof last?.content === 'string' &&
                  last.content.startsWith('{')
                ) {
                  try {
                    const parsedLast = JSON.parse(last.content);
                    if (
                      parsedLast &&
                      (parsedLast.question !== undefined ||
                        Array.isArray(parsedLast.suggest))
                    ) {
                      queryClient.setQueryData(
                        taskKey,
                        (old: any[] | undefined) => {
                          const list = old ? old.slice() : [];
                          if (list.length > 0) {
                            list[list.length - 1] = {
                              type: 'agent',
                              content: JSON.stringify(finalJson),
                            };
                          } else {
                            list.push({
                              type: 'agent',
                              content: JSON.stringify(finalJson),
                            });
                          }
                          return list;
                        }
                      );
                      replaced = true;
                    }
                  } catch {}
                }
                if (!replaced) {
                  addMessageMutation.mutate({
                    taskId: message.event!.taskId!.toString(),
                    message: {
                      type: 'agent',
                      content: JSON.stringify(finalJson),
                    },
                  });
                }
                // Ensure task remains active while an ask is pending
                updateTaskMutation.mutate({
                  agentId: message.agent?.id || '',
                  taskId: message.event!.taskId!.toString(),
                  task: {
                    id: message.event!.taskId!.toString(),
                    agentId: message.agent?.id || '',
                    isCompleted: false,
                  },
                });
                // Clear loading state when final ask message is received
                triggerLoadingStateChange(
                  message.event!.taskId!.toString(),
                  false
                );
              } else {
                // Skip api_req_started messages - they should only trigger loading state
                if (say === 'api_req_started') {
                  // Trigger loading state for this task
                  triggerLoadingStateChange(
                    message.event!.taskId!.toString(),
                    true
                  );
                } else {
                  // Non-ask structured, just append text
                  addMessageMutation.mutate({
                    taskId: message.event!.taskId!.toString(),
                    message: { type: isUser ? 'user' : 'agent', content: text },
                  });
                  // Clear loading state when final message is received
                  if (!isUser) {
                    triggerLoadingStateChange(
                      message.event!.taskId!.toString(),
                      false
                    );
                  }
                }
              }
            }
            break;
          }
        }

        break;
      case EMessageFromAgent.ActiveTaskIdsResponse:
        addTasksMutation.mutate({
          agentId: message.agent?.id || '',
          tasks:
            (message.data?.activeTaskIds || []).map((taskId: string) => ({
              id: taskId,
              agentId: message.agent?.id || '',
              isCompleted: false,
            })) || [],
        });
        
        // Automatically load task details for all active tasks to get proper titles
        (message.data?.activeTaskIds || []).forEach((taskId: string) => {
          getTaskDetails(message.agent?.id || '', taskId);
        });
        
        // Note: getTaskHistory is now called only when agent is selected, not here
        break;
      case EMessageFromAgent.RooCodeTaskHistory: {
        const agentId = message.agent?.id || '';
        const taskId =
          message.data?.taskId ||
          '';
        if (!taskId) break;
        const rawItems = message.data?.messages || message.data?.history || [];
        const items = (Array.isArray(rawItems) ? rawItems : []).map(
          (m: any) => {
            if (m?.type && m?.content !== undefined) return m;
            const content =
              typeof m === 'string' ? m : (m?.text ?? m?.message ?? '');
            return { type: 'agent', content };
          }
        );
        if (items.length > 0) {
          addMessagesMutation.mutate({ taskId, messages: items });
          addTasksMutation.mutate({
            agentId,
            tasks: [{ id: taskId, agentId }],
          });
        }
        break;
      }
      case EMessageFromAgent.ProfilesResponse:
        addProfilesMutation.mutate(message.data?.profiles || []);
        break;

      case EMessageFromAgent.RooCodeConfiguration:
        addAgentConfigurationMutation.mutate({ id: message.agent?.id || '', configuration: message.data?.rooCodeConfiguration || {} });
        break;
      case EMessageFromAgent.RooCodeCommandResponse: {
        const cmd = message.data?.command as string | undefined;
        const success = !!message.data?.success;
        if (!cmd || !success) break;
        if (cmd === 'getTaskHistory') {
          const history = message.data?.result || [];
          const agentId = message.agent?.id || '';
          const tasks = (Array.isArray(history) ? history : [])
            .map((h: any) => {
              const id = h?.id || h?.taskId || h;
              if (!id) return null as any;
              return {
                id,
                agentId,
                taskData: h,
                // Treat all history list entries as completed by definition
                isCompleted: true,
              };
            })
            .filter((t: any) => t && t.id);
          if (tasks.length) {
            // Add history tasks without overriding existing active tasks
            addTasksMutation.mutate({ agentId, tasks });
            // Don't request getTaskDetails here - only when tab becomes active
          }
        }
        if (cmd === 'getTaskDetails') {
          const agentId = message.agent?.id || '';
          const res = message.data?.result || {};
          const taskId =
            res?.historyItem?.id ||
            res?.taskId ||
            message.data?.taskId ||
            '';
          if (!taskId) break;
          const apiConv = res?.apiConversationHistory || [];
          const msgs = (Array.isArray(apiConv) ? apiConv : [])
            .map((m: any) => {
              const role = m?.role || m?.author;
              const content = m?.content;
              let rawText = '';
              if (Array.isArray(content)) {
                rawText = content.map((c: any) => c?.text || '').join('');
              } else if (typeof content === 'string') {
                rawText = content;
              } else {
                rawText = m?.text || '';
              }

              // Extract display-friendly content:
              // 1) Prefer text inside <task> for user messages
              const taskMatch = rawText.match(
                /<task[\s\S]*?>[\s\S]*?<\/task>/i
              );
              if (taskMatch && role === 'user') {
                const inner = (taskMatch[0] || '')
                  .replace(/<task[\s\S]*?>/i, '')
                  .replace(/<\/task>/i, '')
                  .trim();
                if (inner) {
                  return { type: 'user' as const, content: inner };
                }
              }

              // 2) If assistant asks a followup, convert to JSON {question, suggest}
              if (/<ask_followup_question[\s\S]*?>/i.test(rawText)) {
                const qMatch = rawText.match(
                  /<question>([\s\S]*?)<\/question>/i
                );
                const question = qMatch ? qMatch[1].trim() : '';
                const suggest: Array<{ answer: string }> = [];
                const suggestRegex = /<suggest>([\s\S]*?)<\/suggest>/gi;
                let s;
                while ((s = suggestRegex.exec(rawText)) !== null) {
                  const ans = (s[1] || '').trim();
                  if (ans) suggest.push({ answer: ans });
                }
                const payload = { question, suggest };
                if (question || suggest.length) {
                  return {
                    type: 'agent' as const,
                    content: JSON.stringify(payload),
                  };
                }
              }

              // 3) Otherwise, remove <environment_details> and other meta wrappers, keep remaining text
              let cleaned = rawText
                .replace(
                  /<environment_details[\s\S]*?<\/environment_details>/gi,
                  ''
                )
                .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
                .replace(
                  /<ask_followup_question[\s\S]*?<\/ask_followup_question>/gi,
                  ''
                )
                .trim();

              // Skip messages that are just "false" or other uninformative content
              if (cleaned === 'false' || cleaned === 'true' || cleaned === 'null' || cleaned === 'undefined') {
                return null;
              }

              // Skip messages that are just file listings or directory structures
              if (cleaned.match(/^[\w\-\.\/\s]+$/i) && cleaned.split('\n').length > 10) {
                return null;
              }

              // Skip messages that are just package.json content without context
              if (cleaned.includes('"name":') && cleaned.includes('"version":') && cleaned.includes('"dependencies":')) {
                return {
                  type: 'agent' as const,
                  content: JSON.stringify({
                    type: 'say',
                    say: 'auto_followup',
                    text: 'I found the package.json file. This appears to be an auto-followup to examine the project structure.'
                  })
                };
              }

              return {
                type: (role === 'user' ? 'user' : 'agent') as 'user' | 'agent',
                content: cleaned,
              };
            })
            .filter(
              (x: any) => x !== null && typeof x.content === 'string' && x.content.trim()
            );
          if (msgs.length) {
            addMessagesMutation.mutate({ taskId, messages: msgs as any });
            addTasksMutation.mutate({
              agentId,
              tasks: [{ id: taskId, agentId }],
            });
          }
        }
        break;
      }
      case EMessageFromAgent.ActiveProfileResponse:
        updateActiveProfileMutation.mutate(message.data?.activeProfile || '');
        break;
      case EMessageFromAgent.TaskStartedResponse:
        console.log('TaskCreatedResponse', message);
        if (message.data?.clientTaskId && message.data?.agentTaskId) {
          const previousMessages = queryClient.getQueryData(
            getMessagesByTaskId(message.data?.clientTaskId).queryKey
          );

          // Copy all messages from client task to agent task to preserve the conversation
          // This ensures the user's initial message stays visible in the chat
          if (previousMessages && previousMessages.length > 0) {
            addMessagesMutation.mutate({
              taskId: message.data?.agentTaskId || '',
              messages: previousMessages,
            });
          }

          // Remove the old client task and add the new agent task
          const agentId = message.agent?.id || '';
          queryClient.setQueryData(
            getTasksByAgentId(agentId).queryKey,
            (old: any[] | undefined) => {
              if (!old) return [];

              // Remove the old task with clientTaskId
              const filtered = old.filter(
                (task) => task.id !== message.data?.clientTaskId
              );

              // Add the new task with agentTaskId (if it doesn't already exist)
              const agentTaskExists = filtered.some(
                (task) => task.id === message.data?.agentTaskId
              );
              if (!agentTaskExists) {
                filtered.push({
                  id: message.data?.agentTaskId || '',
                  agentId: agentId,
                  isNewTask: false,
                });
              }

              return filtered;
            }
          );

          // Notify about task ID change so UI can update selectedTaskId
          triggerTaskIdChange(message.data?.clientTaskId, message.data?.agentTaskId);
        } else {
          addTasksMutation.mutate({
            agentId: message.agent?.id || '',
            tasks: [
              {
                id: message.data?.agentTaskId || '',
                agentId: message.agent?.id || '',
              },
            ],
          });
        }
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (connectionAttempts >= maxReconnectAttempts) {
      console.error(
        '🚫 Достигнуто максимальное количество попыток переподключения'
      );
      setIsConnecting(false);
      return;
    }

    if (isConnecting) {
      // Connection already in progress
      return;
    }

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close(1000, 'Переподключение');
    }

    clearTimers();
    setIsConnecting(true);
    setConnectionAttempts((prev) => prev + 1);

    const websocket = new WebSocket(url);

    websocket.onopen = () => {
      console.log('🔗 Connected to WebSocket server');

      wsRef.current = websocket;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionAttempts(0);
      notifyConnectionHandlers(true);

      // Clear deduplication set on new connection
      processedMessageTimestamps.current.clear();

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

      // Initial load after registration
      try {
        getAgents();
      } catch {}

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
            // Heartbeat error - reconnect silently
            connect();
          }
        } else {
          // WebSocket not open during heartbeat - reconnect silently
          connect();
        }
      }, heartbeatInterval);
    };

    // Обработчик входящих сообщений
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Message;
        // console.log('🔔 Получено WebSocket сообщение:', message);

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
        attempt: connectionAttempts,
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
        const delay = Math.min(
          reconnectInterval * Math.pow(2, connectionAttempts),
          30000
        );
        // Reconnection scheduled

        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isConnected && !isConnecting) {
            connect();
          }
        }, delay);
      } else {
        console.log(
          '🚫 Переподключение не требуется:',
          code === 1000
            ? 'Нормальное закрытие'
            : code === 1001
              ? 'Уход пользователя'
              : 'Достигнуто максимальное количество попыток'
        );
      }
    };
  }, []);

  // Отправка сообщения
  const sendMessage = useCallback(
    (message: Message) => {
      console.log('📤 Sending message:', message);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(message));
          console.log('✅ Message sent successfully');
        } catch (error) {
          console.error('❌ Ошибка отправки сообщения:', error);
          if (!isConnecting) {
            connect();
          }
        }
      } else {
        console.warn('⚠️ WebSocket not connected, state:', wsRef.current?.readyState);
        if (!isConnecting && !isConnected) {
          console.log('🔄 Auto-reconnecting...');
          connect();
        }
      }
    },
    [isConnecting, isConnected, connect]
  );

  // Ручное переподключение
  const reconnect = useCallback(() => {
    // Manual reconnection requested

    setConnectionAttempts(0);

    if (wsRef.current) {
      wsRef.current.close(1000, 'Ручное переподключение');
    }

    clearTimers();
    setIsConnected(false);
    setIsConnecting(false);

    setTimeout(() => connect(), 100);
  }, [connect, clearTimers]);

  const getActiveTaskIds = useCallback(
    async (agentId: string) => {
      const message: Message = {
        type: EMessageFromUI.GetActiveTaskIds,
        source: ConnectionSource.UI,
        agent: { id: agentId },
      };

      sendMessage(message);
    },
    [sendMessage]
  );

  const getAgents = useCallback(async () => {
    const message: Message = {
      type: EMessageFromUI.GetAgents,
      source: ConnectionSource.UI,
    };

    sendMessage(message);
  }, [sendMessage]);

  const getProfiles = useCallback(
    async (agentId: string) => {
      if (requestedProfilesRef.current.has(agentId)) {
        return; // Already requested for this agent
      }
      requestedProfilesRef.current.add(agentId);

      const message: Message = {
        type: EMessageFromUI.GetProfiles,
        source: ConnectionSource.UI,
        agent: { id: agentId },
      };

      sendMessage(message);
    },
    [sendMessage]
  );

  const getActiveProfile = useCallback(
    async (agentId: string) => {
      if (requestedActiveProfileRef.current.has(agentId)) {
        return; // Already requested for this agent
      }
      requestedActiveProfileRef.current.add(agentId);

      const message: Message = {
        type: EMessageFromUI.GetActiveProfile,
        source: ConnectionSource.UI,
        agent: { id: agentId },
      };

      sendMessage(message);
    },
    [sendMessage]
  );

  const getAgentConfiguration = useCallback(
    async (agentId: string) => {
      if (requestedAgentConfigurationRef.current.has(agentId)) {
        return; // Already requested for this agent
      }
      requestedAgentConfigurationRef.current.add(agentId);

      const message: Message = {
        type: EMessageFromUI.GetConfiguration,
        source: ConnectionSource.UI,
        agent: { id: agentId },
      };
      console.log('🔄 Getting agent configuration for:', agentId, message);

      sendMessage(message);
    },
    [sendMessage]
  );

  const sendAgentConfiguration = useCallback(
    async (agentId: string, configuration: RooCodeSettings) => {
      const wsMessage: Message = {
        type: EMessageFromUI.SetConfiguration,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          configuration
        },
      };
      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const getTaskHistory = useCallback(
    async (agentId: string) => {
      if (requestedTaskHistoryRef.current.has(agentId)) {
        return; // Already requested for this agent
      }
      requestedTaskHistoryRef.current.add(agentId);

      const wsMessage: Message = {
        type: EMessageFromUI.RooCodeCommand,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          command: 'getTaskHistory',
        },
      };
      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const getTaskDetails = useCallback(
    async (agentId: string, taskId: string) => {
      const wsMessage: Message = {
        type: EMessageFromUI.RooCodeCommand,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          command: 'getTaskDetails',
          parameters: { taskId },
        },
      };
      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const resumeTask = useCallback(
    async (agentId: string, taskId: string) => {
      const wsMessage: Message = {
        type: EMessageFromUI.RooCodeCommand,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          command: 'resumeTask',
          parameters: { taskId },
        },
      };
      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const sendToolApprovalResponse = useCallback(
    async (
      agentId: string,
      taskId: string,
      approved: boolean,
      _toolData?: any
    ) => {
      // Send proper approval response format
      const response = approved ? "The task was autoapproved with info in the chat" : "noButtonClicked";

      const wsMessage: Message = {
        type: EMessageFromUI.SendMessageToTask,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          taskId,
          message: response,
        },
        timestamp: Date.now(),
      };
      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const startNewTask = useCallback(
    async (
      agentId: string,
      taskId: string,
      message: string,
      profile?: string | null
    ) => {
      const wsMessage: Message = {
        type: EMessageFromUI.CreateTask,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: {
          taskId,
          message,
          ...(profile ? { profile } : {}),
        },
      };

      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const sendMessageToTask = useCallback(
    async (agentId: string, taskId: string, message: string) => {
      const wsMessage: Message = {
        type: EMessageFromUI.SendMessageToTask,
        source: ConnectionSource.UI,
        agent: { id: agentId },
        data: { taskId, message },
      };

      sendMessage(wsMessage);
    },
    [sendMessage]
  );

  const onConnectionStateChange = useCallback(
    (handler: (isConnected: boolean) => void) => {
      connectionHandlersRef.current.add(handler);
      return () => {
        connectionHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const loadingStateHandlersRef = useRef<
    Set<(taskId: string, isLoading: boolean) => void>
  >(new Set());
  const taskIdChangeHandlersRef = useRef<
    Set<(oldTaskId: string, newTaskId: string) => void>
  >(new Set());

  const onLoadingStateChange = useCallback(
    (handler: (taskId: string, isLoading: boolean) => void) => {
      loadingStateHandlersRef.current.add(handler);
      return () => {
        loadingStateHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const onTaskIdChange = useCallback(
    (handler: (oldTaskId: string, newTaskId: string) => void) => {
      taskIdChangeHandlersRef.current.add(handler);
      return () => {
        taskIdChangeHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const triggerLoadingStateChange = useCallback(
    (taskId: string, isLoading: boolean) => {
      loadingStateHandlersRef.current.forEach((handler) => {
        try {
          handler(taskId, isLoading);
        } catch (error) {
          console.error('Error in loading state handler:', error);
        }
      });
    },
    []
  );

  const triggerTaskIdChange = useCallback(
    (oldTaskId: string, newTaskId: string) => {
      taskIdChangeHandlersRef.current.forEach((handler) => {
        try {
          handler(oldTaskId, newTaskId);
        } catch (error) {
          console.error('Error in task ID change handler:', error);
        }
      });
    },
    []
  );

  // Эффект для автоматического подключения при монтировании
  useEffect(() => {
    connect();

    return () => {
      // Cleaning up WebSocket connection
      clearTimers();

      // Clear deduplication set on unmount
      processedMessageTimestamps.current.clear();

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
    getTaskHistory,
    getTaskDetails,
    startNewTask,
    sendMessageToTask,
    resumeTask,
    sendToolApprovalResponse,
    onConnectionStateChange,
    onLoadingStateChange,
    onTaskIdChange,
    getAgentConfiguration,
    sendAgentConfiguration
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
    throw new Error(
      'useWebSocketConnection должен использоваться внутри WebSocketProvider'
    );
  }
  return context;
};

// Экспорт по умолчанию
export default WebSocketProvider;
