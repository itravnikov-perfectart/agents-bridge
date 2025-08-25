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

interface ChatMessage {
  id: string
  agentId: string
  type: 'user' | 'agent' | 'loading' | 'partial'
  content: string
  timestamp: number
  status?: 'sending' | 'sent' | 'delivered' | 'error' | 'loading' | 'streaming'
}

interface AgentMaestroUIProps {
  agents: Agent[]
  tasks: Task[]
  chatMessages: ChatMessage[]
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
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
    grid-template-columns: 1fr 1fr 1fr;
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

  .chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chat-message {
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 80%;
    word-wrap: break-word;
  }

  .chat-message.user {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    margin-left: 20%;
    border-radius: 12px 12px 4px 12px;
  }

  .chat-message.user[data-agent-id="roocode"] {
    background-color: var(--vscode-textPreformat-background);
    color: var(--vscode-textPreformat-foreground);
    border-left: 3px solid var(--vscode-textLink-foreground);
  }

  .chat-message.agent {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    align-self: flex-start;
  }

  .chat-message-header {
    font-size: 0.75em;
    opacity: 0.7;
    margin-bottom: 4px;
  }

  .chat-message-content {
    margin-top: 8px;
    line-height: 1.4;
    word-wrap: break-word;
  }

  .chat-message-status {
    margin-top: 4px;
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .chat-input-form {
    margin-top: 16px;
    display: flex;
    gap: 8px;
  }

  .chat-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: inherit;
    resize: vertical;
    min-height: 60px;
  }

  .chat-send-button {
    padding: 8px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    align-self: flex-end;
  }

  .chat-send-button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .chat-send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-chat {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    text-align: center;
  }

  .json-response {
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
  }

  .json-header {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--vscode-titleBar-activeForeground);
  }

  .json-content pre {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    white-space: pre-wrap;
    word-wrap: break-word;
    background-color: var(--vscode-editor-background);
    padding: 4px;
    border-radius: 2px;
  }

  .question-answer-format {
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 8px;
    padding: 16px;
    margin-top: 8px;
  }

  .question-section {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .question-icon {
    font-size: 1.5em;
    color: var(--vscode-textLink-foreground);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .question-text {
    font-weight: 600;
    font-size: 1.1em;
    line-height: 1.4;
    color: var(--vscode-titleBar-activeForeground);
    flex: 1;
  }

  .suggestions-section {
    background-color: var(--vscode-editor-background);
    border-radius: 6px;
  }

  .suggestions-header {
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-titleBar-activeForeground);
    font-size: 0.95em;
  }

  .suggestions-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .suggestion-button {
    padding: 10px 14px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9em;
    text-align: left;
    line-height: 1.3;
    transition: all 0.2s ease;
    word-wrap: break-word;
    white-space: normal;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .suggestion-button:hover {
    background: var(--vscode-button-hoverBackground);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .suggestion-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .interactive-question {
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
  }

  .question-text {
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--vscode-titleBar-activeForeground);
  }

  .suggestions {
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
  }

  .suggestions-header {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--vscode-titleBar-activeForeground);
  }

  .suggestion-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .suggestion-button {
    padding: 4px 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
    text-align: left;
    white-space: nowrap;
  }

  .suggestion-button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .loading-message {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .loading-spinner {
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid var(--vscode-button-foreground);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .partial-message {
    display: flex;
    align-items: center;
    gap: 4px;
    font-style: italic;
    color: var(--vscode-descriptionForeground);
  }

  .partial-content {
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .partial-cursor {
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    from, to { color: transparent; }
    50% { color: var(--vscode-descriptionForeground); }
  }
`;

export const AgentMaestroUI = ({
  agents,
  tasks,
  chatMessages,
  setChatMessages,
  selectedAgent,
  onSelectAgent,
  onSendToRooCode,
  onCreateTask,
  wsConnected
}: AgentMaestroUIProps): JSX.Element => {
  const [message, setMessage] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [taskType, setTaskType] = useState('codeGeneration')
  const [taskPayload, setTaskPayload] = useState('')

  const selectedAgentData = selectedAgent ? agents.find(a => a && a.id === selectedAgent) : null
  const agentTasks = selectedAgent ? tasks.filter(t => t.agentId === selectedAgent) : []
  const agentChatMessages = selectedAgent ? chatMessages.filter(m => m.agentId === selectedAgent) : []

  // Filter out any undefined or invalid agents
  const validAgents = agents.filter(agent => agent && agent.id)
  
  // Debug logging to help understand the data
  console.log('Agents data:', { agents, validAgents, selectedAgent })

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

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent || !chatInput.trim()) return

    try {
      await onSendToRooCode(selectedAgent, chatInput)
      setChatInput('')
    } catch (error) {
      console.error('Failed to send chat message:', error)
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

  const handleSuggestionClick = async (answer: string) => {
    if (!selectedAgent) {
      console.error("No agent selected");
      return;
    }
    
    try {
      console.log("🎯 User clicked suggestion:", answer);
      
      // Add the selected suggestion as a user message to the chat
      const suggestionMessage: ChatMessage = {
        id: `suggestion-${Date.now()}-${answer.substring(0, 20).replace(/\s+/g, '-')}`,
        agentId: selectedAgent,
        type: "user",
        content: answer,
        timestamp: Date.now(),
        status: "sending",
      };
      
      // Add to chat immediately
      setChatMessages((prev) => [...prev, suggestionMessage]);
      
      // Send to RooCode
      await onSendToRooCode(selectedAgent, answer);
      
      // Update status to sent
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === suggestionMessage.id ? { ...msg, status: "sent" } : msg
        )
      );
      
      // Clear chat input
      setChatInput('');
      
      console.log("✅ Suggestion sent successfully");
    } catch (error) {
      console.error("❌ Failed to send suggestion:", error);
      
      // Update status to error
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.content === answer && msg.type === "user" ? { ...msg, status: "error" } : msg
        )
      );
    }
  };

  return (
    <div className="agent-maestro-ui">
      <style>{styles}</style>
      
      <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
        WebSocket: {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <div className="main-content">
        <div className="panel">
          <h2>Connected Agents ({validAgents.length})</h2>
          <div className="agent-list">
            {validAgents.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                No agents connected
              </div>
            ) : (
              validAgents.map(agent => (
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
                    <div>Connected: {agent.connectedAt ? formatTime(agent.connectedAt) : 'Unknown'}</div>
                    <div>Last heartbeat: {agent.lastHeartbeat ? getTimeSince(agent.lastHeartbeat) : 'Unknown'}</div>
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
          <h2>Chat with Agent</h2>
          {!selectedAgent ? (
            <div className="empty-chat">
              Select an agent to start chatting
            </div>
          ) : (
            <div className="chat-panel">
              <div className="chat-messages">
                {agentChatMessages.length === 0 ? (
                  <div className="empty-chat">
                    No messages yet. Start a conversation!
                  </div>
                ) : (
                  agentChatMessages.map(msg => (
                    <div key={msg.id} className={`chat-message ${msg.type}`} data-agent-id={msg.agentId}>
                      <div className="chat-message-header">
                        {msg.type === 'user' ? (
                          msg.agentId === 'roocode' ? '💬 RooCode User' : 'You'
                        ) : msg.type === 'loading' ? '🤔 Agent thinking...' : msg.type === 'partial' ? '📝 Agent typing...' : `Agent ${msg.agentId}`} • {formatTime(msg.timestamp)}
                      </div>
                      <div className="chat-message-content">
                        {msg.type === 'loading' ? (
                          <div className="loading-message">
                            <div className="loading-spinner"></div>
                          </div>
                        ) : msg.type === 'partial' ? (
                          <div className="partial-message">
                            <span className="partial-content">{msg.content}</span>
                            <span className="partial-cursor">▋</span>
                          </div>
                        ) : msg.type === 'agent' && msg.content.startsWith('{') ? (
                          // Handle JSON responses with better formatting
                          (() => {
                            try {
                              const parsed = JSON.parse(msg.content);
                              
                              // Check if it's a Question-Answer format
                              if (parsed.question && parsed.suggest && Array.isArray(parsed.suggest)) {
                                return (
                                  <div className="question-answer-format">
                                    <div className="question-section">
                                      <div className="question-icon">❓</div>
                                      <div className="question-text">{parsed.question}</div>
                                    </div>
                                    <div className="suggestions-section">
                                      <div className="suggestions-header">Choose an option:</div>
                                      <div className="suggestions-grid">
                                        {parsed.suggest.map((suggestion: any, index: number) => (
                                          <button
                                            key={index}
                                            className="suggestion-button"
                                            onClick={() => handleSuggestionClick(suggestion.answer)}
                                            title={suggestion.answer}
                                          >
                                            {suggestion.answer}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              
                              // Check if it's a regular JSON response
                              if (parsed.request || parsed.apiProtocol) {
                                return (
                                  <div className="json-response">
                                    <div className="json-header">API Request:</div>
                                    <pre className="json-content">{JSON.stringify(parsed, null, 2)}</pre>
                                  </div>
                                );
                              }
                              
                              // Fallback to generic JSON display
                              return (
                                <div className="json-response">
                                  <div className="json-header">JSON Response:</div>
                                  <pre className="json-content">{JSON.stringify(parsed, null, 2)}</pre>
                                </div>
                              );
                            } catch (e) {
                              // If not valid JSON, fall back to regular display
                              return msg.content;
                            }
                          })()
                        ) : (
                          // Regular message content
                          msg.content
                        )}
                      </div>
                      {msg.status && (
                        <div className="chat-message-status">{msg.status}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChatMessage} className="chat-input-form">
                <textarea
                  className="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChatMessage(e)
                    }
                  }}
                />
                <button 
                  type="submit" 
                  className="chat-send-button"
                  disabled={!chatInput.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          )}
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