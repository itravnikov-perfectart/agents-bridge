import * as Tabs from '@radix-ui/react-tabs';
import {useQueryClient} from '@tanstack/react-query';
import {MessageCircle, Plus, Loader2, ChevronRight, FileText} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import {useWebSocketConnection} from '../providers/connection.provider';
import {getMessagesByTaskId} from '../queries/useMessages';
import {useAddTask, useTasksByAgentId} from '../queries/useTasks';
import {cn} from '../utils/cn';
import {ChatWindow} from './ChatWindow';

interface ChatTabsProps {
  selectedAgent: string | null;
}

export function ChatTabs({selectedAgent}: ChatTabsProps) {
  const [activeTabIndex, setActiveTabIndex] = useState<string>('0');
  const [view, setView] = useState<'active' | 'history'>('active');
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [pendingSpawnChildId, setPendingSpawnChildId] = useState<string | null>(null);
  const [sideBySideChildId, setSideBySideChildId] = useState<string | null>(null);
  const [sideBySideParentId, setSideBySideParentId] = useState<string | null>(null);
  const {
    getActiveTaskIds,
    getTaskHistory,
    getTaskDetails,
    resumeTask,
    terminateTask,
    onLoadingStateChange,
    onTaskSpawned
  } = useWebSocketConnection();
  const requestedTaskDetailsRef = React.useRef<Set<string>>(new Set());
  const resumedTaskIdRef = React.useRef<string | null>(null);

  const queryClient = useQueryClient();
  const {data: agentTasks} = useTasksByAgentId(selectedAgent);

  // Group tasks by hierarchy
  const groupTasksByHierarchy = (tasks: any[]) => {
    const mainTasks = tasks.filter((t: any) => !t.isSubtask && !t.parentTaskId);
    const subtasks = tasks.filter((t: any) => t.isSubtask || t.parentTaskId);

    // Group subtasks by parent
    const subtasksByParent = subtasks.reduce((acc: any, subtask: any) => {
      const parentId = subtask.parentTaskId || 'unknown';
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(subtask);
      return acc;
    }, {});

    // Create hierarchical structure
    const hierarchicalTasks: any[] = [];
    mainTasks.forEach((mainTask) => {
      hierarchicalTasks.push(mainTask);
      const childSubtasks = subtasksByParent[mainTask.id] || [];
      childSubtasks.sort((a: any, b: any) => (a.level || 0) - (b.level || 0));
      hierarchicalTasks.push(...childSubtasks);
    });

    return hierarchicalTasks;
  };

  const activeTasks = (agentTasks || []).filter((t: any) => !t.isCompleted);
  const historyTasks = (agentTasks || [])
    .filter((t: any) => !!t.isCompleted)
    .sort((a: any, b: any) => {
      // Sort by creation time if available, otherwise by ID (assuming newer IDs are later)
      const aTime = a.taskData?.created_at || a.taskData?.createdAt;
      const bTime = b.taskData?.created_at || b.taskData?.createdAt;

      // If both have timestamps, sort by timestamp (newest first)
      if (aTime && bTime && typeof aTime === 'string' && typeof bTime === 'string') {
        try {
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        } catch {
          // If date parsing fails, fall back to ID sorting
        }
      }

      // Sort by ID (assuming newer UUIDs are lexicographically later)
      // This works well with UUID v4 which includes timestamp information
      return b.id.localeCompare(a.id);
    });

  const visibleTasks =
    view === 'active' ? groupTasksByHierarchy(activeTasks) : groupTasksByHierarchy(historyTasks);

  const addTaskMutation = useAddTask();

  const sanitizeTitle = (raw?: string): string => {
    if (!raw) {
      return '';
    }
    let text = raw;
    // Remove environment and task blocks
    text = text.replace(/<environment_details[\s\S]*?<\/environment_details>/gi, '');
    text = text.replace(/<task[\s\S]*?<\/task>/gi, '');
    // Remove thinking/follow-up blocks
    text = text.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
    text = text.replace(/<ask_followup_question[\s\S]*?<\/ask_followup_question>/gi, '');
    // If contains bracketed meta like [ask_followup_question ...] Result: ... → take the Result tail
    const resultIdx = text.indexOf('Result:');
    if (resultIdx !== -1) {
      text = text.slice(resultIdx + 'Result:'.length);
    }
    // Drop any leading bracketed tag e.g., [ask_followup_question ...]
    text = text.replace(/^\s*\[[^\]]+\]\s*/i, '');
    // Remove any remaining tags
    text = text.replace(/<[^>]+>/g, '');
    // First non-empty line
    const firstLine =
      text
        .split('\n')
        .map((s) => s.trim())
        .find((s) => s.length > 0) || '';
    return firstLine.slice(0, 80);
  };

  const pickTabLabel = (task: any, msgs: any[]): string => {
    // First try to get title from task data (from getTaskHistory)
    if (task?.taskData) {
      const taskData = task.taskData;
      // Try to extract title from task data
      if (typeof taskData?.task === 'string' && taskData.task.trim()) {
        return sanitizeTitle(taskData.task);
      }
      if (taskData?.title) {
        return sanitizeTitle(taskData.title);
      }
      if (taskData?.name) {
        return sanitizeTitle(taskData.name);
      }
      if (taskData?.description) {
        return sanitizeTitle(taskData.description);
      }
      // Try to get first message from task data
      if (taskData?.messages && Array.isArray(taskData.messages)) {
        for (const m of taskData.messages) {
          const content = typeof m?.content === 'string' ? (m.content as string) : '';
          const cleaned = sanitizeTitle(content).trim();
          if (cleaned) {
            return cleaned;
          }
        }
      }
    }

    // Fallback to messages from query cache
    if (!Array.isArray(msgs)) {
      return '';
    }
    // Walk messages from start to find the first meaningful line
    for (const m of msgs) {
      const content = typeof m?.content === 'string' ? (m.content as string) : '';
      const cleaned = sanitizeTitle(content).trim();
      if (cleaned) {
        return cleaned;
      }
    }
    return '';
  };

  useEffect(() => {
    if (selectedAgent) {
      getActiveTaskIds(selectedAgent);
      getTaskHistory(selectedAgent); // Provider handles deduplication
    }
  }, [selectedAgent, getActiveTaskIds, getTaskHistory]);

  // Ensure Tabs stays controlled and points to a valid index
  useEffect(() => {
    const taskCount = visibleTasks.length;
    if (taskCount > 0) {
      const currentIndex = parseInt(activeTabIndex, 10);
      if (Number.isNaN(currentIndex) || currentIndex < 0 || currentIndex >= taskCount) {
        setActiveTabIndex('0');
      }
    }
  }, [visibleTasks, activeTabIndex]);

  // Request task details when tab becomes active
  useEffect(() => {
    if (selectedAgent && visibleTasks && visibleTasks.length > 0) {
      const currentIndex = parseInt(activeTabIndex, 10);
      if (!Number.isNaN(currentIndex) && currentIndex >= 0 && currentIndex < visibleTasks.length) {
        const activeTask = visibleTasks[currentIndex];
        if (activeTask && !requestedTaskDetailsRef.current.has(activeTask.id)) {
          requestedTaskDetailsRef.current.add(activeTask.id);
          getTaskDetails(selectedAgent, activeTask.id);
        }
      }
    }
  }, [selectedAgent, activeTabIndex, visibleTasks, getTaskDetails]);

  // Reset current tab when switching view
  useEffect(() => {
    setActiveTabIndex('0');
  }, [view]);

  const handleCreateNewChat = () => {
    if (selectedAgent && !isCreatingTask) {
      // Ensure the view is set to active when creating a new chat
      setView('active');
      setIsCreatingTask(true);
      addTaskMutation.mutate(
        {
          agentId: selectedAgent,
          task: {
            id: uuidv4(),
            agentId: selectedAgent,
            isNewTask: true
          }
        },
        {
          onSettled: () => {
            // Reset the creating state after a short delay
            setTimeout(() => setIsCreatingTask(false), 1000);
            // After creating, make sure the first active tab is selected
            setActiveTabIndex('0');
          }
        }
      );
    }
  };

  const handleResumeTask = (taskId: string) => {
    if (selectedAgent) {
      // Store the resumed task ID
      resumedTaskIdRef.current = taskId;

      // Resume the task
      resumeTask(selectedAgent, taskId);

      // Switch to active view immediately
      setView('active');
    }
  };

  const setTaskLoading = (taskId: string, isLoading: boolean) => {
    setLoadingTasks((prev) => {
      const newSet = new Set(prev);
      if (isLoading) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  };

  // Handle task resumption - switch to active view and select the resumed task
  useEffect(() => {
    if (view === 'active' && activeTasks.length > 0) {
      // If we have a resumed task ID, try to find and select it
      if (resumedTaskIdRef.current) {
        const resumedTaskIndex = activeTasks.findIndex(
          (t: any) => t.id === resumedTaskIdRef.current
        );
        if (resumedTaskIndex !== -1) {
          setActiveTabIndex(String(resumedTaskIndex));
          resumedTaskIdRef.current = null; // Clear the ref
          return;
        }
      }

      // Fallback: if current tab index is invalid, select the first active task
      const currentIndex = parseInt(activeTabIndex, 10);
      if (Number.isNaN(currentIndex) || currentIndex >= activeTasks.length) {
        setActiveTabIndex('0');
      }
    }
  }, [view, activeTasks, activeTabIndex]);

  // Auto-focus newly spawned subtasks
  useEffect(() => {
    const unsubscribe = onTaskSpawned(({agentId, parentTaskId, childTaskId}) => {
      if (!selectedAgent || agentId !== selectedAgent) {
        return;
      }
      // Switch to active view and focus the child task tab when it appears
      setView('active');
      setPendingSpawnChildId(childTaskId);
      setSideBySideChildId(childTaskId);
      setSideBySideParentId(parentTaskId || null);
    });
    return unsubscribe;
  }, [selectedAgent, activeTasks, onTaskSpawned]);

  // Focus pending spawned child when it becomes visible in activeTasks
  useEffect(() => {
    if (view !== 'active' || !pendingSpawnChildId) {
      return;
    }
    const idx = (activeTasks || []).findIndex((t: any) => t.id === pendingSpawnChildId);
    if (idx >= 0) {
      setActiveTabIndex(String(idx));
      setPendingSpawnChildId(null);
    }
  }, [view, activeTasks, pendingSpawnChildId]);

  // Listen for loading state changes from WebSocket connection
  useEffect(() => {
    const unsubscribe = onLoadingStateChange((taskId: string, isLoading: boolean) => {
      setLoadingTasks((prev) => {
        const newSet = new Set(prev);
        if (isLoading) {
          newSet.add(taskId);
        } else {
          newSet.delete(taskId);
        }
        return newSet;
      });
    });

    return unsubscribe;
  }, [onLoadingStateChange]);

  if (!selectedAgent) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Select Agent</h3>
          <p>Select an agent from the left panel to start chatting</p>
        </div>
      </div>
    );
  }

  if ((agentTasks?.length || 0) === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No active chats</h3>
          <p className="text-muted-foreground mb-4">Create a new chat with agent {selectedAgent}</p>
          <button
            onClick={handleCreateNewChat}
            disabled={isCreatingTask}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {isCreatingTask ? 'Creating...' : 'Create Chat'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Tabs.Root
        value={activeTabIndex}
        onValueChange={setActiveTabIndex}
        className="flex flex-col h-full"
      >
        {/* Табы */}
        <div className="flex w-full items-center border-b border-border bg-background">
          <Tabs.List className="flex overflow-x-auto items-center h-12 px-4 gap-1">
            {/* Active/History toggle */}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => setView('active')}
                disabled={(agentTasks?.length || 0) === 0}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border',
                  view === 'active'
                    ? 'bg-accent text-accent-foreground border-transparent'
                    : 'bg-transparent text-muted-foreground border-border',
                  (agentTasks?.length || 0) === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                Active{activeTasks.length > 0 ? `(${activeTasks.length})` : ''}
              </button>
              <button
                onClick={() => setView('history')}
                disabled={(agentTasks?.length || 0) === 0}
                className={cn(
                  'px-2 py-1 text-xs rounded-md border',
                  view === 'history'
                    ? 'bg-accent text-accent-foreground border-transparent'
                    : 'bg-transparent text-muted-foreground border-border',
                  (agentTasks?.length || 0) === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                History
                {historyTasks.length > 0 ? `(${historyTasks.length})` : ''}
              </button>
            </div>

            {/* Terminate Task button - shown when there is at least one completed task */}
            {historyTasks.length > 0 && (
              <button
                onClick={() => {
                  if (!selectedAgent || activeTasks.length === 0) {
                    return;
                  }
                  const currentIndex = parseInt(activeTabIndex, 10);
                  const activeTask =
                    activeTasks[
                      Number.isNaN(currentIndex) ||
                      currentIndex < 0 ||
                      currentIndex >= activeTasks.length
                        ? 0
                        : currentIndex
                    ];
                  if (activeTask) {
                    console.info('[UI->WS] TerminateTask (from header button)', {
                      agentId: selectedAgent,
                      taskId: activeTask.id
                    });
                    terminateTask(selectedAgent, activeTask.id);
                  }
                }}
                disabled={activeTasks.length === 0}
                className={cn(
                  'ml-2 px-2 py-1 text-xs rounded-md border',
                  'bg-destructive text-destructive-foreground border-transparent hover:bg-destructive/90',
                  activeTasks.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
                title={
                  activeTasks.length === 0
                    ? 'No active task to terminate'
                    : 'Terminate current active task'
                }
              >
                Terminate Task
              </button>
            )}

            {visibleTasks.map((task, index) => {
              const messages =
                queryClient.getQueryData(getMessagesByTaskId(task.id).queryKey) || [];
              const name = pickTabLabel(task, messages as any[]);
              const isSubtask = task.isSubtask || task.parentTaskId;
              const level = task.level || 0;

              return (
                <Tabs.Trigger
                  key={task.id}
                  value={String(index)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md',
                    'data-[state=active]:bg-accent data-[state=active]:text-accent-foreground',
                    'hover:bg-accent/50 transition-colors group max-w-48',
                    isSubtask && 'ml-4 border-l-2 border-muted-foreground/30'
                  )}
                  style={{
                    paddingLeft: isSubtask ? `${12 + level * 16}px` : '12px'
                  }}
                >
                  {loadingTasks.has(task.id) ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : isSubtask ? (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <MessageCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{task.isNewTask ? 'New Chat' : name || task.id}</span>
                  {isSubtask && (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                      Subtask
                    </span>
                  )}
                  {isSubtask && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  )}
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          {/* Кнопка создания нового чата */}
          <button
            onClick={handleCreateNewChat}
            disabled={isCreatingTask}
            className="ml-auto shrink-0 mr-4 inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {isCreatingTask ? 'Creating...' : 'New Chat'}
          </button>
        </div>

        {/* Содержимое табов */}
        <div className="w-full overflow-hidden h-full">
          {visibleTasks.map((task, index) => (
            <Tabs.Content
              key={task.id}
              value={String(index)}
              className="h-full w-full data-[state=active]:flex data-[state=inactive]:hidden"
            >
              {/* Primary chat area (left) */}
              <div className="flex h-full w-full gap-2">
                <div className={cn('flex-1 min-w-0 overflow-hidden')}>
                  <ChatWindow
                    isNewTaskChat={task.isNewTask || false}
                    isCompleted={task.isCompleted || false}
                    agentId={selectedAgent}
                    taskId={task.id}
                    parentTaskId={task.parentTaskId}
                    onResumeTask={handleResumeTask}
                    onSetLoading={setTaskLoading}
                  />
                </div>
                {/* Side-by-side read-only child chat (right) */}
                {sideBySideChildId && (
                  <div className="w-[38%] min-w-[320px] border-l border-border">
                    <ChatWindow
                      isNewTaskChat={false}
                      isCompleted={false}
                      agentId={selectedAgent}
                      taskId={sideBySideChildId}
                      parentTaskId={sideBySideParentId || task.id}
                      readOnly
                      onResumeTask={handleResumeTask}
                      onSetLoading={setTaskLoading}
                    />
                  </div>
                )}
              </div>
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}
