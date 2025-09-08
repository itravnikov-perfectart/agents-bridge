import { Sidebar } from './Sidebar';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { Settings } from './Settings';
import { useState, useEffect } from 'react';
import { useWebSocketConnection } from '../providers/connection.provider';
import { useTasksByAgentId } from '../queries/useTasks';
import { useAgents } from '../queries/useAgents';

export function App() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const { onTaskIdChange } = useWebSocketConnection();
  
  const { isConnecting, isConnected, connectionAttempts } = useWebSocketConnection();
  const { data: agentTasks } = useTasksByAgentId(selectedAgent);
  const { data: agents = [] } = useAgents();
  
  // Listen for task ID changes (when new tasks are created)
  useEffect(() => {
    const unsubscribe = onTaskIdChange((oldTaskId, newTaskId) => {
      if (selectedTaskId === oldTaskId) {
        setSelectedTaskId(newTaskId);
      }
    });
    
    return unsubscribe;
  }, [onTaskIdChange, selectedTaskId]);

  // Debug WebSocket connection
  useEffect(() => {
    console.log('🔌 WebSocket Status:', { isConnected, isConnecting, connectionAttempts });
  }, [isConnected, isConnecting, connectionAttempts]);

  // Reset selectedAgent if the agent was removed
  useEffect(() => {
    if (selectedAgent && agents.length > 0) {
      const agentExists = agents.some(agent => agent.id === selectedAgent);
      if (!agentExists) {
        console.log(`🗑️ Selected agent ${selectedAgent} was removed, resetting selection`);
        setSelectedAgent(null);
        setSelectedTaskId(null);
      }
    }
  }, [selectedAgent, agents]);
  
  // Get task completion status
  const selectedTask = agentTasks?.find((t: any) => t.id === selectedTaskId);
  const isTaskCompleted = selectedTask?.isCompleted || false;

  if (isConnecting || !isConnected) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {isConnecting ? 'Connecting to server...' : 'Connection failed'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Attempts: {connectionAttempts}
          </p>
          {!isConnected && (
            <p className="text-sm text-muted-foreground">
              Please check if the server is running on ws://localhost:8080
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Column 1: Agents */}
      <Sidebar
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      
      {/* Column 2: Chat List */}
      <div className="w-80 border-r border-border">
        <ChatList
          selectedAgent={selectedAgent}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
        />
      </div>
      
      {/* Column 3: Chat Window */}
      <div className="flex-1 min-w-0">
        {selectedAgent && selectedTaskId ? (
          <ChatWindow
            agentId={selectedAgent}
            taskId={selectedTaskId}
            isNewTaskChat={selectedTask?.isNewTask || false}
            isCompleted={isTaskCompleted}
            onResumeTask={(taskId) => setSelectedTaskId(taskId)}
            onSetLoading={() => {}}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="text-lg font-medium mb-2">Select a Chat</div>
              <p>Choose a chat from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
      
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
