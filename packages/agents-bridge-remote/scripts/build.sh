#!/bin/bash

# Build script for Agents Bridge Remote Docker image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
REMOTE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🏗️  Building Agents Bridge Remote Docker image..."
echo "📁 Project root: $PROJECT_ROOT"
echo "📁 Remote dir: $REMOTE_DIR"

# Check if we're in the right directory
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "   Expected to find package.json in: $PROJECT_ROOT"
    exit 1
fi

# Check if agents-bridge-extension exists
if [ ! -f "$PROJECT_ROOT/packages/agents-bridge-extension/package.json" ]; then
    echo "❌ Error: agents-bridge-extension not found"
    echo "   Expected to find: $PROJECT_ROOT/packages/agents-bridge-extension/package.json"
    exit 1
fi

# Check if agents-bridge-shared exists
if [ ! -f "$PROJECT_ROOT/packages/agents-bridge-shared/package.json" ]; then
    echo "❌ Error: agents-bridge-shared not found"
    echo "   Expected to find: $PROJECT_ROOT/packages/agents-bridge-shared/package.json"
    exit 1
fi

# Parse command line arguments
NO_CACHE=""
if [ "$1" = "--no-cache" ]; then
    NO_CACHE="--no-cache"
    echo "🔄 Building without cache"
fi

# Build the Docker image
echo "🐳 Building Docker image..."
cd "$PROJECT_ROOT"

docker build \
    $NO_CACHE \
    -f packages/agents-bridge-remote/Dockerfile \
    -t agents-bridge-remote \
    .

echo "✅ Docker image 'agents-bridge-remote' built successfully!"
echo ""
echo "📋 Next steps:"
echo "   Run the container: ./scripts/run.sh"
echo "   Or use npm script: npm run start"
