#!/bin/bash

# WebSocket Server Management Script
# Usage: ./scripts/ws-server.sh [start|stop|restart|status] [port]

DEFAULT_PORT=8080
PORT=${2:-$DEFAULT_PORT}

case "$1" in
    start)
        echo "Starting WebSocket server on port $PORT..."
        cd "$(dirname "$0")/.."
        pnpm run start:ws
        ;;
    stop)
        echo "Stopping WebSocket server on port $PORT..."
        lsof -ti:$PORT | xargs kill -9 2>/dev/null || echo "No WebSocket server running on port $PORT"
        ;;
    restart)
        echo "Restarting WebSocket server on port $PORT..."
        lsof -ti:$PORT | xargs kill -9 2>/dev/null || echo "No WebSocket server running on port $PORT"
        sleep 2
        cd "$(dirname "$0")/.."
        pnpm run start:ws
        ;;
    killall)
        echo "Killing all servers (UI and WebSocket)..."
        lsof -ti:3000-3010,8080 | xargs kill -9 2>/dev/null || echo "No servers running on ports 3000-3010 or 8080"
        ;;
    killvite)
        echo "Killing Vite UI servers..."
        pkill -f "vite.*serve.*src/ui" 2>/dev/null || echo "No Vite UI servers found"
        ;;
    status)
        echo "WebSocket server status on port $PORT:"
        if lsof -i:$PORT >/dev/null 2>&1; then
            lsof -i:$PORT
        else
            echo "No WebSocket server running on port $PORT"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|killall|killvite} [port]"
        echo "  Default port: $DEFAULT_PORT"
        echo ""
        echo "Examples:"
        echo "  $0 start          # Start server on port $DEFAULT_PORT"
        echo "  $0 start 9000     # Start server on port 9000"
        echo "  $0 stop           # Stop server on port $DEFAULT_PORT"
        echo "  $0 status         # Check server status on port $DEFAULT_PORT"
        echo "  $0 restart        # Restart server on port $DEFAULT_PORT"
        echo "  $0 killall        # Kill all servers (UI and WebSocket)"
        echo "  $0 killvite       # Kill Vite UI servers specifically"
        exit 1
        ;;
esac
