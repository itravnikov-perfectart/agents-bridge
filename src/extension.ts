import { RooCodeEventName } from "@roo-code/types";
import * as vscode from "vscode";
import { TaskEvent } from "./server/types";
import { logger } from "./utils/logger";
import { getSystemInfo } from "./utils/systemInfo";

import { Commands } from "./commands";
import { ExtensionController } from "./core/controller";

let controller: ExtensionController;

// Single controller approach - no tree view needed

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug("Extension activation started agent maestro");

  // Show activation message
  vscode.window.showInformationMessage("Agent Maestro extension activated!");
  logger.info("Extension activated successfully agent maestro");

  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri?.path || "";
  controller = new ExtensionController(initialWorkspacePath);

  logger.debug(
    "agent maestro: controller",
    JSON.stringify(controller, null, 2),
    ":initialWorkspacePath:",
    initialWorkspacePath,
  );

  // Initialize the extension controller
  try {
    await controller.initialize();
  } catch (error) {
    logger.error("Failed to initialize extension controller:", error);
    vscode.window.showErrorMessage(
      `Agent Maestro: Failed to initialize - ${(error as Error).message}`,
    );
  }

  try {
    // Register commands
    const disposables = [
      vscode.commands.registerCommand(Commands.GetStatus, () => {
        try {
          if (!controller) {
            throw new Error("Controller not initialized");
          }
          const systemInfo = getSystemInfo(controller);
          const agentId = controller.getAgentId();
          const statusMessage = {
            ...systemInfo,
            agentId: agentId,
            workspacePath: controller.getWorkspacePath(),
            isConnected: controller.isWebSocketConnected()
          };
          vscode.window.showInformationMessage(
            JSON.stringify(statusMessage, null, 2),
          );
        } catch (error) {
          logger.error("Error retrieving system information:", error);
          vscode.window.showErrorMessage(
            `Failed to get system status: ${(error as Error).message}`,
          );
        }
      }),

      vscode.commands.registerCommand(Commands.SendToRoo, async () => {
        try {
          if (!controller) {
            throw new Error("Controller not initialized");
          }
          const adapter = controller.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          }

          // Запрашиваем количество задач
          const taskCountStr = await vscode.window.showInputBox({
            prompt: "How many tasks do you want to send?",
            placeHolder: "1",
          });
          if (!taskCountStr) {
            return;
          }

          const taskCount = parseInt(taskCountStr);
          if (isNaN(taskCount) || taskCount < 1) {
            throw new Error("Invalid number of tasks");
          }

          // Собираем сообщения для каждой задачи
          const messages: string[] = [];
          for (let i = 0; i < taskCount; i++) {
            const message = await vscode.window.showInputBox({
              prompt: `Enter message for task ${i + 1}`,
              placeHolder: "Your message...",
            });
            if (!message) {
              return;
            } // Отмена ввода
            messages.push(message);
          }

          const workspacePath = controller.getWorkspacePath();
          const taskIds = messages.map(
            (_, i) =>
              `task-${Date.now()}-${i}-${workspacePath.replace(/\W/g, "-")}`,
          );

          // Create output channel for all tasks
          const outputChannel = vscode.window.createOutputChannel(
            `RooCode Tasks ${taskIds[0]}...`,
          );
          outputChannel.show();
          outputChannel.appendLine(
            `Starting ${taskCount} tasks in workspace: ${workspacePath}`,
          );

          // Run all tasks in parallel
          const taskOptions = messages.map((message, i) => ({
            workspacePath,
            taskId: taskIds[i],
            text: message,
            metadata: {
              source: "vscode-extension",
              controllerId: controller.getWorkspacePath(),
            },
          }));

          const taskStreams = adapter.executeRooTasks(taskOptions);

          // Process results of all tasks
          for await (const taskEvents of taskStreams) {
            const taskId = taskEvents[0]?.data?.taskId || "unknown-task";
            try {
              for (const event of taskEvents) {
                outputChannel.appendLine(
                  `[${taskId}] [${event.name}] ${JSON.stringify(event.data)}`,
                );
                if (event.name === RooCodeEventName.Message) {
                  const messageEvent =
                    event as TaskEvent<RooCodeEventName.Message>;
                  if (messageEvent.data.message?.text) {
                    outputChannel.appendLine(
                      `[${taskId}] Result: ${messageEvent.data.message.text}`,
                    );
                    await vscode.commands.executeCommand(
                      Commands.ExecuteRooResult,
                      messageEvent.data.message.text,
                    );
                  }
                }
              }
            } catch (error) {
              outputChannel.appendLine(`[${taskId}] Error: ${error}`);
            }
          }
        } catch (error) {
          logger.error("Error sending message to RooCode:", error);
          vscode.window.showErrorMessage(
            `Failed to send message to RooCode: ${(error as Error).message}`,
          );
        }
      }),

      vscode.commands.registerCommand(
        Commands.ExecuteRooResult,
        async (result: string) => {
          try {
            if (!controller) {
              throw new Error("Controller not initialized");
            }
            const adapter = controller.getRooAdapter();
            if (!adapter) {
              throw new Error("No active RooCode adapter found");
            }
            // Use existing sendMessage functionality
            for await (const event of adapter.sendMessage(result)) {
              if (event.name === RooCodeEventName.Message) {
                const messageEvent =
                  event as TaskEvent<RooCodeEventName.Message>;
                if (messageEvent.data.message?.text) {
                  vscode.window.showInformationMessage(
                    `RooCode response: ${messageEvent.data.message.text}`,
                  );
                }
              }
            }
            vscode.window.showInformationMessage(
              "RooCode result processed successfully",
            );
          } catch (error) {
            logger.error("Error executing RooCode result:", error);
            vscode.window.showErrorMessage(
              `Failed to execute RooCode result: ${(error as Error).message}`,
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        Commands.SaveRooCodeSettings,
        async () => {
          try {
            if (!controller) {
              throw new Error("Controller not initialized");
            }
            const adapter = controller.getRooAdapter();
            if (!adapter) {
              throw new Error("No active RooCode adapter found");
            }

            // Получить текущие настройки
            const currentConfig = adapter.getConfiguration();

            // Показать диалог для редактирования
            const newConfig = await vscode.window.showInputBox({
              prompt: "Enter RooCode settings (JSON format)",
              value: JSON.stringify(currentConfig, null, 2),
            });

            if (newConfig) {
              await adapter.setConfiguration(JSON.parse(newConfig));
              vscode.window.showInformationMessage(
                "RooCode settings saved successfully",
              );
            }
          } catch (error) {
            logger.error("Error saving RooCode settings:", error);
            vscode.window.showErrorMessage(
              `Failed to save settings: ${(error as Error).message}`,
            );
          }
        },
      ),

      vscode.commands.registerCommand(Commands.ConnectToWSServer, async () => {
        try {
          if (!controller) {
            throw new Error("Controller not initialized");
          }
          const adapter = controller.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          }

          // Получить текущие настройки
          const wsPort = controller.getWsPort();
          logger.info("Current config:", JSON.stringify(wsPort, null, 2));
          const port = await vscode.window.showInputBox({
            prompt: "Enter WebSocket server port",
            placeHolder: wsPort.toString(),
            value: wsPort.toString(),
          });
          if (!port) {
            throw new Error("No port provided");
          }
          controller.connectToWSServer(parseInt(port));
        } catch (error) {
          logger.error("Error connecting to WebSocket server:", error);
          vscode.window.showErrorMessage(
            `Failed to connect to WebSocket server: ${(error as Error).message}`,
          );
        }
      }),
    ];

    context.subscriptions.push(...disposables);

    return controller;
  } catch (error) {
    logger.error("Error during extension activation:", error);
    vscode.window.showErrorMessage(
      `Agent Maestro: Error during activation - ${(error as Error).message}`,
    );
    throw error;
  }
}

// This method is called when your extension is deactivated
export async function deactivate() {
  try {
    if (controller) {
      await controller.dispose();
      logger.info("Controller disposed");
    }
  } catch (error) {
    logger.error("Error during deactivation:", error);
  }
}
