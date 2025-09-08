# Примеры использования Roo Code Task Runner

## Конфигурация API ключа

Для использования Roo Code Task Runner необходимо передать API ключ OpenAI через параметр `--config`. Все примеры ниже показывают правильный способ передачи конфигурации.

### Базовая конфигурация

```json
{
	"apiProvider": "openai-native",
	"openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
	"apiModelId": "gpt-4.1"
}
```

## Быстрый старт

### 1. Сборка и тестовый запуск

```bash
# Из корня проекта Roo-Code
./packages/task-runner/scripts/build-and-run.sh
```

Скрипт `build-and-run.sh` автоматически использует правильную конфигурацию из `DEFAULT_CONFIG_JSON`.

### 2. Сборка Docker образа вручную

```bash
docker build -f packages/task-runner/Dockerfile -t roo-task-runner .
```

## Примеры команд

### Создание файла

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/octocat/Hello-World.git" \
  --task "Создай файл array-utils.js с полезными функциями для работы с массивами. Для git используй email ilya.travnikov@perfectart.com и name itravnikov" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

### Исправление багов

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/itravnikov-perfectart/test-roo-code.git" \
  --git-token "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" \
  --task "Создай файл array-utils.js с полезными функциями для работы с массивами. Изменения оформи в отдельную git ветку (название придумай сам) и запушь их. Для git используй email ilya.travnikov@perfectart.com и name itravnikov" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "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",
    "apiModelId": "gpt-4.1"
  }'
```

### Рефакторинг кода

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/legacy-app.git" \
  --task "Отрефактори главный компонент App.js, разбив его на более мелкие компоненты" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

### Добавление тестов

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/api-service.git" \
  --task "Добавь unit тесты для всех функций в файле src/auth.js" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

### Обновление документации

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/open-source-lib.git" \
  --task "Обнови README.md, добавив примеры использования и установки" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

## Примеры с расширенной конфигурацией

### Увеличенный лимит на чтение файлов

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/large-project.git" \
  --task "Проанализируй архитектуру проекта и предложи улучшения" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1",
    "maxWorkspaceFiles": 500,
    "maxOpenTabsContext": 50,
    "terminalOutputLineLimit": 1000
  }'
```

### Режим без автоподтверждения (для отладки)

```bash
docker run --rm -it roo-task-runner \
  --git-repo "https://github.com/user/project.git" \
  --task "Добавь новую функцию для экспорта данных" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1",
    "autoApprovalEnabled": false,
    "alwaysAllowWrite": false,
    "requestDelaySeconds": 5
  }'
```

### Использование другой модели OpenAI

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/project.git" \
  --task "Оптимизируй SQL запросы в файлах миграций" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4-turbo"
  }'
```

## Использование в CI/CD

### GitHub Actions

```yaml
name: Automated Code Improvements
on:
    schedule:
        - cron: "0 2 * * 1" # Каждый понедельник в 2:00

jobs:
    improve-code:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v3

            - name: Build Task Runner
              run: |
                  docker build -f packages/task-runner/Dockerfile -t roo-task-runner .

            - name: Run Code Improvements
              run: |
                  docker run --rm roo-task-runner \
                    --git-repo "${{ github.server_url }}/${{ github.repository }}" \
                    --git-token "${{ secrets.GITHUB_TOKEN }}" \
                    --task "Проведи анализ кода и исправь найденные проблемы с производительностью" \
                    --config '{
                      "apiProvider": "openai-native",
                      "openAiNativeApiKey": "${{ secrets.OPENAI_API_KEY }}",
                      "apiModelId": "gpt-4.1"
                    }'
```

### GitLab CI

```yaml
stages:
    - code-review

automated-review:
    stage: code-review
    image: docker:latest
    services:
        - docker:dind
    script:
        - docker build -f packages/task-runner/Dockerfile -t roo-task-runner .
        - |
            docker run --rm roo-task-runner \
              --git-repo "$CI_REPOSITORY_URL" \
              --git-token "$CI_JOB_TOKEN" \
              --task "Проанализируй изменения в последнем коммите и предложи улучшения" \
              --config '{
                "apiProvider": "openai-native",
                "openAiNativeApiKey": "'$OPENAI_API_KEY'",
                "apiModelId": "gpt-4.1"
              }'
    only:
        - merge_requests
```

## Многозадачность

### Обработка нескольких репозиториев

```bash
#!/bin/bash
REPOS=(
  "https://github.com/org/frontend.git"
  "https://github.com/org/backend.git"
  "https://github.com/org/mobile.git"
)

TASK="Обнови все зависимости до последних стабильных версий"

CONFIG='{
  "apiProvider": "openai-native",
  "openAiNativeApiKey": "'$OPENAI_API_KEY'",
  "apiModelId": "gpt-4.1"
}'

for repo in "${REPOS[@]}"; do
  echo "Обработка: $repo"
  docker run --rm roo-task-runner \
    --git-repo "$repo" \
    --git-token "$GITHUB_TOKEN" \
    --task "$TASK" \
    --config "$CONFIG" &
done

wait # Ждем завершения всех задач
echo "Все репозитории обработаны"
```

### Пакетная обработка задач

```bash
#!/bin/bash
TASKS=(
  "Добавь TypeScript типы для всех функций"
  "Обнови документацию API"
  "Исправь все ESLint предупреждения"
  "Добавь error handling в асинхронные функции"
)

REPO="https://github.com/user/project.git"

CONFIG='{
  "apiProvider": "openai-native",
  "openAiNativeApiKey": "'$OPENAI_API_KEY'",
  "apiModelId": "gpt-4.1"
}'

for task in "${TASKS[@]}"; do
  echo "Выполнение задачи: $task"
  docker run --rm roo-task-runner \
    --git-repo "$REPO" \
    --git-token "$GITHUB_TOKEN" \
    --task "$task" \
    --config "$CONFIG"
done
```

## Удобные bash-функции

### Создание функции для простого использования

```bash
# Добавьте в ~/.bashrc или ~/.zshrc
roo-task() {
  local repo="$1"
  local task="$2"
  local token="${3:-$GITHUB_TOKEN}"

  if [[ -z "$OPENAI_API_KEY" ]]; then
    echo "Ошибка: Установите OPENAI_API_KEY"
    return 1
  fi

  local config='{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "'$OPENAI_API_KEY'",
    "apiModelId": "gpt-4.1"
  }'

  docker run --rm roo-task-runner \
    --git-repo "$repo" \
    --git-token "$token" \
    --task "$task" \
    --config "$config"
}

# Использование:
# roo-task "https://github.com/user/repo.git" "Создай новый компонент"
```

## Отладка

### Запуск с подробными логами

```bash
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/project.git" \
  --task "Отладочная задача" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1",
    "terminalOutputLineLimit": 1000
  }' \
  2>&1 | tee task-runner.log
```

### Использование тестового репозитория

```bash
# Используйте публичный репозиторий для тестирования
docker run --rm roo-task-runner \
  --git-repo "https://github.com/octocat/Hello-World.git" \
  --task "Добавь файл .gitignore для Node.js проекта" \
  --config '{
    "apiProvider": "openai-native",
    "openAiNativeApiKey": "sk-proj-xxxxxxxxxxxxxxxx",
    "apiModelId": "gpt-4.1"
  }'
```

## Переменные окружения для удобства

```bash
# Настройте переменные окружения для удобства
export OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxx"
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxx"

export ROO_CONFIG='{
  "apiProvider": "openai-native",
  "openAiNativeApiKey": "'$OPENAI_API_KEY'",
  "apiModelId": "gpt-4.1"
}'

# Теперь можно использовать:
docker run --rm roo-task-runner \
  --git-repo "https://github.com/user/repo.git" \
  --git-token "$GITHUB_TOKEN" \
  --task "Твоя задача" \
  --config "$ROO_CONFIG"
```
