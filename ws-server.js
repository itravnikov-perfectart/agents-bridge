#!/usr/bin/env node

const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// Simple logger for standalone server
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
};

// Agent Manager
class AgentManager {
  constructor(pingInterval, timeoutMultiplier = 5) {
    this.agents = new Map();
    this.pingInterval = pingInterval;
    this.heartbeatTimeout = pingInterval * timeoutMultiplier;
    this.startHeartbeatPing();
  }

  registerAgent(socket, metadata = {}) {
    const agentId = uuidv4();
    const now = Date.now();
    this.agents.set(agentId, {
      id: agentId,
      socket,
      lastHeartbeat: now,
      lastPingSent: now,
      connectedAt: now,
      gracePeriod: true, // Don't ping immediately, give client time to establish
      metadata
    });
    logger.info(`Agent ${agentId} registered with metadata:`, metadata);
    
    // Remove grace period after 30 seconds
    setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.gracePeriod = false;
        logger.info(`Grace period ended for agent ${agentId}, will now send pings`);
      }
    }, 30000);
    
    return agentId;
  }

  removeAgent(agentId) {
    this.agents.delete(agentId);
  }

  updateHeartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      logger.info(`Agent ${agentId} heartbeat updated`);
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.agents.forEach(agent => {
      if (agent.socket.readyState === 1) { // WebSocket.OPEN
        agent.socket.send(data);
      }
    });
  }

  // Send ping messages to all connected agents
  sendHeartbeatPings() {
    const now = Date.now();
    this.agents.forEach((agent, id) => {
      // Skip agents in grace period
      if (agent.gracePeriod) {
        logger.info(`Agent ${id} in grace period, skipping ping`);
        return;
      }
      
      if (agent.socket.readyState === 1) { // WebSocket.OPEN
        try {
          agent.socket.send(JSON.stringify({ 
            type: 'ping', 
            timestamp: now 
          }));
          agent.lastPingSent = now;
          logger.info(`Ping sent to agent ${id}`);
        } catch (error) {
          logger.error(`Failed to send ping to agent ${id}:`, error);
          this.agents.delete(id);
        }
      } else {
        logger.warn(`Agent ${id} socket not in OPEN state (${agent.socket.readyState}), removing`);
        this.agents.delete(id);
      }
    });
  }

  // Start the heartbeat ping interval
  startHeartbeatPing() {
    this.pingIntervalId = setInterval(() => {
      this.sendHeartbeatPings();
    }, this.pingInterval);
  }

  // Stop the heartbeat ping interval
  stopHeartbeatPing() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }
  }

  checkHealth() {
    const now = Date.now();
    this.agents.forEach((agent, id) => {
      const timeSinceLastHeartbeat = now - agent.lastHeartbeat;
      const timeSinceConnected = now - agent.connectedAt;
      
      // During grace period, use a more lenient timeout
      const effectiveTimeout = agent.gracePeriod ? 
        Math.max(this.heartbeatTimeout, 60000) : // At least 60 seconds during grace period
        this.heartbeatTimeout;
      
      if (timeSinceLastHeartbeat > effectiveTimeout) {
        logger.warn(`Agent ${id} heartbeat timeout (${timeSinceLastHeartbeat}ms since last heartbeat, connected ${timeSinceConnected}ms ago, gracePeriod: ${agent.gracePeriod})`);
        agent.socket.close(4001, 'Heartbeat timeout');
        this.agents.delete(id);
      } else {
        logger.info(`Agent ${id} healthy (${timeSinceLastHeartbeat}ms since last heartbeat, gracePeriod: ${agent.gracePeriod})`);
      }
    });
  }

  // Cleanup method
  destroy() {
    this.stopHeartbeatPing();
    this.agents.clear();
  }
}

// Configuration
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
const PING_INTERVAL = process.env.WS_PING_INTERVAL ? parseInt(process.env.WS_PING_INTERVAL) : 10000;
const HEARTBEAT_TIMEOUT_MULTIPLIER = process.env.WS_HEARTBEAT_TIMEOUT_MULTIPLIER ? parseInt(process.env.WS_HEARTBEAT_TIMEOUT_MULTIPLIER) : 5;

console.log('🚀 Starting standalone WebSocket server...');
console.log(`📡 Port: ${WS_PORT}`);
console.log(`💓 Ping interval: ${PING_INTERVAL}ms`);
console.log(`⏱️  Heartbeat timeout: ${PING_INTERVAL * HEARTBEAT_TIMEOUT_MULTIPLIER}ms (${HEARTBEAT_TIMEOUT_MULTIPLIER}x ping interval)`);

try {
  const wss = new WebSocketServer({ 
    port: WS_PORT,
    verifyClient: (info) => {
      // For now, accept all connections (remove token verification)
      return true;
    }
  });

  const agentManager = new AgentManager(PING_INTERVAL, HEARTBEAT_TIMEOUT_MULTIPLIER);
  const healthCheckInterval = setInterval(() => agentManager.checkHealth(), PING_INTERVAL);

  wss.on('connection', (socket, req) => {
    const agentId = agentManager.registerAgent(socket);
    logger.info(`Agent connected: ${agentId}`);

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle ping response (pong)
        if (message.type === 'pong') {
          agentManager.updateHeartbeat(agentId);
          logger.info(`Received pong from agent ${agentId}`);
          return;
        }
        
        // Handle legacy heartbeat messages (for backwards compatibility)
        if (message.type === 'heartbeat') {
          agentManager.updateHeartbeat(agentId);
          socket.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
          logger.info(`Received legacy heartbeat from agent ${agentId}`);
          return;
        }

        // Handle agent registration
        if (message.type === 'register') {
          agentManager.registerAgent(socket, message.metadata);
          socket.send(JSON.stringify({
            type: 'registered',
            agentId,
            timestamp: Date.now()
          }));
          return;
        }

        // Handle task requests
        if (message.type === 'requestTask') {
          const workspacePath = message.workspacePath || '';
          logger.info(`Agent ${agentId} requested task for workspace: ${workspacePath}`);
          // TODO: Implement task assignment logic
          socket.send(JSON.stringify({
            type: 'taskAssignment',
            taskId: `task-${Date.now()}`,
            agentId,
            workspacePath,
            timestamp: Date.now()
          }));
          return;
        }

        // Handle task results
        if (message.type === 'taskResult') {
          logger.info(`Agent ${agentId} completed task:`, message.result);
          return;
        }

        // Handle UI requests (for controllers data)
        if (message.type === 'getControllers') {
          socket.send(JSON.stringify({
            type: 'controllersData',
            controllers: [
              { id: 'default', workspace: '/default/workspace' },
              { id: 'standalone-ws', workspace: '/ws/workspace' }
            ],
            activeControllerId: 'standalone-ws',
            timestamp: Date.now()
          }));
          return;
        }

        logger.warn(`Unknown message type: ${message.type}`);
      } catch (error) {
        logger.error('Invalid message format:', error);
      }
    });

    socket.on('close', (code, reason) => {
      agentManager.removeAgent(agentId);
      logger.info(`Agent disconnected: ${agentId}, code: ${code}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error for agent ${agentId}:`, error);
      agentManager.removeAgent(agentId);
    });
  });

  console.log(`✅ WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log('📝 Logs will appear below...');
  console.log('🛑 Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down WebSocket server...');
    clearInterval(healthCheckInterval);
    agentManager.destroy();
    wss.close(() => {
      console.log('✅ Server closed gracefully');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    clearInterval(healthCheckInterval);
    agentManager.destroy();
    wss.close(() => {
      process.exit(0);
    });
  });

} catch (error) {
  console.error('❌ Failed to start WebSocket server:', error);
  process.exit(1);
}

