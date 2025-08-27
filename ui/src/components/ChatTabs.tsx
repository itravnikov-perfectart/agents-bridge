import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, MessageCircle} from 'lucide-react';
import { cn } from '../utils/cn';
import { ChatWindow } from './ChatWindow';
import { useWebSocketConnection } from '../providers/connection.provider';
import { useAddTask, useTasksByAgentId } from '../queries/useTasks';
import { v4 as uuidv4 } from 'uuid';
import { getMessagesByTaskId } from '../queries/useMessages';
import { useQueryClient } from '@tanstack/react-query';

interface ChatTabsProps {
  selectedAgent: string | null;
}

export function ChatTabs({ 
  selectedAgent, 
}: ChatTabsProps) {
  const [activeTabIndex, setActiveTabIndex] = useState<string | null>(null);
  const { getActiveTaskIds } = useWebSocketConnection();
  
  const queryClient = useQueryClient();
  const {data: agentTasks} = useTasksByAgentId(selectedAgent);

  const addTaskMutation = useAddTask();

  useEffect(() => {
    if (selectedAgent) {
      getActiveTaskIds(selectedAgent)
    }
  }, [selectedAgent]);

  const handleCreateNewChat = () => {
    if (selectedAgent) {
      addTaskMutation.mutate({
        agentId: selectedAgent,
        task: {
          id: uuidv4(),
          agentId: selectedAgent,
          isNewTask: true,
        }
      });
    }
  };

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

  if (agentTasks?.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No active chats</h3>
          <p className="text-muted-foreground mb-4">
            Create a new chat with agent {selectedAgent}
          </p>
          <button
            onClick={handleCreateNewChat}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <Tabs.Root 
        value={activeTabIndex || undefined} 
        onValueChange={setActiveTabIndex}
        className="flex flex-col h-full"
      >
        {/* Табы */}
        <div className="flex w-full items-center border-b border-border bg-background">
          <Tabs.List className="flex overflow-x-auto items-center h-12 px-4 gap-1">
            {agentTasks?.map((task, index) => {
              const messages = queryClient.getQueryData(getMessagesByTaskId(task.id).queryKey) || [];
              const name = messages?.[0]?.content || '';
              return (
              <Tabs.Trigger
                key={task.id}
                value={String(index)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md",
                  "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
                  "hover:bg-accent/50 transition-colors group max-w-48"
                )}
              >
                 <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="truncate">{task.isNewTask ? 'New Chat' : name || task.id}</span>
              </Tabs.Trigger>
            )}
            
            )}
          </Tabs.List>

          {/* Кнопка создания нового чата */}
          <button
            onClick={handleCreateNewChat}
            className="ml-auto shrink-0 mr-4 inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Содержимое табов */}
        <div className="w-full overflow-hidden h-full">
          {agentTasks?.map((task, index) => (
            <Tabs.Content
              key={task.id}
              value={String(index)}
              className="h-full w-full data-[state=active]:flex data-[state=inactive]:hidden"
            >
              <ChatWindow
                isNewTaskChat={task.isNewTask || false}
                isCompleted={task.isCompleted || false}
                agentId={selectedAgent}
                taskId={task.id}
              />
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}
