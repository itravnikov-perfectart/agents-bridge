#!/bin/bash

set -e

# Переходим в корень проекта
cd "$(dirname "$0")/../../../"

# Проверяем, что мы в правильной директории
if [ ! -f "package.json" ] || [ ! -d "packages/task-runner" ]; then
    echo -e "${RED}❌ Ошибка: Скрипт должен запускаться из корня проекта Roo-Code${NC}"
    exit 1
fi

# Сборка Docker образа
echo -e "${YELLOW}🔨 Сборка Docker образа...${NC}"
docker build -f packages/agents-bridge-remote/Dockerfile -t agents-bridge-remote .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker образ успешно собран${NC}"
else
    echo -e "${RED}❌ Ошибка сборки Docker образа${NC}"
    exit 1
fi

# Параметры по умолчанию для демонстрации
DEFAULT_REPO="https://github.com/itravnikov-perfectart/test-roo-code.git"
DEFAULT_TASK="Создай новый файл README-ru.md с описанием проекта на русском языке"
DEFAULT_TOKEN=""

# Проверяем переданные аргументы
GIT_REPO=${1:-$DEFAULT_REPO}
TASK_TEXT=${2:-$DEFAULT_TASK}
GIT_TOKEN=${3:-$DEFAULT_TOKEN}
CONFIG_JSON=${4:-""}

echo ""
echo -e "${BLUE}📋 Параметры запуска:${NC}"
echo "   Репозиторий: $GIT_REPO"
echo "   Задача: $TASK_TEXT"
echo "   Токен: $([ -n "$GIT_TOKEN" ] && echo "установлен" || echo "не установлен")"
echo "   Конфигурация: $([ -n "$CONFIG_JSON" ] && echo "установлена" || echo "по умолчанию")"

# Собираем команду для запуска
RUN_CMD="docker run --rm"

RUN_CMD="$RUN_CMD roo-task-runner --git-repo \"$GIT_REPO\" --task \"$TASK_TEXT\""

if [ -n "$GIT_TOKEN" ]; then
    RUN_CMD="$RUN_CMD --git-token \"$GIT_TOKEN\""
fi

if [ -n "$CONFIG_JSON" ]; then
    RUN_CMD="$RUN_CMD --config '$CONFIG_JSON'"
fi

echo ""
echo -e "${YELLOW}🚀 Запуск task-runner...${NC}"
echo "Команда: $RUN_CMD"
echo ""

# Запуск
eval $RUN_CMD

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Task runner завершен успешно${NC}"
else
    echo ""
    echo -e "${RED}❌ Task runner завершен с ошибкой${NC}"
    exit 1
fi 