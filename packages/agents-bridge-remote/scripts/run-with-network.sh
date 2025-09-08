#!/bin/bash

# Enhanced Docker run script with network troubleshooting options

set -e

# Parse command line arguments
WS_URL=""
WS_PORT=""
WS_HOST=""
NETWORK_MODE="auto"
DEBUG_NETWORK=false
TEST_NETWORK=false

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
    --network)
      NETWORK_MODE="$2"
      shift 2
      ;;
    --debug-network)
      DEBUG_NETWORK=true
      shift
      ;;
    --test-network)
      TEST_NETWORK=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Network Options:"
      echo "  --network MODE       Network mode: auto|host|bridge|none (default: auto)"
      echo "  --debug-network      Enable network debugging"
      echo "  --test-network       Run network connectivity test"
      echo ""
      echo "WebSocket Options:"
      echo "  --ws-url URL         Full WebSocket URL"
      echo "  --ws-port PORT       WebSocket port (default: 8080)"
      echo "  --ws-host HOST       WebSocket host"
      echo ""
      echo "Examples:"
      echo "  $0 --network host --debug-network"
      echo "  $0 --test-network"
      echo "  $0 --network bridge --ws-port 9090"
      exit 0
      ;;
    *)
      echo "Unknown parameter: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo "🚀 Starting Agents Bridge Remote container with enhanced network support..."

# Determine network configuration
OS="$(uname -s)"
DOCKER_ARGS=""

case "$NETWORK_MODE" in
    "auto")
        case "${OS}" in
            Linux*)
                DOCKER_ARGS="--network host"
                DEFAULT_HOST="localhost"
                echo "🐧 Detected Linux: using host network"
                ;;
            Darwin*|MINGW*|CYGWIN*|MSYS*)
                DOCKER_ARGS="--add-host=host.docker.internal:host-gateway"
                DEFAULT_HOST="host.docker.internal"
                echo "🍎 Detected macOS/Windows: using host gateway"
                ;;
        esac
        ;;
    "host")
        DOCKER_ARGS="--network host"
        DEFAULT_HOST="localhost"
        echo "🔗 Using host network mode"
        ;;
    "bridge")
        DOCKER_ARGS="--add-host=host.docker.internal:host-gateway"
        DEFAULT_HOST="host.docker.internal"
        echo "🌉 Using bridge network mode"
        ;;
    "none")
        DOCKER_ARGS="--network none"
        DEFAULT_HOST="localhost"
        echo "🚫 Using no network mode (isolated)"
        ;;
    *)
        echo "❌ Unknown network mode: $NETWORK_MODE"
        exit 1
        ;;
esac

# Always add DNS servers for better connectivity
DOCKER_ARGS="$DOCKER_ARGS --dns=8.8.8.8 --dns=1.1.1.1"

# Add debugging options if requested
if [ "$DEBUG_NETWORK" = true ]; then
    DOCKER_ARGS="$DOCKER_ARGS --cap-add=NET_ADMIN --cap-add=NET_RAW"
    echo "🔍 Network debugging enabled"
fi

# WebSocket URL configuration
ENV_ARGS=""
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
fi

# Test network connectivity if requested
if [ "$TEST_NETWORK" = true ]; then
    echo "🧪 Testing network connectivity..."
    docker run --rm $DOCKER_ARGS --entrypoint /usr/local/bin/network-test.sh agents-bridge-remote
    exit 0
fi

echo "🐳 Starting container..."
echo "Command: docker run -it --rm $DOCKER_ARGS $ENV_ARGS --name agents-bridge-vscode agents-bridge-remote"

docker run -it --rm \
  $DOCKER_ARGS \
  $ENV_ARGS \
  --name agents-bridge-vscode \
  agents-bridge-remote
