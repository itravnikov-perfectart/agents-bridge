import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  EConnectionType,
  EMessageFromServer,
  EMessageFromUI,
  EMessageToServer,
} from "../server/message.enum";
import { IMessageFromServer, IMessageFromUI } from "../server/types";
import { AgentMaestroUI } from "./WQMaestroUI";

// Types for our new agent-focused UI
interface Agent {
  id: string;
  status: "connected" | "disconnected" | "timeout";
  lastHeartbeat: number;
  connectedAt: number;
  metadata?: Record<string, any>;
  gracePeriod?: boolean;
}

interface Task {
  id: string;
  agentId: string;
  type: string;
  payload: any;
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
}

interface ChatMessage {
  id: string;
  agentId: string;
  type: "user" | "agent" | "loading" | "partial";
  content: string;
  timestamp: number;
  status?: "sending" | "sent" | "delivered" | "error" | "loading" | "streaming";
}

declare global {
  interface Window {
    agentMaestro: {
      controllers: Array<{ id: string; workspace: string }>;
      activeControllerId: string;
      onActivate: (id: string) => void;
      onRemove: (id: string) => void;
      onSendMessage: (message: string) => void;
    };
  }
}

const App = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Generate unique UI client ID
  const uiClientId = React.useMemo(() => `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);
  
  // Load chat messages from localStorage on startup
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('agent-chat-messages');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load chat messages from localStorage:', error);
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);
  
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = React.useRef<string>(`conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const hasConnectedRef = React.useRef(false);

  // Save chat messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('agent-chat-messages', JSON.stringify(chatMessages));
      console.log('💾 Saved chat messages to localStorage:', chatMessages.length);
    } catch (error) {
      console.warn('Failed to save chat messages to localStorage:', error);
    }
  }, [chatMessages]);

  // WebSocket connection function - defined outside useEffect to prevent recreation
  const connectWebSocket = React.useCallback(() => {
    console.log(`🔗 connectWebSocket CALLED - Connection ID: ${connectionIdRef.current}`, {
      timestamp: new Date().toISOString(),
      wsConnected,
      isConnecting,
      wsState: ws?.readyState,
      hasConnected: hasConnectedRef.current
    });
    
    // Prevent multiple simultaneous connection attempts
    if (hasConnectedRef.current) {
      console.log(`🔒 Connection already established for ID: ${connectionIdRef.current}, blocking duplicate attempt`);
      return;
    }
    
    if (wsConnected || isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
      console.log("🔒 Connection attempt blocked - already connected or connecting", {
        wsConnected,
        isConnecting,
        wsState: ws?.readyState,
        connectionAttempts,
        connectionId: connectionIdRef.current
      });
      return;
    }
    
    // Track connection attempts
    setConnectionAttempts(prev => prev + 1);
    console.log(`🔗 Connection attempt #${connectionAttempts + 1} for ID: ${connectionIdRef.current}`);
    
    // Close any existing connection first
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      console.log("🔌 Closing existing WebSocket connection before creating new one");
      ws.close();
      setWs(null);
    }
    
    setIsConnecting(true);
    console.log("🔗 Creating new WebSocket connection...");
    
    const websocket = new WebSocket("ws://localhost:8080");

    websocket.onopen = () => {
      console.log(`🔗 WebSocket connection opened for ID: ${connectionIdRef.current}`);
      hasConnectedRef.current = true; // Mark as connected
      setWsConnected(true);
      setLoading(false);
      setIsConnecting(false);
      setWs(websocket); // Set the WebSocket instance

      // First identify as UI client
      const identifyMessage: IMessageFromUI = {
        messageType: EMessageToServer.Register,
        connectionType: EConnectionType.UI,
        details: {
          uiClientId,
        },
      };
      console.log("📝 Sending UI registration message:", identifyMessage);
      if (websocket) {
        websocket.send(JSON.stringify(identifyMessage));
      }
      
      // Don't request agents yet - wait for registration confirmation
      console.log("📝 Sent UI registration message, waiting for confirmation...");
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as IMessageFromServer;
        console.log("🔔 UI received WebSocket message:", message);

        switch (message.messageType) {
          case EMessageFromServer.AgentList:
            const agentList = message.details?.agents || [];
            console.log("📋 Received agent list:", agentList);
            // Ensure all agents have valid IDs before setting state
            const validAgents = agentList.filter((agent: any) => agent && agent.id);
            console.log("✅ Filtered valid agents:", validAgents);
            setAgents(validAgents);
            break;
            
          case EMessageFromServer.AgentUpdate:
            console.log("🔄 Received agent update:", message.details);
            const updatedAgentList = message.details?.agents || [];
            const validUpdatedAgents = updatedAgentList.filter((agent: any) => agent && agent.id);
            console.log("✅ Updated agent list:", validUpdatedAgents);
            setAgents(validUpdatedAgents);
            break;
            
          case EMessageFromServer.Registered:
            // This is just confirming UI client connection, not adding an agent
            console.log("UI client registration confirmed");
            
            // Now request the agent list since we're properly registered
            const messageToSend: IMessageFromUI = {
              messageType: EMessageFromUI.GetAgents,
              connectionType: EConnectionType.UI,
            };
            console.log("📋 Requesting agent list after registration confirmation...");
            if (websocket) {
              websocket.send(JSON.stringify(messageToSend));
            }
            break;
          case EMessageFromServer.Unregistered:
            setAgents((prev) =>
              prev.map((a) =>
                a.id === message.details?.agentId
                  ? { ...a, status: "disconnected" }
                  : a,
              ),
            );
            break;
          case EMessageFromServer.TaskAssigned:
            setTasks((prev) => {
              const newTask = message.details as Task;
              return [
                ...prev.filter((t) => t.id !== newTask.id),
                newTask,
              ];
            });
            break;
          case EMessageFromServer.RooCodeResponse:
            console.log("🤖 UI received RooCode response:", message.details);
            
            // Remove loading message since we got a response
            if (loadingMessageId) {
              setChatMessages((prev) => prev.filter(msg => msg.id !== loadingMessageId));
              setLoadingMessageId(null);
              setIsLoading(false);
            }
            
            // Create a unique message ID based on content and timestamp to prevent duplicates
            const messageContent = message.details?.response || "No response";
            const messageTimestamp = message.timestamp || Date.now();
            const messageId = `agent-${messageTimestamp}-${messageContent.substring(0, 50).replace(/\s+/g, '-')}`;
            
            // Check if this is an API request message (contains technical details we want to hide)
            const isApiRequestMessage = messageContent.includes('"apiProtocol"') || 
                                      messageContent.includes('"tokensIn"') || 
                                      messageContent.includes('"tokensOut"') || 
                                      messageContent.includes('"cost"') ||
                                      messageContent.includes('"cacheWrites"') ||
                                      messageContent.includes('"cacheReads"') ||
                                      messageContent.includes('<environment_details>') ||
                                      messageContent.includes('<task>') ||
                                      messageContent.includes('Current time in ISO 8601 UTC format');
            
            if (isApiRequestMessage) {
              console.log("🔒 Filtering out API request message (contains technical details)");
              return; // Don't add this message to chat
            }
            
            // Check if this message already exists to prevent duplicates
            setChatMessages((prev) => {
              const messageExists = prev.some(msg => 
                msg.type === 'agent' &&
                msg.content === messageContent && 
                Math.abs(msg.timestamp - messageTimestamp) < 1000 // Within 1 second
              );
              
              if (messageExists) {
                console.log("💬 Agent message already exists in chat, skipping duplicate");
                return prev;
              }
              
              // Check if this is an echo response (agent repeating user's message)
              const isEchoResponse = prev.some(msg => {
                if (msg.type !== 'user') return false;
                
                // Only check recent messages (within 10 seconds)
                if (Math.abs(msg.timestamp - messageTimestamp) > 10000) return false;
                
                const userContent = msg.content.toLowerCase().trim();
                const agentContent = messageContent.toLowerCase().trim();
                
                // Exact match
                if (userContent === agentContent) return true;
                
                // Check if agent content contains user content (with some tolerance)
                if (agentContent.includes(userContent) && userContent.length > 10) return true;
                
                // Check if user content contains agent content (with some tolerance)
                if (userContent.includes(agentContent) && agentContent.length > 10) return true;
                
                // Check for high similarity (e.g., slight modifications)
                const similarity = calculateSimilarity(userContent, agentContent);
                if (similarity > 0.8) return true; // 80% similarity threshold
                
                return false;
              });
              
              if (isEchoResponse) {
                console.log("🔄 Detected echo response, skipping:", messageContent);
                return prev;
              }
              
              // Add agent response to chat
              const agentMessage: ChatMessage = {
                id: messageId,
                agentId: message.details?.agentId || "unknown",
                type: "agent",
                content: messageContent,
                timestamp: messageTimestamp,
                status: "delivered",
              };
              
              console.log("💬 Adding new agent message to chat:", agentMessage);
              const updated = [...prev, agentMessage];
              console.log("📝 Updated chat messages:", updated);
              return updated;
            });
            break;
            
          case EMessageFromServer.RooCodeMessage:
            console.log("💬 UI received RooCode message (user started chat):", message.details);
            
            // This is a message that a user sent directly through RooCode
            const rooCodeMessageContent = message.details?.message || "No message content";
            const rooCodeMessageTimestamp = message.timestamp || Date.now();
            const rooCodeMessageId = `roocode-${rooCodeMessageTimestamp}-${rooCodeMessageContent.substring(0, 50).replace(/\s+/g, '-')}`;
            
            // Add the RooCode message to chat as a user message
            setChatMessages((prev) => {
              // Check if this message already exists to prevent duplicates
              const messageExists = prev.some(msg => 
                msg.type === 'user' &&
                msg.content === rooCodeMessageContent && 
                Math.abs(msg.timestamp - rooCodeMessageTimestamp) < 1000 // Within 1 second
              );
              
              if (messageExists) {
                console.log("💬 RooCode message already exists in chat, skipping duplicate");
                return prev;
              }
              
              // Add RooCode message to chat
              const rooCodeMessage: ChatMessage = {
                id: rooCodeMessageId,
                agentId: message.details?.agentId || "roocode",
                type: "user",
                content: rooCodeMessageContent,
                timestamp: rooCodeMessageTimestamp,
                status: "delivered",
              };
              
              console.log("💬 Adding RooCode message to chat:", rooCodeMessage);
              return [...prev, rooCodeMessage];
            });
            break;
            
          case EMessageFromServer.RooCodePartial:
            console.log("📝 UI received RooCode partial response:", message.details);
            
            // Remove loading message since we're getting partial responses
            if (loadingMessageId) {
              setChatMessages((prev) => prev.filter(msg => msg.id !== loadingMessageId));
              setLoadingMessageId(null);
              setIsLoading(false);
            }
            
            const partialContent = message.details?.response || "";
            const partialTimestamp = message.timestamp || Date.now();
            const partialMessageId = `partial-${partialTimestamp}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Check if this is an API request message (contains technical details we want to hide)
            const isPartialApiRequestMessage = partialContent.includes('"apiProtocol"') || 
                                             partialContent.includes('"tokensIn"') || 
                                             partialContent.includes('"tokensOut"') || 
                                             partialContent.includes('"cost"') ||
                                             partialContent.includes('"cacheWrites"') ||
                                             partialContent.includes('"cacheReads"') ||
                                             partialContent.includes('<environment_details>') ||
                                             partialContent.includes('<task>') ||
                                             partialContent.includes('Current time in ISO 8601 UTC format');
            
            if (isPartialApiRequestMessage) {
              console.log("🔒 Filtering out partial API request message (contains technical details)");
              return; // Don't add this message to chat
            }
            
            // Check if we already have a partial message for this response
            setChatMessages((prev) => {
              const existingPartial = prev.find(msg => 
                msg.type === 'partial' && 
                msg.agentId === message.details?.agentId &&
                Math.abs(msg.timestamp - partialTimestamp) < 5000 // Within 5 seconds
              );
              
              if (existingPartial) {
                // Update existing partial message
                return prev.map(msg => 
                  msg.id === existingPartial.id 
                    ? { ...msg, content: partialContent, timestamp: partialTimestamp }
                    : msg
                );
              } else {
                // Create new partial message
                const partialMessage: ChatMessage = {
                  id: partialMessageId,
                  agentId: message.details?.agentId || "unknown",
                  type: "partial",
                  content: partialContent,
                  timestamp: partialTimestamp,
                  status: "streaming",
                };
                
                console.log("📝 Adding new partial message:", partialMessage);
                return [...prev, partialMessage];
              }
            });
            break;
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    websocket.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setWsConnected(false);
      setLoading(false);
      setIsConnecting(false);
      setWs(null);
    };

    websocket.onclose = (event) => {
      console.log("🔌 WebSocket connection closed:", event.code, event.reason);
      setWsConnected(false);
      setLoading(false);
      setIsConnecting(false);
      setWs(null);
      
      // Clear any existing reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Only attempt to reconnect if this wasn't a manual close and we're not already connecting
      if (event.code !== 1000 && !isConnecting) { // 1000 = normal closure
        console.log("🔄 Connection closed unexpectedly, scheduling reconnection in 3 seconds...");
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Attempting to reconnect...");
          // Double-check we're still not connected before reconnecting
          if (!wsConnected && !isConnecting) {
            connectWebSocket();
          } else {
            console.log("🔒 Already connected or connecting, skipping reconnection");
          }
        }, 3000);
      } else {
        console.log("🔒 Connection closed normally or already reconnecting, no reconnection needed");
      }
    };

    setWs(websocket);
  }, []); // Empty dependency array to prevent infinite loops

  // Connect to WebSocket server
  useEffect(() => {
    console.log(`🚀 useEffect RUNNING - Connection ID: ${connectionIdRef.current}`, {
      timestamp: new Date().toISOString(),
      wsConnected,
      isConnecting,
      wsState: ws?.readyState,
      connectionAttempts,
      hasConnected: hasConnectedRef.current,
      componentRender: Date.now()
    });
    
    // Prevent multiple connections if already connected
    if (hasConnectedRef.current) {
      console.log(`🔒 Already connected with ID: ${connectionIdRef.current}, skipping connection setup`);
      return;
    }
    
    if (wsConnected || isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
      console.log(`🔒 WebSocket already connected or connecting, skipping initial connection`, {
        wsConnected,
        isConnecting,
        wsState: ws?.readyState,
        connectionId: connectionIdRef.current
      });
      return;
    }
    
    let reconnectTimeout: NodeJS.Timeout;
    
    // Initial connection - only once on mount
    console.log(`🔗 Calling connectWebSocket for connection ID: ${connectionIdRef.current}`);
    connectWebSocket();
    
    // Log connection attempt
    console.log("🚀 Initial WebSocket connection attempt initiated", {
      connectionId: connectionIdRef.current,
      wsConnected,
      isConnecting,
      wsState: ws?.readyState,
      connectionAttempts,
      timestamp: new Date().toISOString()
    });
    
    // Cleanup function
    return () => {
      console.log(`🧹 Cleaning up WebSocket connection for ID: ${connectionIdRef.current}`);
      setIsConnecting(false);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (ws) {
        ws.close();
        setWs(null);
      }
      
      setWsConnected(false);
      setLoading(false);
    };
  }, [connectWebSocket]); // Add connectWebSocket to dependencies

  const sendMessage = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.error("WebSocket not connected");
    }
  };

  // Calculate similarity between two strings (simple implementation)
  const calculateSimilarity = (str1: string, str2: string): number => {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Simple word-based similarity
    const words1 = str1.split(/\s+/).filter(w => w.length > 0);
    const words2 = str2.split(/\s+/).filter(w => w.length > 0);
    
    if (words1.length === 0 || words2.length === 0) return 0.0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  };

  const sendToRooCode = async (agentId: string, message: string) => {
    if (!selectedAgent) {
      console.error("No agent selected");
      return;
    }

    // Create a unique message ID for this request
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: userMessageId,
      agentId: selectedAgent,
      type: "user",
      content: message,
      timestamp: Date.now(),
      status: "sent",
    };

    setChatMessages((prev) => {
      // Check if this message already exists to prevent duplicates
      const messageExists = prev.some(msg => 
        msg.type === 'user' &&
        msg.content === message && 
        Math.abs(msg.timestamp - Date.now()) < 1000 // Within 1 second
      );
      
      if (messageExists) {
        console.log("💬 User message already exists in chat, skipping duplicate");
        return prev;
      }
      
      console.log("💬 Adding new user message to chat:", userMessage);
      return [...prev, userMessage];
    });

    // Add loading message to show we're waiting for response
    const loadingMessageId = `loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      agentId: selectedAgent,
      type: "loading",
      content: "", // Empty content since we show "🤔 Agent thinking..." in header
      timestamp: Date.now(),
      status: "loading",
    };

    setChatMessages((prev) => [...prev, loadingMessage]);
    setLoadingMessageId(loadingMessageId);
    setIsLoading(true);

    // Set a timeout to remove loading message if no response received
    const loadingTimeout = setTimeout(() => {
      if (loadingMessageId) {
        console.log("⏰ Loading timeout reached, removing loading message");
        setChatMessages((prev) => prev.filter(msg => msg.id !== loadingMessageId));
        setLoadingMessageId(null);
        setIsLoading(false);
      }
    }, 30000); // 30 seconds timeout

    // Send message to server
    const messageToSend: IMessageFromUI = {
      messageType: EMessageFromUI.SendToRooCode,
      connectionType: EConnectionType.UI,
      details: {
        agentId: selectedAgent,
        message: message,
      },
    };

    console.log("📤 Sending message to RooCode:", messageToSend);
    sendMessage(messageToSend);
  };

  const createTask = async (
    agentId: string,
    taskType: string,
    payload: any,
  ) => {
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      type: taskType,
      payload,
      status: "pending",
      createdAt: Date.now(),
    };

    setTasks((prev) => [...prev, task]);

    const messageToSend: IMessageFromUI = {
      messageType: EMessageFromUI.CreateTask,
      connectionType: EConnectionType.UI,
      details: {
        task,
      },
    };
    sendMessage(messageToSend);

    return task;
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", fontFamily: "var(--vscode-font-family)" }}>
        <div>Connecting to WebSocket server...</div>
      </div>
    );
  }

  return (
    <AgentMaestroUI
      agents={agents}
      tasks={tasks}
      chatMessages={chatMessages}
      setChatMessages={setChatMessages}
      selectedAgent={selectedAgent}
      onSelectAgent={setSelectedAgent}
      onSendToRooCode={sendToRooCode}
      onCreateTask={createTask}
      wsConnected={wsConnected}
    />
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
