
import { Avatar, AvatarFallback } from '@radix-ui/react-avatar';
import { Separator } from '@radix-ui/react-separator';
import { User, Wifi, WifiOff, Clock } from 'lucide-react';
import type { Agent } from '../types';
import { cn } from '../utils/cn';

interface SidebarProps {
  agents: Agent[];
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
  wsConnected: boolean;
  onReconnect?: () => void;
  connectionAttempts?: number;
}

export function Sidebar({ 
  agents, 
  selectedAgent, 
  onSelectAgent, 
  wsConnected, 
  onReconnect,
  connectionAttempts = 0 
}: SidebarProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}с назад`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}м назад`;
    const hours = Math.floor(minutes / 60);
    return `${hours}ч назад`;
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

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Заголовок */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Agents</h2>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 text-sm",
              wsConnected ? "text-green-600" : "text-red-600"
            )}>
              {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {wsConnected ? 'Connected' : 'Disconnected'}
            </div>
            {!wsConnected && onReconnect && (
              <button
                onClick={onReconnect}
                className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-muted-foreground">
            Active agents: {agents.length}
          </p>
          {connectionAttempts > 0 && (
            <p className="text-xs text-muted-foreground">
              Attempts: {connectionAttempts}
            </p>
          )}
        </div>
      </div>

      {/* Список агентов */}
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
                  "p-3 rounded-lg cursor-pointer transition-colors mb-2",
                  "hover:bg-accent hover:text-accent-foreground",
                  selectedAgent === agent.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-background"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Аватар агента */}
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground flex items-center justify-center h-full w-full rounded-full">
                      {agent.id.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    {/* ID агента */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{agent.id}</span>
                      <div className={cn("w-2 h-2 rounded-full", getStatusColor(agent.status))} />
                    </div>

                    {/* Статус */}
                    <div className="flex items-center gap-1 mb-1">
                      {getStatusIcon(agent.status)}
                      <span className="text-xs capitalize">{agent.status}</span>
                    </div>

                    {/* Время подключения */}
                    <div className="text-xs text-muted-foreground">
                      Connected: {formatTime(agent.connectedAt)}
                    </div>

                    {/* Последний heartbeat */}
                    {agent.lastHeartbeat && (
                      <div className="text-xs text-muted-foreground">
                        Activity: {getTimeSince(agent.lastHeartbeat)}
                      </div>
                    )}

                    {/* Grace period индикатор */}
                    {agent.gracePeriod && (
                      <div className="text-xs text-yellow-600 mt-1">
                        Grace period active
                      </div>
                    )}
                  </div>
                </div>

                {/* Метаданные агента */}
                {agent.metadata && Object.keys(agent.metadata).length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(agent.metadata).slice(0, 2).map(([key, value]) => (
                        <div key={key} className="truncate">
                          {key}: {JSON.stringify(value)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
