# Базовый образ
FROM node:20-alpine

# Установка зависимостей
RUN apk add --no-cache docker-cli

# Рабочая директория
WORKDIR /app

# Копирование файлов
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .

# Сборка проекта
RUN pnpm run compile

# Порт для WebSocket
EXPOSE 8080

# Запуск сервиса
CMD ["pnpm", "run", "start:service"]