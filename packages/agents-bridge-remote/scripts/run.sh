#!/bin/bash

# Run script for Agents Bridge Remote Docker container

set -e

echo "🚀 Starting Agents Bridge Remote container..."

echo "🐳 Starting container in headless mode..."

# Определяем сетевые параметры
OS="$(uname -s)"
case "${OS}" in
    Linux*)
        NETWORK_ARGS="--network host"
        ;;
    Darwin*|MINGW*|CYGWIN*|MSYS*)
        NETWORK_ARGS="--add-host=host.docker.internal:host-gateway"
        ;;
esac

docker run -it --rm \
  $NETWORK_ARGS \
  --name agents-bridge-vscode \
  agents-bridge-remote