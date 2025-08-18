import { ProcessStatus } from '../server/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const styles = `
  .agent-maestro-ui {
    font-family: var(--vscode-font-family);
    padding: 0;
    color: var(--vscode-foreground);
  }
  
  h2 {
    font-size: 1.2em;
    font-weight: 600;
    margin: 16px 0 8px 0;
    color: var(--vscode-titleBar-activeForeground);
  }
  
  h3 {
    font-size: 1em;
    font-weight: 600;
    margin: 12px 0 6px 0;
    color: var(--vscode-foreground);
  }
  
  .output-section {
    margin: 8px 0;
  }
  
  .output-section pre {
    white-space: pre-wrap;
    background: transparent;
    padding: 0;
    margin: 4px 0;
    font-size: 0.9em;
  }
  
  .process-form {
    margin: 12px 0;
  }
  
  .process-form label {
    display: block;
    margin: 8px 0 2px 0;
    font-size: 0.9em;
  }
  
  .process-form input,
  .process-form textarea {
    width: 100%;
    padding: 4px;
    margin-bottom: 8px;
    font-size: 0.9em;
  }
  
  .process-form textarea {
    min-height: 60px;
  }
  
  button {
    margin: 4px 4px 4px 0;
    padding: 4px 12px;
    font-size: 0.9em;
  }
  
  .process-list {
    margin: 8px 0;
  }
  
  .process-item {
    margin: 8px 0;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  }
  
  .process-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  
  .process-id {
    font-size: 0.9em;
    font-weight: 600;
  }
  
  .status-badge {
    font-size: 0.8em;
    padding: 2px 6px;
  }
  
  .process-details {
    font-size: 0.85em;
    margin: 4px 0;
  }
  
  .metrics-chart {
    margin: 12px 0;
  }
`;

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
  onStartAgent: (port: number, image: string) => Promise<void>;
  onSendToRoo: (message: string) => Promise<string>;
  executionOutput: string;
}

export const WQMaestroUI = ({
  processes,
  onStartProcess,
  onStopProcess,
  onStartAgent,
  onSendToRoo,
  executionOutput
}: WQMaestroUIProps): JSX.Element => {
  return (
    <div className="agent-maestro-ui">
      <style>{styles}</style>
      <h2>WQ Maestro Processes</h2>
      
      <div className="output-section">
        <h3>Execution Output</h3>
        <pre>{executionOutput}</pre>
      </div>

      <div className="process-form">
        <h3>Send Message to RooCode</h3>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          const message = (form.elements.namedItem('rooMessage') as HTMLInputElement).value;
          if (message) {
            try {
              await onSendToRoo(message);
              form.reset();
            } catch (error) {
              console.error('Failed to send message:', error);
            }
          }
        }}>
          <div>
            <label>Message:</label>
            <input name="rooMessage" required />
          </div>
          <button type="submit">Send</button>
        </form>
      </div>

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
        
        <h3>Start New Agent</h3>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          try {
            await onStartAgent(
              parseInt((form.elements.namedItem('agentPort') as HTMLInputElement).value),
              (form.elements.namedItem('agentImage') as HTMLInputElement).value
            );
            form.reset();
          } catch (error) {
            console.error('Failed to start agent:', error);
            alert('Failed to start agent. Please check your inputs.');
          }
        }}>
          <div>
            <label>Agent Port:</label>
            <input name="agentPort" type="number" required />
          </div>
          <div>
            <label>Docker Image:</label>
            <input name="agentImage" required />
          </div>
          <button type="submit">Start Agent</button>
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