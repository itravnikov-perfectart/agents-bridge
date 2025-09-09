import {User, Wifi, WifiOff, Clock, Settings, Plus, Container, X, Loader2} from 'lucide-react';
import {Agent} from 'agents-bridge-shared';
import {cn} from '../utils/cn';
import {useAgents} from '../queries/useAgents';
import {useWebSocketConnection} from '../providers/connection.provider';
import {useEffect, useState} from 'react';

interface SidebarProps {
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({selectedAgent, onSelectAgent, onOpenSettings}: SidebarProps) {
  const {getAgents, createRemoteAgent, stopRemoteAgent, onRemoteAgentCreated, onRemoteAgentError} =
    useWebSocketConnection();
  const [isCreatingRemoteAgent, setIsCreatingRemoteAgent] = useState(false);

  const {data: agents = []} = useAgents();

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500';
      case 'disconnected':
        return 'bg-red-500';
      case 'timeout':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-3 w-3 text-green-600" />;
      case 'disconnected':
        return <WifiOff className="h-3 w-3 text-red-600" />;
      case 'timeout':
        return <Clock className="h-3 w-3 text-yellow-600" />;
      default:
        return <WifiOff className="h-3 w-3 text-gray-600" />;
    }
  };

  const handleCreateRemoteAgent = () => {
    setIsCreatingRemoteAgent(true);
    createRemoteAgent();
  };

  const handleStopRemoteAgent = (agentId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent agent selection
    stopRemoteAgent(agentId);
  };

  // Функция для определения remote агента
  const isRemoteAgent = (agent: Agent) => {
    return agent.isRemote === true;
  };

  useEffect(() => {
    getAgents();
  }, [getAgents]);

  // Слушаем события создания remote агентов для отключения лоадера
  useEffect(() => {
    const unsubscribeCreated = onRemoteAgentCreated(() => {
      setIsCreatingRemoteAgent(false);
    });

    const unsubscribeError = onRemoteAgentError(() => {
      setIsCreatingRemoteAgent(false);
    });

    return () => {
      unsubscribeCreated();
      unsubscribeError();
    };
  }, [onRemoteAgentCreated, onRemoteAgentError]);

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Create Remote Agent Button */}
      <div className="p-4 border-b border-border">
        <button
          onClick={handleCreateRemoteAgent}
          disabled={isCreatingRemoteAgent}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreatingRemoteAgent ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isCreatingRemoteAgent ? 'Creating...' : 'Create Remote Agent'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <User className="h-8 w-8 mx-auto mb-2" />
            <p>No connected agents</p>
          </div>
        ) : (
          <div className="p-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={cn(
                  'p-3 rounded-lg cursor-pointer transition-colors mb-2 bg-background',
                  'hover:bg-accent hover:text-accent-foreground border-2',
                  selectedAgent === agent.id ? 'border-primary' : 'border-transparent'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {agent.workspacePath?.split('/').pop()}
                      </span>
                      {isRemoteAgent(agent) && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                          <Container className="h-3 w-3" />
                          <span>Remote</span>
                        </div>
                      )}
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(agent.status))} />
                    </div>

                    <div className="flex items-center gap-1 mb-1">
                      {getStatusIcon(agent.status)}
                      <span className="text-xs capitalize">{agent.status}</span>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Connected: {formatTime(agent.connectedAt)}
                    </div>

                    {agent.lastHeartbeat && (
                      <div className="text-xs text-muted-foreground">
                        Activity: {getTimeSince(agent.lastHeartbeat)}
                      </div>
                    )}

                    {agent.id && (
                      <div className="text-xs text-muted-foreground">ID: {agent.id}</div>
                    )}
                  </div>

                  {/* Stop Remote Agent Button */}
                  {isRemoteAgent(agent) && (
                    <button
                      onClick={(e) => handleStopRemoteAgent(agent.id, e)}
                      className="flex-shrink-0 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                      title="Stop Remote Agent"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Button at Bottom */}
      <div className="p-4 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
