

import { User, Wifi, WifiOff, Clock } from 'lucide-react';
import { Agent } from 'agents-bridge-shared';
import { cn } from '../utils/cn';
import { useAgents } from '../queries/useAgents';
import { useWebSocketConnection } from '../providers/connection.provider';
import { useEffect } from 'react';

interface SidebarProps {
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function Sidebar({ 
  selectedAgent,
  onSelectAgent
}: SidebarProps) {

  const { getAgents } = useWebSocketConnection();

  const { data: agents = [] } = useAgents();

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
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

  useEffect(() => {
    getAgents();
  }, [getAgents]);

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      <div className="h-full overflow-y-auto">
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
                  "p-3 rounded-lg cursor-pointer transition-colors mb-2 bg-background",
                  "hover:bg-accent hover:text-accent-foreground border-2",
                  selectedAgent === agent.id 
                    ? "border-primary" 
                    : "border-transparent" 
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{agent.workspacePath?.split('/').pop()}</span>
                      <div className={cn("w-2 h-2 rounded-full", getStatusColor(agent.status))} />
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
                      <div className="text-xs text-muted-foreground">
                        ID: {agent.id}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
