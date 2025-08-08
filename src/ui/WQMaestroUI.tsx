import * as React from 'react';
import { ProcessStatus } from '../server/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
      
      <div className="process-form">
        <h3>Start New Process</h3>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          try {
            const options: ProcessOptions = {
              command: (form.elements.namedItem('command') as HTMLInputElement).value,
              args: (form.elements.namedItem('args') as HTMLInputElement).value?.split(' ').filter(Boolean),
              env: (form.elements.namedItem('env') as HTMLTextAreaElement).value
                ? JSON.parse((form.elements.namedItem('env') as HTMLTextAreaElement).value)
                : undefined,
              cwd: (form.elements.namedItem('cwd') as HTMLInputElement).value || undefined,
              image: (form.elements.namedItem('image') as HTMLInputElement).value || undefined
            };

            await onStartProcess(options);
            form.reset();
          } catch (error) {
            console.error('Failed to start process:', error);
            alert('Failed to start process. Please check your inputs.');
          }
        }}>
          <div>
            <label>Command:</label>
            <input name="command" required />
          </div>
          <div>
            <label>Arguments:</label>
            <input name="args" placeholder="arg1 arg2" />
          </div>
          <div>
            <label>Environment (JSON):</label>
            <textarea name="env" placeholder='{"KEY":"value"}' />
          </div>
          <div>
            <label>Working Directory:</label>
            <input name="cwd" />
          </div>
          <div>
            <label>Docker Image (optional):</label>
            <input name="image" />
          </div>
          <button type="submit">Start Process</button>
        </form>
      </div>

      <div className="metrics-chart">
        <h3>System Metrics</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={processes.filter(p => p.cpuUsage && p.memoryUsage)}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cpuUsage"
              name="CPU Usage %"
              stroke="#8884d8"
              activeDot={{ r: 8 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="memoryUsage"
              name="Memory Usage MB"
              stroke="#82ca9d"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

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