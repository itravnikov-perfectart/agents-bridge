import React, { useState } from 'react';

interface Agent {
  id: string
  status: 'connected' | 'disconnected' | 'timeout'
  lastHeartbeat: number
  connectedAt: number
  metadata?: Record<string, any>
  gracePeriod?: boolean
}

interface Task {
  id: string
  agentId: string
  type: string
  payload: any
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  createdAt: number
  completedAt?: number
  result?: any
  error?: string
}

interface AgentMaestroUIProps {
  agents: Agent[]
  tasks: Task[]
  selectedAgent: string | null
  onSelectAgent: (agentId: string | null) => void
  onSendToRooCode: (agentId: string, message: string) => Promise<void>
  onCreateTask: (agentId: string, taskType: string, payload: any) => Promise<Task>
  wsConnected: boolean
}

const styles = `
  .agent-maestro-ui {
    font-family: var(--vscode-font-family);
    padding: 16px;
    color: var(--vscode-foreground);
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .connection-status {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 0.9em;
    font-weight: 500;
  }
  
  .connection-status.connected {
    background: var(--vscode-testing-iconPassed);
    color: var(--vscode-testing-iconPassed);
    background: rgba(var(--vscode-testing-iconPassed), 0.1);
  }
  
  .connection-status.disconnected {
    background: var(--vscode-testing-iconFailed);
    color: var(--vscode-testing-iconFailed);
    background: rgba(var(--vscode-testing-iconFailed), 0.1);
  }
  
  .main-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    flex: 1;
    overflow: hidden;
  }
  
  .panel {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 16px;
    overflow: auto;
  }
  
  .panel h2 {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: var(--vscode-titleBar-activeForeground);
  }
  
  .agent-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .agent-item {
    padding: 12px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .agent-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  
  .agent-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    border-color: var(--vscode-focusBorder);
  }
  
  .agent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .agent-id {
    font-weight: 600;
    font-size: 0.9em;
    font-family: var(--vscode-editor-font-family);
  }
  
  .status-indicator {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: 500;
  }
  
  .status-indicator.connected {
    background: rgba(0, 255, 0, 0.2);
    color: #00ff00;
  }
  
  .status-indicator.disconnected {
    background: rgba(255, 0, 0, 0.2);
    color: #ff0000;
  }
  
  .status-indicator.timeout {
    background: rgba(255, 165, 0, 0.2);
    color: #ffa500;
  }
  
  .agent-details {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  
  .agent-meta {
    margin-top: 8px;
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
  }
  
  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .message-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .message-form input,
  .message-form textarea {
    padding: 8px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    font-size: 0.9em;
  }
  
  .message-form textarea {
    min-height: 80px;
    resize: vertical;
  }
  
  button {
    padding: 8px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
  }
  
  button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .task-item {
    padding: 12px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    background: var(--vscode-editor-background);
  }
  
  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .task-id {
    font-weight: 600;
    font-size: 0.85em;
    font-family: var(--vscode-editor-font-family);
  }
  
  .task-status {
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 0.75em;
    font-weight: 500;
  }
  
  .task-status.pending {
    background: rgba(255, 165, 0, 0.2);
    color: #ffa500;
  }
  
  .task-status.in_progress {
    background: rgba(0, 123, 255, 0.2);
    color: #007bff;
  }
  
  .task-status.completed {
    background: rgba(0, 255, 0, 0.2);
    color: #00ff00;
  }
  
  .task-status.failed {
    background: rgba(255, 0, 0, 0.2);
    color: #ff0000;
  }
  
  .task-details {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
  }
  
  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }
  
  .quick-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .quick-actions button {
    padding: 6px 12px;
    font-size: 0.8em;
  }
`;

export const AgentMaestroUI = ({
  agents,
  tasks,
  selectedAgent,
  onSelectAgent,
  onSendToRooCode,
  onCreateTask,
  wsConnected
}: AgentMaestroUIProps): JSX.Element => {
  const [message, setMessage] = useState('')
  const [taskType, setTaskType] = useState('codeGeneration')
  const [taskPayload, setTaskPayload] = useState('')

  const selectedAgentData = agents.find(a => a.id === selectedAgent)
  const agentTasks = tasks.filter(t => t.agentId === selectedAgent)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent || !message.trim()) return

    try {
      await onSendToRooCode(selectedAgent, message)
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent || !taskType) return

    try {
      let payload: any = taskPayload
      try {
        payload = JSON.parse(taskPayload)
      } catch {
        // Keep as string if not valid JSON
      }

      await onCreateTask(selectedAgent, taskType, payload)
      setTaskPayload('')
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getTimeSince = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="agent-maestro-ui">
      <style>{styles}</style>
      
      <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
        WebSocket: {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <div className="main-content">
        <div className="panel">
          <h2>Connected Agents ({agents.length})</h2>
          <div className="agent-list">
            {agents.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                No agents connected
              </div>
            ) : (
              agents.map(agent => (
                <div
                  key={agent.id}
                  className={`agent-item ${selectedAgent === agent.id ? 'selected' : ''}`}
                  onClick={() => onSelectAgent(agent.id)}
                >
                  <div className="agent-header">
                    <div className="agent-id">{agent.id}</div>
                    <div className={`status-indicator ${agent.status}`}>
                      {agent.status}
                    </div>
                  </div>
                  <div className="agent-details">
                    <div>Connected: {formatTime(agent.connectedAt)}</div>
                    <div>Last heartbeat: {getTimeSince(agent.lastHeartbeat)}</div>
                    {agent.gracePeriod && <div>Grace period: Active</div>}
                  </div>
                  {agent.metadata && (
                    <div className="agent-meta">
                      {Object.entries(agent.metadata).map(([key, value]) => (
                        <div key={key}>{key}: {JSON.stringify(value)}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Agent Control</h2>
          {!selectedAgent ? (
            <div className="no-selection">
              Select an agent to send messages and manage tasks
            </div>
          ) : (
            <div className="control-panel">
              <div>
                <h3>Selected Agent: {selectedAgentData?.id}</h3>
                <div className="quick-actions">
                  <button onClick={() => onSendToRooCode(selectedAgent, 'ping')}>
                    Ping
                  </button>
                  <button onClick={() => onSendToRooCode(selectedAgent, 'status')}>
                    Get Status
                  </button>
                  <button onClick={() => onCreateTask(selectedAgent, 'health_check', {})}>
                    Health Check
                  </button>
                </div>
              </div>

              <div>
                <h3>Send Message to RooCode</h3>
                <form onSubmit={handleSendMessage} className="message-form">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter message for RooCode..."
                    required
                  />
                  <button type="submit" disabled={!message.trim()}>
                    Send Message
                  </button>
                </form>
              </div>

              <div>
                <h3>Create Task</h3>
                <form onSubmit={handleCreateTask} className="message-form">
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    style={{
                      padding: '8px',
                      border: '1px solid var(--vscode-input-border)',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="codeGeneration">Code Generation</option>
                    <option value="codeReview">Code Review</option>
                    <option value="testing">Testing</option>
                    <option value="refactoring">Refactoring</option>
                    <option value="documentation">Documentation</option>
                    <option value="analysis">Code Analysis</option>
                  </select>
                  <textarea
                    value={taskPayload}
                    onChange={(e) => setTaskPayload(e.target.value)}
                    placeholder="Task payload (JSON or text)..."
                  />
                  <button type="submit">
                    Create Task
                  </button>
                </form>
              </div>

              <div>
                <h3>Agent Tasks ({agentTasks.length})</h3>
                <div className="task-list">
                  {agentTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                      No tasks for this agent
                    </div>
                  ) : (
                    agentTasks.map(task => (
                      <div key={task.id} className="task-item">
                        <div className="task-header">
                          <div className="task-id">{task.id}</div>
                          <div className={`task-status ${task.status}`}>
                            {task.status}
                          </div>
                        </div>
                        <div className="task-details">
                          <div>Type: {task.type}</div>
                          <div>Created: {formatTime(task.createdAt)}</div>
                          {task.completedAt && (
                            <div>Completed: {formatTime(task.completedAt)}</div>
                          )}
                          {task.error && (
                            <div style={{ color: 'var(--vscode-errorForeground)' }}>
                              Error: {task.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}