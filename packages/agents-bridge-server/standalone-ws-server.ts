#!/usr/bin/env node

import {createWebSocketServer} from './websocket.config';
import {logger} from './serverLogger';

// Configuration
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
const PING_INTERVAL = process.env.WS_PING_INTERVAL ? parseInt(process.env.WS_PING_INTERVAL) : 10000;

console.log('🚀 Starting standalone WebSocket server...');
console.log(`📡 Port: ${WS_PORT}`);
console.log(`💓 Ping interval: ${PING_INTERVAL}ms`);

try {
  // Create WebSocket server
  const wsServer = createWebSocketServer({
    port: WS_PORT,
    pingInterval: PING_INTERVAL,
    connectionTimeout: 30000
  });

  console.log(`✅ WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log('📝 Logs will appear below...');
  console.log('🛑 Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down WebSocket server...');
    try {
      await wsServer.close();
      console.log('✅ Server closed gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    try {
      await wsServer.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
} catch (error) {
  console.error('❌ Failed to start WebSocket server:', error);
  process.exit(1);
}
