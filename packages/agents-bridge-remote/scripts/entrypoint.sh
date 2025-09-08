#!/bin/bash

# Entrypoint script for Agents Bridge Remote container
# Manages VS Code lifecycle through TypeScript controller

set -e

export DONT_PROMPT_WSL_INSTALL=1
export DISPLAY=:99


AGENTS_BRIDGE_CONFIG_JSON=""
ROO_CONFIG_JSON=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --agents-bridge-config)
      AGENTS_BRIDGE_CONFIG_JSON="$2"
      shift 2
      ;;
    --roo-config)
      ROO_CONFIG_JSON="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      echo "Usage: $0 --agents-bridge-config <JSON> --roo-config <JSON>"
      exit 1
      ;;
  esac
done


echo "=== Agents Bridge Remote ==="
echo "Agents Bridge Config provided: $([ -n "$AGENTS_BRIDGE_CONFIG_JSON" ] && echo "Yes" || echo "No")"
echo "Roo Config provided: $([ -n "$ROO_CONFIG_JSON" ] && echo "Yes" || echo "No")"

echo "=========================="

# Configure DNS if needed
echo "🔧 Настройка DNS..."
if [ ! -f /etc/resolv.conf ] || [ ! -s /etc/resolv.conf ]; then
    echo "nameserver 8.8.8.8" > /etc/resolv.conf
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf
    echo "nameserver 208.67.222.222" >> /etc/resolv.conf
    echo "📝 DNS серверы настроены"
fi

# Test network connectivity
echo "🌐 Проверка сетевого подключения..."

# Test DNS resolution
if nslookup google.com > /dev/null 2>&1; then
    echo "✅ DNS работает корректно"
else
    echo "❌ Проблемы с DNS, пытаемся исправить..."
    echo "nameserver 8.8.8.8" > /etc/resolv.conf
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf
    echo "📋 Обновленные DNS сервера:"
    cat /etc/resolv.conf
fi

# Test internet connectivity
if ping -c 3 8.8.8.8 > /dev/null 2>&1; then
    echo "✅ Интернет соединение работает (ping 8.8.8.8)"
else
    echo "❌ Нет доступа к интернету через ping"
fi

# Test HTTPS connectivity
if curl -s --connect-timeout 10 https://www.google.com > /dev/null 2>&1; then
    echo "✅ HTTPS соединение работает"
else
    echo "❌ Проблемы с HTTPS соединением"
fi

echo "=========================="

export AGENTS_BRIDGE_CONFIG_JSON
export ROO_CONFIG_JSON

# Update VS Code settings with environment variables
echo "🔧 Обновление конфигурации VS Code..."

# Create settings.json with current environment variables
SETTINGS_JSON=$(cat <<EOF
{
  "agent-bridge.wsUrl": "${AGENTS_BRIDGE_WS_URL:-ws://host.docker.internal:8080}",
  "agent-bridge.wsPingInterval": ${AGENTS_BRIDGE_WS_PING_INTERVAL:-10000}
}
EOF
)

echo "$SETTINGS_JSON" > /app/.vscode/User/settings.json
echo "$SETTINGS_JSON" > /app/.vscode-template/User/settings.json

echo "📡 WebSocket URL: ${AGENTS_BRIDGE_WS_URL:-ws://host.docker.internal:8080}"
echo "⏱️  Ping Interval: ${AGENTS_BRIDGE_WS_PING_INTERVAL:-10000}ms"

# Start the TypeScript container manager
exec tsx src/index.ts