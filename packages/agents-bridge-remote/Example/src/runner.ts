import * as fs from "fs"
import * as path from "path"
import * as os from "node:os"
import { execa } from "execa"
import pWaitFor from "p-wait-for"

import {
	EVALS_SETTINGS,
	EVALS_TIMEOUT,
	IpcMessageType,
	RooCodeEventName,
	type RooCodeSettings,
	TaskCommandName,
	type TaskEvent,
} from "@roo-code/types"
import { IpcClient } from "@roo-code/ipc"

interface RunTaskOptions {
	gitRepoUrl: string
	gitToken?: string
	taskText: string
	rooConfig?: string
}

export async function runTask(options: RunTaskOptions): Promise<void> {
	const { gitRepoUrl, gitToken, taskText, rooConfig } = options

	console.log("📋 Параметры задачи:")
	console.log(`  Репозиторий: ${gitRepoUrl}`)
	console.log(`  Токен: ${gitToken ? "установлен" : "не установлен"}`)
	console.log(`  Задача: ${taskText.slice(0, 100)}${taskText.length > 100 ? "..." : ""}`)
	console.log(`  Конфигурация: ${rooConfig ? "установлена" : "по умолчанию"}`)

	// Определяем рабочую директорию
	const workspaceDir = path.resolve("/tmp", "task-workspace")

	// Очищаем рабочую директорию если она существует
	if (fs.existsSync(workspaceDir)) {
		console.log("🧹 Очистка рабочей директории...")
		await execa`rm -rf ${workspaceDir}`
	}

	// Создаем рабочую директорию
	console.log("📁 Создание рабочей директории...")
	fs.mkdirSync(workspaceDir, { recursive: true })

	// Клонируем репозиторий
	console.log("📥 Клонирование репозитория...")
	await cloneRepository(gitRepoUrl, gitToken, workspaceDir)

	// Подготавливаем конфигурацию Roo Code
	const rooCodeConfig = prepareRooCodeConfig(rooConfig)

	// Запускаем VS Code и выполняем задачу
	console.log("🔧 Запуск VS Code и выполнение задачи...")
	await executeTaskInVSCode(taskText, workspaceDir, rooCodeConfig)
}

async function cloneRepository(gitRepoUrl: string, gitToken: string | undefined, workspaceDir: string): Promise<void> {
	try {
		let cloneUrl = gitRepoUrl

		// Если передан токен, добавляем его в URL
		if (gitToken) {
			const url = new URL(gitRepoUrl)
			if (url.hostname === "github.com") {
				cloneUrl = `https://${gitToken}@github.com${url.pathname}`
			} else {
				// Для других git провайдеров, пытаемся добавить токен как username
				cloneUrl = gitRepoUrl.replace("https://", `https://${gitToken}@`)
			}
		}

		await execa`git clone ${cloneUrl} ${workspaceDir}`
		console.log("✅ Репозиторий успешно клонирован")
	} catch (error) {
		console.error("❌ Ошибка при клонировании репозитория:", error)
		throw error
	}
}

function prepareRooCodeConfig(rooConfigJson?: string): RooCodeSettings {
	let customConfig: Partial<RooCodeSettings> = {}

	if (rooConfigJson) {
		try {
			customConfig = JSON.parse(rooConfigJson)
			console.log("✅ Пользовательская конфигурация загружена")
		} catch (error) {
			console.warn("⚠️ Ошибка при парсинге конфигурации, используется конфигурация по умолчанию:", error)
		}
	}

	// Объединяем настройки: базовые + OpenAI конфигурация + пользовательские
	const finalConfig: RooCodeSettings = {
		...EVALS_SETTINGS,
		...customConfig,
	}

	console.log("⚙️ Конфигурация Roo Code подготовлена:")
	console.log("  - finalConfig:", finalConfig)

	return finalConfig
}

async function executeTaskInVSCode(taskText: string, workspaceDir: string, rooConfig: RooCodeSettings): Promise<void> {
	const taskId = Date.now().toString()
	const ipcSocketPath = path.resolve(os.tmpdir(), `task-runner-${taskId}.sock`)
	const env = { ROO_CODE_IPC_SOCKET_PATH: ipcSocketPath }
	const controller = new AbortController()
	const cancelSignal = controller.signal

	// Команда для запуска VS Code
	const codeCommand = `xvfb-run --auto-servernum --server-num=1 code --wait --log trace --disable-workspace-trust --disable-gpu --disable-lcd-text --no-sandbox --user-data-dir /roo/.vscode --password-store="basic" -n ${workspaceDir}`

	console.log("🚀 Запуск VS Code...")
	console.log(`Команда: ${codeCommand}`)

	const subprocess = execa({ env, shell: "/bin/bash", cancelSignal })`${codeCommand}`

	// Добавляем обработчики для вывода VS Code
	subprocess.stdout?.on("data", (data) => {
		console.log("VS Code stdout:", data.toString().trim())
	})
	subprocess.stderr?.on("data", (data) => {
		console.log("VS Code stderr:", data.toString().trim())
	})

	// Ждем запуска VS Code
	console.log("⏳ Ожидание запуска VS Code...")
	await new Promise((resolve) => setTimeout(resolve, 5000))

	// Подключаемся к IPC сокету
	console.log("🔌 Подключение к IPC сокету...")
	let client: IpcClient | undefined = undefined
	let attempts = 10

	while (attempts > 0) {
		try {
			client = new IpcClient(ipcSocketPath)
			await pWaitFor(() => client!.isReady, { interval: 500, timeout: 2000 })
			console.log("✅ Подключение к IPC установлено")
			break
		} catch (error) {
			client?.disconnect()
			attempts--
			console.log(`⏳ Попытка подключения не удалась, осталось попыток: ${attempts}`)

			if (attempts <= 0) {
				console.error(`❌ Не удалось подключиться к IPC сокету: ${ipcSocketPath}`)
				throw new Error("Unable to connect to IPC socket")
			}

			await new Promise((resolve) => setTimeout(resolve, 1000))
		}
	}

	if (!client) {
		return
	}

	let taskStarted = false
	let taskCompleted = false
	let taskAborted = false
	let isClientDisconnected = false

	// Настраиваем обработчики событий
	client.on(IpcMessageType.TaskEvent, async (taskEvent: TaskEvent) => {
		const { eventName, payload } = taskEvent

		if (eventName !== RooCodeEventName.TaskTokenUsageUpdated) {
          console.log(`📨 Событие: ${eventName}`, payload)
        }

		switch (eventName) {
			case RooCodeEventName.TaskStarted:
				taskStarted = true
				console.log("🎯 Задача запущена")
				break

			case RooCodeEventName.TaskCompleted:
				taskCompleted = true
				console.log("✅ Задача завершена")
				break

			case RooCodeEventName.TaskAborted:
				taskAborted = true
				console.log("🛑 Задача прервана")
				break

			case RooCodeEventName.Message:
				if (payload[0] && payload[0].message && !payload[0].message.partial) {
					console.log("💬 Сообщение от Roo Code:", payload[0].message.text)
				}
				break

			case RooCodeEventName.TaskTokenUsageUpdated:
				const tokenUsage = payload[1]
				if (tokenUsage) {
					//console.log(`📊 Использование токенов: входящие=${tokenUsage.totalTokensIn}, исходящие=${tokenUsage.totalTokensOut}, стоимость=${tokenUsage.totalCost}`)
				}
				break
		}
	})

	client.on(IpcMessageType.Disconnect, () => {
		console.log("🔌 Отключение от IPC сокета")
		isClientDisconnected = true
	})

	// Отправляем команду для запуска задачи
	console.log("📤 Отправка команды для запуска задачи...")
	console.log("🔍 Конфигурация:", rooConfig)
	client.sendCommand({
		commandName: TaskCommandName.StartNewTask,
		data: {
			configuration: rooConfig,
			text: taskText,
			newTab: true,
		},
	})

	// Ждем завершения задачи
	console.log("⏳ Ожидание завершения задачи...")
	try {
		await pWaitFor(() => taskCompleted || taskAborted || isClientDisconnected, {
			interval: 1000,
			timeout: EVALS_TIMEOUT,
		})
	} catch (error) {
		console.error("⏰ Превышено время ожидания выполнения задачи")

		// Пытаемся отменить задачу
		if (taskStarted && !isClientDisconnected) {
			console.log("🛑 Отмена задачи...")
			client.sendCommand({
				commandName: TaskCommandName.CancelTask,
				data: taskId,
			})
			await new Promise((resolve) => setTimeout(resolve, 3000))
		}
	}

	// Очистка
	if (!isClientDisconnected) {
		console.log("🧹 Отключение от IPC...")
		client.disconnect()
	}

	console.log("🛑 Завершение VS Code...")
	controller.abort()

	// Ждем завершения subprocess с timeout
	try {
		console.log("⏳ Ожидание завершения VS Code...")
		await Promise.race([
			subprocess,
			new Promise((_, reject) => setTimeout(() => reject(new Error("VS Code завершение по timeout")), 10000)),
		])
		console.log("✅ VS Code завершен")
	} catch (error) {
		console.log("⚠️ VS Code завершен с ошибкой или по timeout:", error)

		// Принудительно завершаем процесс если он все еще работает
		if (!subprocess.killed) {
			console.log("💀 Принудительное завершение VS Code...")
			subprocess.kill("SIGKILL")

			// Даем время на завершение
			await new Promise((resolve) => setTimeout(resolve, 2000))
		}
	}

	console.log("🎉 Выполнение задачи завершено")

	// Принудительно завершаем Node.js процесс
	console.log("🔚 Завершение процесса...")
	process.exit(0)
}