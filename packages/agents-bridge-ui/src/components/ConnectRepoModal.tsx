import React, {useState, useEffect} from 'react';
import {X, GitBranch, Lock, AlertCircle} from 'lucide-react';
import {cn} from '../utils/cn';
import {useWebSocketConnection} from '../providers/connection.provider';
import {useGitHubToken} from './Settings';

interface ConnectRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
}

export const ConnectRepoModal: React.FC<ConnectRepoModalProps> = ({isOpen, onClose, agentId}) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [gitToken, setGitToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {cloneRepository} = useWebSocketConnection();
  const savedGitToken = useGitHubToken();

  // Pre-fill token from settings
  useEffect(() => {
    if (savedGitToken && !gitToken) {
      setGitToken(savedGitToken);
    }
  }, [savedGitToken, gitToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!repoUrl.trim()) {
      setError('Repository URL is required');
      return;
    }

    // Validate URL format
    try {
      new URL(repoUrl);
    } catch {
      setError('Please enter a valid repository URL');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await cloneRepository(agentId, repoUrl.trim(), gitToken.trim() || undefined);

      // Close modal on success
      setRepoUrl('');
      setGitToken(savedGitToken || '');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setRepoUrl('');
      setGitToken(savedGitToken || '');
      setError(null);
      onClose();
    }
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
            <GitBranch className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Connect Repository</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 hover:bg-accent rounded-md transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Repository URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Repository URL</label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository.git"
              disabled={isLoading}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the full Git repository URL (HTTPS format recommended)
            </p>
          </div>

          {/* Git Token */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <label className="text-sm font-medium">Git Token</label>
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </div>
            <textarea
              value={gitToken}
              onChange={(e) => setGitToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              disabled={isLoading}
              rows={3}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Personal access token for private repositories or to avoid rate limits
            </p>
            {savedGitToken && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Using token from settings</span>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !repoUrl.trim()}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
                isLoading || !repoUrl.trim()
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              <GitBranch className="h-4 w-4" />
              {isLoading ? 'Cloning...' : 'Clone Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
