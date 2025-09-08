#!/bin/bash

# Entrypoint script for Agents Bridge Remote container
# Manages VS Code lifecycle through TypeScript controller

set -e

export DONT_PROMPT_WSL_INSTALL=1
export DISPLAY=:99

echo "🚀 Starting Agents Bridge Remote Container Manager..."


# Start the TypeScript container manager
exec tsx src/index.ts