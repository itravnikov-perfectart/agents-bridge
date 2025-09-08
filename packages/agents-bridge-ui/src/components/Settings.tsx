import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Save } from 'lucide-react';
import { cn } from '../utils/cn';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsData {
  autoApproval: boolean;
  autoApprovalTimeout: number;
  showTimer: boolean;
  retryOnError: boolean;
  maxRetries: number;
  githubToken: string;
}

const DEFAULT_SETTINGS: SettingsData = {
  autoApproval: true,
  autoApprovalTimeout: 10,
  showTimer: true,
  retryOnError: true,
  maxRetries: 3,
  githubToken: '',
};

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('agents-bridge-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem('agents-bridge-settings', JSON.stringify(settings));
    setHasChanges(false);
    onClose();
  };

  // Update setting and mark as changed
  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Settings Content */}
        <div className="p-4 space-y-6">
          {/* Auto Approval Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Auto Approval</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium">Enable Auto Approval</label>
                <p className="text-xs text-muted-foreground">
                  Automatically approve tool requests after timeout
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoApproval}
                  onChange={(e) => updateSetting('autoApproval', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {settings.autoApproval && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Timeout (seconds)</label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={settings.autoApprovalTimeout}
                  onChange={(e) => updateSetting('autoApprovalTimeout', parseInt(e.target.value) || 10)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {/* Timer Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Timer Display</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium">Show Timer</label>
                <p className="text-xs text-muted-foreground">
                  Display countdown timer for auto-approval
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showTimer}
                  onChange={(e) => updateSetting('showTimer', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Error Handling Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Error Handling</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium">Auto Retry on Error</label>
                <p className="text-xs text-muted-foreground">
                  Automatically retry failed requests with exponential backoff
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.retryOnError}
                  onChange={(e) => updateSetting('retryOnError', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {settings.retryOnError && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Retries</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.maxRetries}
                  onChange={(e) => updateSetting('maxRetries', parseInt(e.target.value) || 3)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {/* GitHub Integration Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">GitHub Integration</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">GitHub Token</label>
              <p className="text-xs text-muted-foreground">
                Personal access token for GitHub API access. Used for repository operations and code analysis.
              </p>
              <textarea
                value={settings.githubToken}
                onChange={(e) => updateSetting('githubToken', e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              />
              {settings.githubToken && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-600">Token configured</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={!hasChanges}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
              hasChanges
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// Hook to use settings throughout the app
export const useSettings = () => {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedSettings = localStorage.getItem('agents-bridge-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<SettingsData>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('agents-bridge-settings', JSON.stringify(updated));
  };

  return { settings, updateSettings };
};

// Hook to get GitHub token specifically
export const useGitHubToken = () => {
  const { settings } = useSettings();
  return settings.githubToken;
};
