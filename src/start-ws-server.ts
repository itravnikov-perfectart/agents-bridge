#!/usr/bin/env ts-node

import { createWebSocketServer } from './server/websocket.config';

// Configuration
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
const PING_INTERVAL = process.env.WS_PING_INTERVAL ? parseInt(process.env.WS_PING_INTERVAL) : 10000;
const HEARTBEAT_TIMEOUT_MULTIPLIER = process.env.WS_HEARTBEAT_TIMEOUT_MULTIPLIER ? parseInt(process.env.WS_HEARTBEAT_TIMEOUT_MULTIPLIER) : 5;

console.log('🚀 Starting TypeScript WebSocket server...');
console.log(`📡 Port: ${WS_PORT}`);
console.log(`💓 Ping interval: ${PING_INTERVAL}ms`);
console.log(`⏱️  Heartbeat timeout: ${PING_INTERVAL * HEARTBEAT_TIMEOUT_MULTIPLIER}ms (${HEARTBEAT_TIMEOUT_MULTIPLIER}x ping interval)`);

try {
  const wsServer = createWebSocketServer({
    port: WS_PORT,
    pingInterval: PING_INTERVAL,
    connectionTimeout: PING_INTERVAL * HEARTBEAT_TIMEOUT_MULTIPLIER
  });

  console.log(`✅ WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log('📝 Logs will appear below...');
  console.log('🛑 Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down WebSocket server...');
    await wsServer.close();
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await wsServer.close();
    process.exit(0);
  });

} catch (error) {
  console.error('❌ Failed to start WebSocket server:', error);
  process.exit(1);
}
