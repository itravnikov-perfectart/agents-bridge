# Roo Code Task Runner

Docker образ для выполнения задач с помощью Roo Code плагина.

## Функциональность

1. **Docker образ** с VS Code и Roo Code плагином
2. **Клонирование репозитория** с поддержкой токенов авторизации
3. **TypeScript скрипт** для обработки задач через IPC
4. **Автоматическое выполнение задач** с выводом результатов в консоль

## Сборка Docker образа

```bash
# Из корня проекта Roo-Code
docker build -f packages/task-runner/Dockerfile -t roo-task-runner .
```

## Запуск

### Базовый запуск с OpenAI API

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/repo.git" \
  --task "Создай новый файл hello.js с функцией приветствия" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

### Запуск с токеном GitHub

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/private-repo.git" \
  --git-token "ghp_xxxxxxxxxxxxxxxx" \
  --task "Исправь баг в функции calculateSum" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

### Запуск с расширенной конфигурацией

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/repo.git" \
  --task "Оптимизируй производительность кода" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1",
    "maxConcurrentFileReads": 5,
    "autoApprovalEnabled": true,
    "maxWorkspaceFiles": 300
  }'
```

### Использование удобного скрипта

```bash
# Скрипт автоматически использует правильную конфигурацию
./packages/task-runner/scripts/build-and-run.sh \
  "https://github.com/user/repo.git" \
  "Создай новый компонент Button" \
  "ghp_xxxxxxxxxxxxxxxx"
```

## Параметры

- `--git-repo` (обязательный): URL git репозитория для клонирования
- `--git-token` (опционально): Токен для доступа к приватным репозиториям
- `--task` (обязательный): Текст задачи для выполнения
- `--config` (обязательный): JSON конфигурация с API ключом и настройками

## Конфигурация

### Обязательные параметры конфигурации

```json
{
	"apiProvider": "openai-native",
	"openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
	"apiModelId": "gpt-4.1"
}
```

### Дополнительные настройки

По умолчанию используются настройки из `EVALS_SETTINGS` с автоматическим одобрением:

```json
{
	"apiProvider": "openai-native",
	"openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
	"apiModelId": "gpt-4.1",
	"autoApprovalEnabled": true,
	"alwaysAllowReadOnly": true,
	"alwaysAllowWrite": true,
	"alwaysAllowExecute": true,
	"alwaysAllowBrowser": true,
	"requestDelaySeconds": 10,
	"maxWorkspaceFiles": 200,
	"maxOpenTabsContext": 20
}
```

## Разработка

### Локальная разработка

```bash
cd packages/task-runner
pnpm install
pnpm build
```

### Запуск без Docker

```bash
tsx src/index.ts \
  --git-repo "https://github.com/user/repo.git" \
  --task "Добавь тесты для функции validateEmail" \
  --config '{"apiProvider":"openai-native","openAiNativeApiKey":"sk-proj-xxx","apiModelId":"gpt-4.1"}'
```

## Логи

Все события выполнения задачи выводятся в консоль:

- 📋 Параметры задачи
- 📥 Клонирование репозитория
- ⚙️ Конфигурация Roo Code
- 🚀 Запуск VS Code
- 🔌 Подключение к IPC
- 📨 События от Roo Code плагина
- 💬 Сообщения от ассистента
- 📊 Использование токенов
- ✅ Завершение задачи

## Примеры использования

### CI/CD интеграция

```yaml
# GitHub Actions
- name: Run Roo Code Task
  run: |
      docker run --rm roo-task-runner \
        --git-repo "${{ github.repository }}" \
        --git-token "${{ secrets.GITHUB_TOKEN }}" \
        --task "Проведи код-ревью и исправь найденные проблемы" \
        --config '{
          "apiProvider": "openai-native",
          "openAiNativeApiKey": "${{ secrets.OPENAI_API_KEY }}",
          "apiModelId": "gpt-4.1"
        }'
```

### Скрипт автоматизации

```bash
#!/bin/bash
REPOS=(
  "https://github.com/org/project1.git"
  "https://github.com/org/project2.git"
)

CONFIG='{
  "apiProvider": "openai-native",
  "openAiNativeApiKey": "'$OPENAI_API_KEY'",
  "apiModelId": "gpt-4.1"
}'

for repo in "${REPOS[@]}"; do
  echo "Обработка репозитория: $repo"
  docker run --rm roo-task-runner \
    --git-repo "$repo" \
    --git-token "$GITHUB_TOKEN" \
    --task "Обнови зависимости до последних версий" \
    --config "$CONFIG"
done
```
