#!/usr/bin/env node

import { command, run, string, option } from "cmd-ts"
import { runTask } from "./runner.js"

const app = command({
  name: "task-runner",
  description: "Roo Code Task Runner - выполняет задачи в репозитории с помощью Roo Code",
  version: "0.0.0",
  args: {
    gitRepo: option({
      type: string,
      long: "git-repo",
      description: "URL git репозитория для клонирования",
      env: "GIT_REPO_URL",
    }),
    gitToken: option({
      type: string,
      long: "git-token",
      description: "Токен для доступа к git репозиторию",
      env: "GIT_TOKEN",
    }),
    task: option({
      type: string,
      long: "task",
      description: "Текст задачи для выполнения",
      env: "TASK_TEXT",
    }),
    config: option({
      type: string,
      long: "config",
      description: "JSON конфигурация для Roo Code (опционально)",
      env: "ROO_CONFIG_JSON",
    }),
  },
  handler: async (args) => {
    console.log("🚀 Запуск Roo Code Task Runner...")
    
    try {
      await runTask({
        gitRepoUrl: args.gitRepo || "",
        gitToken: args.gitToken || "",
        taskText: args.task || "",
        rooConfig: args.config || "",
      })
      
      console.log("✅ Задача выполнена успешно!")
      process.exit(0)
    } catch (error) {
      console.error("❌ Ошибка при выполнении задачи:", error)
      process.exit(1)
    }
  },
})

run(app, process.argv.slice(2)) 