#!/bin/bash

# Run script for Agents Bridge Remote Docker container

set -e

# Parse command line arguments
WS_URL=""
WS_PORT=""
WS_HOST=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --ws-url)
      WS_URL="$2"
      shift 2
      ;;
    --ws-port)
      WS_PORT="$2"
      shift 2
      ;;
    --ws-host)
      WS_HOST="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --ws-url URL     Full WebSocket URL (e.g., ws://localhost:8080)"
      echo "  --ws-port PORT   WebSocket port (default: 8080)"
      echo "  --ws-host HOST   WebSocket host (default: host.docker.internal)"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --ws-port 9090                    # Use port 9090"
      echo "  $0 --ws-url ws://localhost:8080      # Use specific URL"
      echo "  $0 --ws-host 192.168.1.100          # Use specific host IP"
      exit 0
      ;;
    *)
      echo "Unknown parameter: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo "🚀 Starting Agents Bridge Remote container..."

# Определяем сетевые параметры
OS="$(uname -s)"
case "${OS}" in
    Linux*)
        NETWORK_ARGS="--network host"
        DEFAULT_HOST="localhost"
        ;;
    Darwin*|MINGW*|CYGWIN*|MSYS*)
        NETWORK_ARGS="--add-host=host.docker.internal:host-gateway"
        DEFAULT_HOST="host.docker.internal"
        ;;
esac

# Настройка WebSocket URL
if [ -n "$WS_URL" ]; then
    ENV_ARGS="-e AGENTS_BRIDGE_WS_URL=$WS_URL"
    echo "📡 Using custom WebSocket URL: $WS_URL"
elif [ -n "$WS_HOST" ] || [ -n "$WS_PORT" ]; then
    WS_HOST=${WS_HOST:-$DEFAULT_HOST}
    WS_PORT=${WS_PORT:-8080}
    CONSTRUCTED_URL="ws://$WS_HOST:$WS_PORT"
    ENV_ARGS="-e AGENTS_BRIDGE_WS_URL=$CONSTRUCTED_URL"
    echo "📡 Using WebSocket URL: $CONSTRUCTED_URL"
else
    echo "📡 Using default WebSocket configuration"
    ENV_ARGS=""
fi

echo "🐳 Starting container in headless mode..."

docker run -it --rm \
  $NETWORK_ARGS \
  $ENV_ARGS \
  --dns=8.8.8.8 \
  --dns=1.1.1.1 \
  --name agents-bridge-vscode \
  agents-bridge-remote