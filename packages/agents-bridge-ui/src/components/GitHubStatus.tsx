import React from 'react';
import { Github, CheckCircle, AlertCircle } from 'lucide-react';
import { useGitHubToken } from './Settings';

export const GitHubStatus: React.FC = () => {
  const githubToken = useGitHubToken();

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-md">
      <Github className="h-4 w-4 text-muted-foreground" />
      
      {githubToken ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-600">GitHub connected</span>
          <span className="text-xs text-muted-foreground">
            Token: {githubToken.slice(0, 8)}...
          </span>
        </>
      ) : (
        <>
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <span className="text-sm text-yellow-600">GitHub not configured</span>
          <span className="text-xs text-muted-foreground">
            Add token in settings
          </span>
        </>
      )}
    </div>
  );
};
