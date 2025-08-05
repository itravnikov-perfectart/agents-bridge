# WQ Maestro - Distributed Agent Management System

## Key Features

- **WebSocket Communication**: Real-time bidirectional messaging
- **Docker Orchestration**: Container lifecycle management
- **Task Queues**: Redis/BullMQ for distributed task processing  
- **Unified Monitoring**: Centralized UI for process tracking
- **WebSocket Integration**: Real-time cross-instance communication

## Configuration

```typescript
// Basic setup
const maestro = new WQMaestroService(
  8080, // WebSocket port
  { 
    host: 'redis-host',
    port: 6379,
    password: 'secret',
    db: 0
  }
);

// Start a process
const process = await maestro.startProcess({
  image: 'node:18',
  command: ['npm', 'start'],
  env: { NODE_ENV: 'production' }
});

// Monitor events
for await (const event of process) {
  console.log(event);
}
```

## Components

- `WQMaestroService`: Core orchestration service
- `WQMaestroUI`: React-based monitoring interface
- `WebSocket`: Real-time instance communication
- `WQMaestroAdapter`: VS Code extension integration

## Requirements

- Node.js 18+
- Docker
- Redis
- VS Code Extension Host
