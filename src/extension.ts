import { RooCodeEventName } from "@roo-code/types";
import * as vscode from "vscode";
import { TaskEvent } from "./server/types";
import { logger } from "./utils/logger";
import { getSystemInfo } from "./utils/systemInfo";

import { Commands } from "./commands";
import { ControllerManager } from "./core/controller";

let controllerManager = new ControllerManager();

class ControllerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly controllerId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(controllerId, collapsibleState);
    this.tooltip = controllerId;
    this.contextValue = "controller";
  }
}

class ControllerTreeProvider
  implements vscode.TreeDataProvider<ControllerTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ControllerTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ControllerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ControllerTreeItem): Thenable<ControllerTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    const controllers = controllerManager.getControllerIds();
    return Promise.resolve(
      controllers.map(
        (id) =>
          new ControllerTreeItem(id, vscode.TreeItemCollapsibleState.None),
      ),
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug("Extension activation started agent maestro");

  // Register tree view
  const treeProvider = new ControllerTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "agentMaestroControllers",
      treeProvider,
    ),
  );

  // Register activity bar icon
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(server) Agent Maestro";
  statusBarItem.tooltip = "Manage Agent Maestro Controllers";
  statusBarItem.command = "agent-maestro.showControllers";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Show activation message
  vscode.window.showInformationMessage("Agent Maestro extension activated!");
  logger.info("Extension activated successfully agent maestro");

  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri?.path || "";
  const defaultController = controllerManager.createController(
    "default",
    initialWorkspacePath,
  );

  logger.debug(
    "agent maestro: controllerManager",
    JSON.stringify(defaultController, null, 2),
    ":initialWorkspacePath:",
    initialWorkspacePath,
  );

  // Initialize the extension controller
  try {
    await defaultController.initialize();
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
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const systemInfo = getSystemInfo(activeController);
          vscode.window.showInformationMessage(
            JSON.stringify(systemInfo, null, 2),
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
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const adapter = activeController.getRooAdapter();
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

          const workspacePath = activeController.getWorkspacePath();
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
              controllerId: activeController.getWorkspacePath(),
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
            const activeController = controllerManager.getActiveController();
            if (!activeController) {
              throw new Error("No active controller");
            }
            const adapter = activeController.getRooAdapter();
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
            const activeController = controllerManager.getActiveController();
            if (!activeController) {
              throw new Error("No active controller");
            }
            const adapter = activeController.getRooAdapter();
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
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const port = await vscode.window.showInputBox({
            prompt: "Enter WebSocket server port",
            placeHolder: "8080",
            value: "8080",
          });
          if (!port) {
            throw new Error("No port provided");
          }
          activeController.connectToWSServer(parseInt(port));
        } catch (error) {
          logger.error("Error connecting to WebSocket server:", error);
          vscode.window.showErrorMessage(
            `Failed to connect to WebSocket server: ${(error as Error).message}`,
          );
        }
      }),
    ];

    context.subscriptions.push(...disposables);

    return controllerManager.getActiveController();
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
    await controllerManager.dispose();
    logger.info("All controllers disposed");
  } catch (error) {
    logger.error("Error during deactivation:", error);
  }
}
