import { Sidebar } from './Sidebar';
import { ChatTabs } from './ChatTabs';
import { useState } from 'react';
import { useWebSocketConnection } from '../providers/connection.provider';

export function App() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  
  const { isConnecting, isConnected } = useWebSocketConnection();

  if (isConnecting || !isConnected) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Connecting to server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
      />
      <div className="h-full min-w-0 w-full">
        <ChatTabs
          selectedAgent={selectedAgent}
        />
      </div>
    </div>
  );
}
