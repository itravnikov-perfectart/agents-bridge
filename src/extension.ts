import * as vscode from "vscode";
import * as path from "path";
import { logger } from "./utils/logger";
import { getSystemInfo } from "./utils/systemInfo";
import { RooCodeEventName } from "@roo-code/types";
import { TaskEvent } from "./server/types";

import { ControllerManager } from "./core/controller";

let controllerManager = new ControllerManager();

export async function activate(context: vscode.ExtensionContext) {
  process.on('unhandledRejection', (error) => {
  vscode.window.showErrorMessage(`Unhandled error: ${error}`);
});
  // Debug activation flow
  logger.debug('Extension activation started agent maestro');

  // Show activation message after a brief delay when VS Code is focused
   try {
    // Пробуем показать сразу
    vscode.window.showInformationMessage('Agent Maestro extension activated!');
  } catch (err) {
    setTimeout(async () => {
      vscode.window.showInformationMessage('Agent Maestro extension activated!');
    }, 1000);
  }

  logger.info('Extension activated successfully agent maestro');
      
  // Initialize the extension controller with Redis config
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  };
  
  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.path || '';
  const defaultController = controllerManager.createController(
    'default',
    redisConfig,
    initialWorkspacePath
  );
  
  logger.debug('agent maestro: controllerManager', defaultController, ":initialWorkspacePath:", initialWorkspacePath);
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
      vscode.commands.registerCommand("agents-bridge.helloWorld", async () => {
        logger.debug('Hello World from agents-bridge!');
        vscode.window.showInformationMessage("Hello World from agents-bridge!");
        logger.debug('Hello World from agents-bridge!');
      }),
      vscode.commands.registerCommand("agent-maestro.createController", async () => {
        try {
          const id = await vscode.window.showInputBox({
            prompt: 'Enter controller ID',
            placeHolder: 'controller-id'
          });
          if (!id) {
            return;
          }  
          
          const path = await vscode.window.showInputBox({
            prompt: 'Enter workspace path',
            placeHolder: '/path/to/workspace'
          });
          if (!path) {
            return;
          }
          logger.debug('Hello World from agents-bridge!::', path);
          const controller = controllerManager.createController(id, redisConfig, path);
          await controller.initialize();
          vscode.window.showInformationMessage(`Created controller ${id} for workspace ${path}`);
        } catch (error) {
          logger.error("Error creating controller:", error);
          vscode.window.showErrorMessage(
            `Failed to create controller: ${(error as Error).message}`
          );
        }
      }),
      
      vscode.commands.registerCommand("agent-maestro.switchController", async () => {
        try {
          const controllers = controllerManager.getControllerIds();
          if (controllers.length === 0) {
            throw new Error("No controllers available");
          }
          
          const selected = await vscode.window.showQuickPick(controllers, {
            placeHolder: 'Select controller to activate'
          });
          if (selected && controllerManager.setActiveController(selected)) {
            vscode.window.showInformationMessage(`Active controller set to: ${selected}`);
          }
        } catch (error) {
          logger.error("Error switching controllers:", error);
          vscode.window.showErrorMessage(
            `Failed to switch controller: ${(error as Error).message}`
          );
        }
      }),
      
      vscode.commands.registerCommand("agent-maestro.setWorkspacePath", async () => {
        try {
          const controller = controllerManager.getActiveController();
          if (!controller) {
            throw new Error("No active controller");
          }
          
          const path = await vscode.window.showInputBox({
            prompt: 'Enter workspace path manually',
            placeHolder: '/path/to/workspace'
          });
          if (path) {
            controller.setWorkspacePath(path);
            vscode.window.showInformationMessage(`Workspace path set to: ${path}`);
          }
        } catch (error) {
          logger.error("Error setting workspace path:", error);
          vscode.window.showErrorMessage(
            `Failed to set workspace path: ${(error as Error).message}`
          );
        }
      }),
      vscode.commands.registerCommand("agent-maestro.getStatus", () => {
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
      vscode.commands.registerCommand("agent-maestro.sendToRoo", async () => {
        try {
          const controller = controllerManager.getActiveController();
          if (!controller) {
            throw new Error("No active controller");
          }
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const adapter = activeController.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          };

          // Сначала запрашиваем сообщение
          const message = await vscode.window.showInputBox({
            prompt: 'Введите сообщение для RooCode',
            placeHolder: 'Ваше сообщение...'
          });

          if (!message) {
            return; // Отмена ввода
          }

          for await (const event of adapter.sendMessage(message)) {
            if (event.name === RooCodeEventName.Message) {
              const messageEvent = event as TaskEvent<RooCodeEventName.Message>;
              if (messageEvent.data.message?.text) {
                await vscode.commands.executeCommand(
                  "agent-maestro.executeRooResult",
                  messageEvent.data.message.text
                );
              }
            }
          };
        } catch (error) {
          logger.error("Error sending message to RooCode:", error);
          vscode.window.showErrorMessage(
            `Failed to send message to RooCode: ${(error as Error).message}`,
          );
        }
      }),

      vscode.commands.registerCommand("agent-maestro.executeRooResult", async (result: string) => {
        try {
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const adapter = activeController.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          };
          // Use existing sendMessage functionality
          for await (const event of adapter.sendMessage(result)) {
            if (event.name === RooCodeEventName.Message) {
              const messageEvent = event as TaskEvent<RooCodeEventName.Message>;
              if (messageEvent.data.message?.text) {
                vscode.window.showInformationMessage(
                  `RooCode response: ${messageEvent.data.message.text}`
                );
              }
            }
          };
          vscode.window.showInformationMessage("RooCode result processed successfully");
        } catch (error) {
          logger.error("Error executing RooCode result:", error);
          vscode.window.showErrorMessage(
            `Failed to execute RooCode result: ${(error as Error).message}`,
          );
        }
      }),
      vscode.commands.registerCommand("agent-maestro.saveRooCodeSettings", async () => {
        try {
          const activeController = controllerManager.getActiveController();
          if (!activeController) {
            throw new Error("No active controller");
          }
          const adapter = activeController.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          };
          
          // Получить текущие настройки
          const currentConfig = adapter.getConfiguration();
          
          // Показать диалог для редактирования
          const newConfig = await vscode.window.showInputBox({
            prompt: 'Enter RooCode settings (JSON format)',
            value: JSON.stringify(currentConfig, null, 2)
          });
          
          if (newConfig) {
            await adapter.setConfiguration(JSON.parse(newConfig));
            vscode.window.showInformationMessage("RooCode settings saved successfully");
          }
        } catch (error) {
          logger.error("Error saving RooCode settings:", error);
          vscode.window.showErrorMessage(
            `Failed to save settings: ${(error as Error).message}`,
          );
        }
      }),
      vscode.commands.registerCommand("agent-maestro.showUI", () => {
        const panel = vscode.window.createWebviewPanel(
          'agentMaestroUI',
          'Agent Maestro',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        // Get path to compiled UI files
        const scriptPath = vscode.Uri.file(
          path.join(context.extensionPath, 'dist/ui/index.js')
        );
        const scriptUri = panel.webview.asWebviewUri(scriptPath);

        panel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Maestro</title>
          </head>
          <body>
            <div id="root"></div>
            <script src="${scriptUri}"></script>
          </body>
          </html>
        `;
      })
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
