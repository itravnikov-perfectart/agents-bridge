import React, { useState } from 'react';
import { MessageCircle, Plus, Loader2, ChevronRight, FileText, Settings } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketConnection } from '../providers/connection.provider';
import { getMessagesByTaskId } from '../queries/useMessages';
import { useAddTask, useTasksByAgentId } from '../queries/useTasks';
import { cn } from '../utils/cn';
import { v4 as uuidv4 } from 'uuid';
import { useAgentConfiguration } from '../queries/useAgentConfiguration';
import { ConfigurationModal } from './ConfigurationModal';

interface ChatListProps {
  selectedAgent: string | null;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

export function ChatList({ 
  selectedAgent, 
  selectedTaskId, 
  onSelectTask
}: ChatListProps) {
  const [view, setView] = useState<'active' | 'history'>('active');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  
  const { onLoadingStateChange, getTaskHistory, getActiveTaskIds, getTaskDetails, getAgentConfiguration } = useWebSocketConnection();

  const queryClient = useQueryClient();
  const { data: agentTasks } = useTasksByAgentId(selectedAgent);
  const { data: agentConfig } = useAgentConfiguration(selectedAgent || '');
  
  // Group tasks by hierarchy
  const groupTasksByHierarchy = (tasks: any[]) => {
    const mainTasks = tasks.filter((t: any) => !t.isSubtask && !t.parentTaskId);
    const subtasks = tasks.filter((t: any) => t.isSubtask || t.parentTaskId);
    
    // Group subtasks by parent
    const subtasksByParent = subtasks.reduce((acc: any, subtask: any) => {
      const parentId = subtask.parentTaskId || 'unknown';
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(subtask);
      return acc;
    }, {});
    
    // Create hierarchical structure
    const hierarchicalTasks: any[] = [];
    mainTasks.forEach(mainTask => {
      hierarchicalTasks.push(mainTask);
      const childSubtasks = subtasksByParent[mainTask.id] || [];
      childSubtasks.sort((a: any, b: any) => (a.level || 0) - (b.level || 0));
      hierarchicalTasks.push(...childSubtasks);
    });
    
    return hierarchicalTasks;
  };
  
  const activeTasks = (agentTasks || []).filter((t: any) => t.isCompleted !== true);
  const historyTasks = (agentTasks || [])
    .filter((t: any) => t.isCompleted === true)
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






  
  const visibleTasks = view === 'active' 
    ? groupTasksByHierarchy(activeTasks) 
    : groupTasksByHierarchy(historyTasks);

  const finalVisibleTasks = visibleTasks;

  const addTaskMutation = useAddTask();

  const sanitizeTitle = (raw?: string): string => {
    if (!raw) return '';
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
    const firstLine = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0) || '';
    return firstLine.slice(0, 80);
  };

  const pickTabLabel = (task: any, msgs: any[]): string => {
    // First try to get title from task data (from getTaskHistory)
    if (task?.taskData) {
      const taskData = task.taskData;
      // Try to extract title from task data
      if (typeof taskData?.task === 'string' && taskData.task.trim()) return sanitizeTitle(taskData.task);
      if (taskData?.title) return sanitizeTitle(taskData.title);
      if (taskData?.name) return sanitizeTitle(taskData.name);
      if (taskData?.description) return sanitizeTitle(taskData.description);
      // Try to get first message from task data
      if (taskData?.messages && Array.isArray(taskData.messages)) {
        for (const m of taskData.messages) {
          const content = typeof m?.content === 'string' ? m.content as string : '';
          const cleaned = sanitizeTitle(content).trim();
          if (cleaned) return cleaned;
        }
      }
    }
    
    // Fallback to messages from query cache
    if (Array.isArray(msgs) && msgs.length > 0) {
      // Walk messages from start to find the first meaningful line
      for (const m of msgs) {
        const content = typeof m?.content === 'string' ? m.content as string : '';
        const cleaned = sanitizeTitle(content).trim();
        if (cleaned) return cleaned;
      }
    }
    
    // If no title found, show a loading indicator instead of UUID
    return 'Loading...';
  };

  const handleCreateNewChat = () => {
    if (selectedAgent && !isCreatingTask) {
      setIsCreatingTask(true);
      const newTaskId = uuidv4();
      addTaskMutation.mutate({
        agentId: selectedAgent,
        task: {
          id: newTaskId,
          agentId: selectedAgent,
          isNewTask: true,
        },
      }, {
        onSuccess: () => {
          // Select the new task immediately
          onSelectTask(newTaskId);
        },
        onSettled: () => {
          // Reset the creating state after a short delay
          setTimeout(() => setIsCreatingTask(false), 1000);
        }
      });
    }
  };

  const handleOpenConfigModal = () => {
    if (selectedAgent) {
      setIsConfigModalOpen(true);
    }
  };



  // Fetch both active tasks and task history when agent is selected
  React.useEffect(() => {
    if (selectedAgent) {
      getActiveTaskIds(selectedAgent);
      getTaskHistory(selectedAgent);
      getAgentConfiguration(selectedAgent);
    }
  }, [selectedAgent, getActiveTaskIds, getTaskHistory]);

  // Request task details when a task is selected
  React.useEffect(() => {
    if (selectedAgent && selectedTaskId) {
      getTaskDetails(selectedAgent, selectedTaskId);
    }
  }, [selectedAgent, selectedTaskId, getTaskDetails]);

  // Auto-switch to history tab when selected task completes
  React.useEffect(() => {
    if (selectedTaskId && agentTasks) {
      const selectedTask = agentTasks.find((t: any) => t.id === selectedTaskId);
      if (selectedTask && selectedTask.isCompleted && view === 'active') {
        setView('history');
      }
    }
  }, [selectedTaskId, agentTasks, view]);

  // Listen for loading state changes from WebSocket connection
  React.useEffect(() => {
    const unsubscribe = onLoadingStateChange((taskId: string, isLoading: boolean) => {
      setLoadingTasks(prev => {
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


  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with New Chat Button */}
      <div className="p-4 border-b border-border bg-background">
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleCreateNewChat}
            disabled={isCreatingTask}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {isCreatingTask ? 'Creating...' : 'New Chat'}
          </button>
          <button
            onClick={handleOpenConfigModal}
            className="px-3 py-2 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors inline-flex items-center gap-2"
            title="Update Configuration"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Active/History toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView('active')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md border transition-colors flex-1',
              view === 'active' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-accent'
            )}
          >
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => setView('history')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md border transition-colors flex-1',
              view === 'history' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-accent'
            )}
          >
            History ({historyTasks.length})
          </button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {finalVisibleTasks.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <MessageCircle className="h-8 w-8 mx-auto mb-2" />
            <p>No {view} chats</p>
            {view === 'active' && (
              <p className="text-sm">Create a new chat to get started</p>
            )}
            {view === 'history' && (
              <p className="text-sm">Completed tasks will appear here</p>
            )}
          </div>
        ) : (
          finalVisibleTasks.map((task) => {
          const messages =
            queryClient.getQueryData(
              getMessagesByTaskId(task.id).queryKey
            ) || [];
          const name = pickTabLabel(task, messages as any[]);
          const isSubtask = task.isSubtask || task.parentTaskId;
          const level = task.level || 0;
          
          return (
            <div
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              className={cn(
                'p-3 cursor-pointer transition-colors border-b border-border last:border-b-0',
                'hover:bg-accent hover:text-accent-foreground',
                selectedTaskId === task.id ? 'bg-accent text-accent-foreground' : 'bg-background',
                isSubtask && 'border-l-2 border-muted-foreground/30'
              )}
              style={{
                paddingLeft: isSubtask ? `${12 + (level * 16)}px` : '12px'
              }}
            >
              <div className="flex items-center gap-2">
                {loadingTasks.has(task.id) ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : isSubtask ? (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <MessageCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate text-sm">
                  {task.isNewTask ? 'New Chat' : name || task.id}
                </span>
                {isSubtask && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            </div>
          );
        })
        )}
      </div>
      
      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        agentId={selectedAgent}
        initialConfig={agentConfig}
      />
    </div>
  );
}
