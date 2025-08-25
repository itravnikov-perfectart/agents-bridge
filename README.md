# Agent Maestro - VS Code Extension

Extension for managing AI agents and task execution in VS Code workspace.

## Installation and Startup

1. Install dependencies:
```bash
pnpm install
```

2. Run the extension in development mode:
```bash
press f5 in vscode
```

## Architecture Overview

### Core Components

1. **ControllerManager** - Manages multiple workspace controllers
2. **RooCodeAdapter** - Handles task execution
3. **Redis Integration** - For state persistence
4. **VS Code UI** - Tree view and webview panels

### Key Functionality

1. Create and switch between workspace controllers
2. Set workspace paths for each controller
3. Execute tasks in the context of specific workspaces
4. Monitor task status and results

## Usage

### Basic Commands

1. Create a new controller:
```
agent-maestro.createController
```

2. Switch active controller:
```
agent-maestro.switchController
``` 

3. Set workspace path:
```
agent-maestro.setWorkspacePath
```

4. Show controller panel:
```
agent-maestro.showPanel
```

5. Send roo code task:
```
agent-maestro.sendToRoo
```

## Docker Setup

To run with Redis in Docker:

1. Start docker-compose:
```bash
docker-compose up -d
```

Key test scenarios:
1. Controller lifecycle
2. Workspace path management
3. Task execution flow

## Troubleshooting

Check logs in:
1. VS Code Output channel ("Agent Maestro")
2. Redis logs


## Issue

- problem with switch controller (when you switch between controllers, the created controllers disappear and only the one you selected remains)
- VS Code UI , need will be better
- problem with start many controller (solution: Implement like a roo code eval or take how we did headless roo code)



## WebSocket Server Implementation

### Initialization
The WebSocket server is initialized in `src/server/websocket.config.ts` with:

### Integration Flow:
1. Server starts when extension activates
2. Each controller creates its own WebSocket instance
3. Agents connect and authenticate via tokens
4. Messages are routed by workspace path

## WebSocket Server Management

The project includes several commands for managing the WebSocket server:

### Quick Commands
```bash
# Start WebSocket server on port 8080
pnpm run start:ws

# Stop WebSocket server on port 8080
pnpm run stop:ws

# Check WebSocket server status
pnpm run status:ws

# Kill all servers (UI and WebSocket)
pnpm run kill:all

# Kill Vite UI servers specifically
pnpm run kill:vite
```

### Advanced Management Script
```bash
# Start server (default port 8080)
pnpm run ws:start

# Start server on specific port
./scripts/ws-server.sh start 9000

# Stop server
pnpm run ws:stop

# Restart server
pnpm run ws:restart

# Check server status
pnpm run ws:status

# Kill all servers (UI and WebSocket)
pnpm run ws:killall

# Kill Vite UI servers specifically
pnpm run ws:killvite

# Get help
./scripts/ws-server.sh
```

### Manual Process Management
```bash
# Kill process on specific port
lsof -ti:8080 | xargs kill -9

# Check what's running on port 8080
lsof -i:8080
```

## Development
