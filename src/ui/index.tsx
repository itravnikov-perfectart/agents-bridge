import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  EConnectionType,
  EMessageFromServer,
  EMessageFromUI,
} from "../server/message.enum";
import { IMessageFromServer, IMessageFromUI } from "../server/types";
import { AgentMaestroUI } from "./AgentMaestroUI";

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
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Connect to WebSocket server
  useEffect(() => {
    const connectWebSocket = () => {
      const websocket = new WebSocket("ws://localhost:8080");

      websocket.onopen = () => {
        console.log("Connected to WebSocket server");
        setWsConnected(true);
        setLoading(false);

        // Identify as UI client
        const messageToSend: IMessageFromUI = {
          messageType: EMessageFromUI.GetAgents,
          connectionType: EConnectionType.UI,
        };
        websocket.send(JSON.stringify(messageToSend));

        // Request initial agent list
        setTimeout(() => {
          const messageToSend: IMessageFromUI = {
            messageType: EMessageFromUI.GetAgents,
            connectionType: EConnectionType.UI,
          };
          websocket.send(JSON.stringify(messageToSend));
        }, 100);
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as IMessageFromServer;
          console.log("Received WebSocket message:", message);

          switch (message.messageType) {
            case EMessageFromServer.AgentList:
              setAgents(message.details?.agents || []);
              break;
            case EMessageFromServer.Registered:
              setAgents((prev) => {
                const newAgent = message.details as Agent;
                return [
                  ...prev.filter((a) => a.id !== newAgent.id),
                  newAgent,
                ];
              });
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
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      websocket.onclose = () => {
        console.log("WebSocket connection closed");
        setWsConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setWsConnected(false);
      };

      setWs(websocket);
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const sendMessage = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.error("WebSocket not connected");
    }
  };

  const sendToRooCode = async (agentId: string, message: string) => {
    if (!agentId) {
      throw new Error("No agent selected");
    }

    const messageToSend: IMessageFromUI = {
      messageType: EMessageFromUI.SendToRooCode,
      connectionType: EConnectionType.UI,
      details: {
        agentId,
        message,
      },
    };
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
