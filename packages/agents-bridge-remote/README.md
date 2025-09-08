# Agents Bridge Remote

Docker образ с VS Code инстансом, который включает в себя Roo Code extension и Agents Bridge extension для удаленной разработки.

## Описание

Этот проект создает Docker образ, который запускает полноценный VS Code с предустановленными расширениями:

- **Roo Code Extension** - AI-ассистент для программирования
- **Agents Bridge Extension** - ваше кастомное расширение для интеграции с системой агентов

При запуске контейнера автоматически стартует VS Code с графическим интерфейсом.

## Структура проекта

```
packages/agents-bridge-remote/
├── Dockerfile              # Docker образ с VS Code и расширениями
├── package.json            # Конфигурация Node.js проекта
├── tsconfig.json           # Конфигурация TypeScript
├── scripts/
│   ├── build.sh           # Скрипт сборки Docker образа
│   ├── run.sh             # Скрипт запуска контейнера
│   └── entrypoint.sh      # Скрипт запуска VS Code в контейнере
└── README.md              # Документация
```

## Требования

- Docker
- Минимум 4GB RAM
- Минимум 2GB свободного места на диске
- Доступ к интернету для скачивания зависимостей

> **Примечание**: Не требуется X11 сервер или XQuartz! Используется XVFB виртуальный дисплей для headless режима.

> **Проблемы с сетью?** См. [Руководство по решению сетевых проблем](./NETWORK_TROUBLESHOOTING.md)

## Быстрый старт

### 1. Сборка Docker образа

```bash
cd packages/agents-bridge-remote
./scripts/build.sh
```

### 2. Запуск контейнера

#### Базовый запуск (по умолчанию подключение к localhost:8080)

```bash
./scripts/run.sh
```

#### Запуск с кастомными параметрами WebSocket

```bash
# Использовать другой порт
./scripts/run.sh --ws-port 9090

# Использовать другой хост
./scripts/run.sh --ws-host 192.168.1.100

# Использовать полный URL
./scripts/run.sh --ws-url ws://myserver.com:8080

# Показать справку
./scripts/run.sh --help
```

Контейнер запустится в headless режиме с виртуальным дисплеем XVFB. VS Code будет работать внутри контейнера с предустановленными расширениями.

## Ручной запуск

### Сборка образа

```bash
docker build -t agents-bridge-remote .
```

### Запуск контейнера

```bash
docker run -it --rm \
  --network host \
  -v $(pwd)/workspace:/workspace \
  --name agents-bridge-vscode \
  agents-bridge-remote
```

**Сетевые настройки:**

- `--network host` - предоставляет доступ к локальной сети хоста
- Контейнер может подключаться к сервисам на localhost (например, WebSocket серверы)
- Контейнер использует XVFB виртуальный дисплей, поэтому не требует настройки X11 forwarding

### Альтернативные сетевые конфигурации

#### Проброс конкретных портов (более безопасно)

```bash
docker run -it --rm \
  -p 8080:8080 \
  -p 3000:3000 \
  -v $(pwd)/workspace:/workspace \
  --name agents-bridge-vscode \
  agents-bridge-remote
```

#### Подключение к существующей Docker сети

```bash
# Создать сеть
docker network create agents-bridge-network

# Запустить контейнер в сети
docker run -it --rm \
  --network agents-bridge-network \
  -v $(pwd)/workspace:/workspace \
  --name agents-bridge-vscode \
  agents-bridge-remote
```

## Конфигурация

### Переменные окружения

- `DISPLAY` - Виртуальный дисплей XVFB (автоматически настраивается как `:99`)
- `WORKSPACE_PATH` - Путь к рабочей директории внутри контейнера (по умолчанию `/workspace`)
- `AGENTS_BRIDGE_WS_URL` - URL WebSocket сервера (по умолчанию `ws://host.docker.internal:8080`)
- `AGENTS_BRIDGE_WS_PING_INTERVAL` - Интервал ping сообщений в миллисекундах (по умолчанию `10000`)

### Настройка WebSocket подключения

При запуске контейнер автоматически проверяет доступность WebSocket сервера и настраивает подключение:

1. **Автоматическое определение сети**:
   - Linux: использует `--network host`
   - macOS/Windows: использует `--add-host=host.docker.internal:host-gateway`

2. **Проверка подключения**: Контейнер проверяет доступность WebSocket сервера при старте

3. **Гибкая настройка**: Можно переопределить URL сервера через параметры командной строки или переменные окружения

### Volumes

- `/workspace` - Рабочая директория, монтируется из хоста для сохранения файлов

### Порты

- VS Code работает в headless режиме через XVFB, дополнительные порты не требуются
- Если нужен доступ к веб-серверам из контейнера, добавьте `-p` флаги при запуске

## Установленное ПО

### Базовые инструменты

- Node.js 20
- npm, pnpm
- Git
- Python 3
- TypeScript
- curl, wget, vim

### VS Code Extensions

- **Roo Code** - AI-ассистент для программирования
- **Agents Bridge** - кастомное расширение для интеграции агентов
- **ESLint** - линтер для JavaScript/TypeScript
- **Prettier** - форматтер кода

## Разработка

### Локальная разработка расширений

Если вы хотите разрабатывать расширения локально:

```bash
# Монтируйте исходный код расширения
docker run -it --rm \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
  -v $(pwd)/../../agents-bridge-extension:/extensions/agents-bridge-extension \
  -v $(pwd)/workspace:/workspace \
  agents-bridge-remote
```

### Обновление расширений

Чтобы обновить расширения, пересоберите Docker образ:

```bash
./scripts/build.sh --no-cache
```

## Устранение проблем

### VS Code не запускается

1. **Linux**: Убедитесь, что X11 сервер запущен:

   ```bash
   echo $DISPLAY
   xhost +localhost
   ```

2. **macOS**: Убедитесь, что XQuartz установлен и запущен:

   ```bash
   brew install --cask xquartz
   open -a XQuartz
   # В настройках XQuartz включите "Allow connections from network clients"
   ```

3. **Проблемы с правами**: Добавьте пользователя в группу docker:
   ```bash
   sudo usermod -aG docker $USER
   ```

### Проблемы с производительностью

1. Увеличьте выделенную память для Docker (минимум 4GB)
2. Используйте SSD для хранения Docker образов
3. Закройте неиспользуемые приложения

### Проблемы с расширениями

1. Проверьте логи контейнера:

   ```bash
   docker logs agents-bridge-vscode
   ```

2. Зайдите в контейнер для диагностики:
   ```bash
   docker exec -it agents-bridge-vscode bash
   ```

## Примеры использования

### Разработка JavaScript/TypeScript проектов

```bash
# Создайте рабочую директорию
mkdir -p workspace/my-project
cd workspace/my-project
npm init -y

# Запустите контейнер
../scripts/run.sh
```

### Работа с Git репозиториями

```bash
# Склонируйте репозиторий в workspace
git clone https://github.com/user/repo.git workspace/repo

# Запустите VS Code с проектом
./scripts/run.sh
```

## Лицензия

MIT License

## Поддержка

Для вопросов и предложений создавайте issues в основном репозитории проекта.
