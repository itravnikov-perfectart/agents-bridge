import { RooCodeEventName } from "@roo-code/types";
import * as vscode from "vscode";
import { TaskEvent } from "./core/types";
import { logger } from "./utils/logger";

import { Commands } from "./commands";
import { ExtensionController } from "./core/controller";

let controller: ExtensionController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug("Extension activation started agent maestro");


  // Register activity bar icon
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(server) Agent Bridge";
  statusBarItem.tooltip = "Manage Agent Bridge Controllers";
  statusBarItem.command = "agent-bridge.showControllers";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Show activation message
  vscode.window.showInformationMessage("Agent Maestro extension activated!");
  logger.info("Extension activated successfully agent maestro");

  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri?.path || "";
  controller = new ExtensionController(initialWorkspacePath);


  logger.debug(
    "agent bridge: controller",
    controller,
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
      // vscode.commands.registerCommand(Commands.CreateController, async () => {
      //   try {
      //     const id = await vscode.window.showInputBox({
      //       prompt: "Enter controller ID",
      //       placeHolder: "controller-id",
      //     });
      //     if (!id) {
      //       return;
      //     }

      //     const path = await vscode.window.showInputBox({
      //       prompt: "Enter workspace path",
      //       placeHolder: "/path/to/workspace",
      //     });
      //     if (!path) {
      //       return;
      //     }
      //     const controller = controllerManager.createController(
      //       id,
      //       redisConfig,
      //       path,
      //     );
      //     await controller.initialize();
      //     vscode.window.showInformationMessage(
      //       `Created controller ${id} for workspace ${path}`,
      //     );
      //   } catch (error) {
      //     logger.error("Error creating controller:", error);
      //     vscode.window.showErrorMessage(
      //       `Failed to create controller: ${(error as Error).message}`,
      //     );
      //   }
      // }),

      // vscode.commands.registerCommand(Commands.SwitchController, async () => {
      //   try {
      //     const controllers = controllerManager.getControllerIds();
      //     if (controllers.length === 0) {
      //       throw new Error("No controllers available");
      //     }

      //     const selected = await vscode.window.showQuickPick(controllers, {
      //       placeHolder: "Select controller to activate",
      //     });
      //     if (selected && controllerManager.setActiveController(selected)) {
      //       context.globalState.update("lastActiveController", selected);
      //       vscode.window.showInformationMessage(
      //         `Active controller set to: ${selected}`,
      //       );
      //     }
      //   } catch (error) {
      //     logger.error("Error switching controllers:", error);
      //     vscode.window.showErrorMessage(
      //       `Failed to switch controller: ${(error as Error).message}`,
      //     );
      //   }
      // }),

      // vscode.commands.registerCommand(Commands.SetWorkspacePath, async () => {
      //   try {
      //     const controller = controllerManager.getActiveController();
      //     if (!controller) {
      //       throw new Error("No active controller");
      //     }

      //     const path = await vscode.window.showInputBox({
      //       prompt: "Enter workspace path manually",
      //       placeHolder: "/path/to/workspace",
      //     });
      //     if (path) {
      //       controller.setWorkspacePath(path);
      //       vscode.window.showInformationMessage(
      //         `Workspace path set to: ${path}`,
      //       );
      //     }
      //   } catch (error) {
      //     logger.error("Error setting workspace path:", error);
      //     vscode.window.showErrorMessage(
      //       `Failed to set workspace path: ${(error as Error).message}`,
      //     );
      //   }
      // }),

      // vscode.commands.registerCommand(Commands.GetStatus, () => {
      //   try {
      //     const activeController = controllerManager.getActiveController();
      //     if (!activeController) {
      //       throw new Error("No active controller");
      //     }
      //     const systemInfo = getSystemInfo(activeController);
      //     vscode.window.showInformationMessage(
      //       JSON.stringify(systemInfo, null, 2),
      //     );
      //   } catch (error) {
      //     logger.error("Error retrieving system information:", error);
      //     vscode.window.showErrorMessage(
      //       `Failed to get system status: ${(error as Error).message}`,
      //     );
      //   }
      // }),

      vscode.commands.registerCommand(Commands.SendToRoo, async () => {
      //   try {
          if (!controller) {
            throw new Error("No active controller");
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
              controllerId: controller?.getWorkspacePath(),
            },
          }));

          const taskStreams = adapter.executeRooTasks(taskOptions);

      //     // Process results of all tasks
      //     for await (const taskEvents of taskStreams) {
      //       const taskId = taskEvents[0]?.data?.taskId || "unknown-task";
      //       try {
      //         for (const event of taskEvents) {
      //           outputChannel.appendLine(
      //             `[${taskId}] [${event.name}] ${JSON.stringify(event.data)}`,
      //           );
      //           if (event.name === RooCodeEventName.Message) {
      //             const messageEvent =
      //               event as TaskEvent<RooCodeEventName.Message>;
      //             if (messageEvent.data.message?.text) {
      //               outputChannel.appendLine(
      //                 `[${taskId}] Result: ${messageEvent.data.message.text}`,
      //               );
      //               await vscode.commands.executeCommand(
      //                 Commands.ExecuteRooResult,
      //                 messageEvent.data.message.text,
      //               );
      //             }
      //           }
      //         }
      //       } catch (error) {
      //         outputChannel.appendLine(`[${taskId}] Error: ${error}`);
      //       }
      //     }
      //   } catch (error) {
      //     logger.error("Error sending message to RooCode:", error);
      //     vscode.window.showErrorMessage(
      //       `Failed to send message to RooCode: ${(error as Error).message}`,
      //     );
      //   }
      }),

      vscode.commands.registerCommand(Commands.ExecuteRooResult,
        async (result: string) => {
          try {
            if (!controller) {
              throw new Error("No active controller");
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

      // vscode.commands.registerCommand(Commands.SaveRooCodeSettings,
      //   async () => {
      //     try {
      //       const activeController = controllerManager.getActiveController();
      //       if (!activeController) {
      //         throw new Error("No active controller");
      //       }
      //       const adapter = activeController.getRooAdapter();
      //       if (!adapter) {
      //         throw new Error("No active RooCode adapter found");
      //       }

      //       // Получить текущие настройки
      //       const currentConfig = adapter.getConfiguration();

      //       // Показать диалог для редактирования
      //       const newConfig = await vscode.window.showInputBox({
      //         prompt: "Enter RooCode settings (JSON format)",
      //         value: JSON.stringify(currentConfig, null, 2),
      //       });

      //       if (newConfig) {
      //         await adapter.setConfiguration(JSON.parse(newConfig));
      //         vscode.window.showInformationMessage(
      //           "RooCode settings saved successfully",
      //         );
      //       }
      //     } catch (error) {
      //       logger.error("Error saving RooCode settings:", error);
      //       vscode.window.showErrorMessage(
      //         `Failed to save settings: ${(error as Error).message}`,
      //       );
      //     }
      //   },
      // ),

      // vscode.commands.registerCommand(Commands.ShowPanel, () => {
      //   // Create and show panel
      //   const panel = vscode.window.createWebviewPanel(
      //     "agentMaestroPanel",
      //     "Agent Maestro Controllers",
      //     vscode.ViewColumn.One,
      //     {
      //       enableScripts: true,
      //       retainContextWhenHidden: true,
      //     },
      //   );

      //   // Get all controllers with their workspace paths
      //   const controllers = controllerManager.getControllerIds().map((id) => ({
      //     id,
      //     workspace:
      //       controllerManager.getController(id)?.getWorkspacePath() || "",
      //   }));
      //   const activeControllerId = controllerManager
      //     .getActiveController()
      //     ?.getWorkspacePath();

      //   // Simple HTML for debugging
      //   panel.webview.html = `
      //     <!DOCTYPE html>
      //     <html>
      //     <head>
      //       <style>
      //         body {
      //           font-family: var(--vscode-font-family);
      //           padding: 20px;
      //         }
      //         .controller {
      //           padding: 10px;
      //           margin-bottom: 10px;
      //           border: 1px solid var(--vscode-editorWidget-border);
      //         }
      //         .active {
      //           background-color: var(--vscode-list-activeSelectionBackground);
      //         }
      //       </style>
      //     </head>
      //     <body>
      //       <h2>Agent Maestro Controllers (Debug)</h2>
      //       <div id="controllers">
      //         ${controllers
      //           .map(
      //             (ctrl) => `
      //           <div class="controller ${ctrl.id === activeControllerId ? "active" : ""}">
      //             <div><strong>${ctrl.id}</strong></div>
      //             <div>${ctrl.workspace}</div>
      //             <button onclick="activateController('${ctrl.id}')">Activate</button>
      //             <button onclick="removeController('${ctrl.id}')">Remove</button>
      //           </div>
      //         `,
      //           )
      //           .join("")}
      //       </div>

      //       <script>
      //         const vscode = acquireVsCodeApi();
      //         function activateController(id) {
      //           vscode.postMessage({ command: 'activate', id });
      //         }
      //         function removeController(id) {
      //           vscode.postMessage({ command: 'remove', id });
      //         }
      //       </script>
      //     </body>
      //     </html>
      //   `;

      //   // Store panel reference for output updates
      //   const currentPanel = panel;

      //   // Handle messages from webview
      //   panel.webview.onDidReceiveMessage((message) => {
      //     switch (message.command) {
      //       case "activate":
      //         controllerManager.setActiveController(message.id);
      //         panel.dispose();
      //         break;
      //       case "remove":
      //         if (
      //           controllerManager.getActiveController()?.getWorkspacePath() ===
      //           message.id
      //         ) {
      //           vscode.window.showErrorMessage(
      //             "Cannot remove active controller",
      //           );
      //         } else {
      //           controllerManager.removeController(message.id);
      //           panel.webview.html = panel.webview.html; // Refresh view
      //         }
      //         break;
      //       case "sendMessage":
      //         vscode.commands.executeCommand(
      //           Commands.SendToRoo,
      //           message.message,
      //         );
      //         break;
      //     }
      //   });
      // }),

      // vscode.commands.registerCommand(Commands.RefreshControllers, () => {
      //   treeProvider.refresh();
      // }),

      // vscode.commands.registerCommand(Commands.ControllerActions,
      //   (item: ControllerTreeItem) => {
      //     const quickPick = vscode.window.createQuickPick();
      //     quickPick.items = [
      //       {
      //         label: "$(debug-start) Activate",
      //         description: "Set as active controller",
      //       },
      //       { label: "$(trash) Remove", description: "Delete this controller" },
      //       { label: "$(info) Status", description: "Show controller status" },
      //     ];
      //     quickPick.onDidChangeSelection((selection) => {
      //       if (selection[0]) {
      //         switch (selection[0].label) {
      //           case "$(debug-start) Activate":
      //             controllerManager.setActiveController(item.controllerId);
      //             treeProvider.refresh();
      //             vscode.window.showInformationMessage(
      //               `Controller ${item.controllerId} activated`,
      //             );
      //             break;
      //           case "$(trash) Remove":
      //             if (
      //               controllerManager
      //                 .getActiveController()
      //                 ?.getWorkspacePath() === item.controllerId
      //             ) {
      //               vscode.window.showErrorMessage(
      //                 "Cannot remove active controller",
      //               );
      //             } else {
      //               controllerManager.removeController(item.controllerId);
      //               treeProvider.refresh();
      //             }
      //             break;
      //           case "$(info) Status":
      //             const controller = controllerManager.getController(
      //               item.controllerId,
      //             );
      //             if (controller) {
      //               const status = getSystemInfo(controller);
      //               vscode.window.showInformationMessage(
      //                 JSON.stringify(status, null, 2),
      //               );
      //             }
      //             break;
      //         }
      //       }
      //       quickPick.dispose();
      //     });
      //     quickPick.show();
      //   },
      // ),

      vscode.commands.registerCommand(Commands.ConnectToWSServer, async () => {
        try {
          if (!controller) {
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
    controller?.dispose(); 
    logger.info("All controllers disposed");
  } catch (error) {
    logger.error("Error during deactivation:", error);
  }
}
