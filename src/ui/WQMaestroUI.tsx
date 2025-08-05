import * as React from 'react';
import { ProcessStatus } from '../server/types';

interface ProcessOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  image?: string;
  ports?: number[];
}

interface WQMaestroUIProps {
  processes: ProcessStatus[];
  onStartProcess: (options: ProcessOptions) => Promise<void>;
  onStopProcess: (processId: string) => Promise<void>;
}

export const WQMaestroUI = ({
  processes,
  onStartProcess,
  onStopProcess
}: WQMaestroUIProps): JSX.Element => {
  return (
    <div className="wq-maestro-ui">
      <h2>WQ Maestro Processes</h2>
      <div className="process-list">
        {processes.map(process => (
          <div key={process.jobId || process.containerId} className="process-item">
            <div className="process-header">
              <span className="process-id">{process.jobId || process.containerId}</span>
              <span className={`status-badge ${process.status}`}>
                {process.status}
              </span>
            </div>
            <div className="process-details">
              <div>Command: {process.command}</div>
              {process.image && <div>Image: {process.image}</div>}
              {process.startTime && (
                <div>Runtime: {Math.floor((Date.now() - process.startTime) / 1000)}s</div>
              )}
            </div>
            <button 
              onClick={() => process.jobId && onStopProcess(process.jobId)}
              disabled={process.status !== 'running'}
            >
              Stop
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};