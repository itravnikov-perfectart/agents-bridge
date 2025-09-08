import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAddAgentConfiguration } from '../queries/useAgentConfiguration';
import { useWebSocketConnection } from '../providers/connection.provider';
import { RooCodeSettings } from '@roo-code/types';
interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string | null;
  initialConfig?: RooCodeSettings;
}

export function ConfigurationModal({ 
  isOpen, 
  onClose, 
  agentId, 
  initialConfig 
}: ConfigurationModalProps) {
  const [configText, setConfigText] = useState('');
  const addAgentConfigMutation = useAddAgentConfiguration();
  const { sendAgentConfiguration } = useWebSocketConnection();

  // Update config text when initialConfig changes or modal opens
  useEffect(() => {
    if (isOpen && initialConfig) {
      setConfigText(JSON.stringify(initialConfig, null, 2));
    }
  }, [initialConfig, isOpen]);

  const handleSaveConfiguration = () => {
    if (!agentId) return;
    
    try {
      const parsedConfig = JSON.parse(configText) as RooCodeSettings;
      sendAgentConfiguration(agentId, parsedConfig);
      addAgentConfigMutation.mutate({
        id: agentId,
        configuration: parsedConfig
      }, {
        onSuccess: () => {
          onClose();
        }
      });
    } catch (error) {
      console.error('Invalid JSON configuration:', error);
      // TODO: Show error message to user
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl h-3/4 max-h-[600px] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Agent Configuration</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            className="w-full h-full resize-none p-3 border border-border rounded-md bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter JSON configuration..."
          />
        </div>
        
        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border bg-background hover:bg-accent rounded-md transition-colors"
          >
            Закрыть
          </button>
          <button
            onClick={handleSaveConfiguration}
            disabled={addAgentConfigMutation.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addAgentConfigMutation.isPending ? 'Обновление...' : 'Обновить'}
          </button>
        </div>
      </div>
    </div>
  );
}
