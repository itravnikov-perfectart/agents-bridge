import * as vscode from "vscode";
import * as path from "path";
import { logger } from "./utils/logger";
import { getSystemInfo } from "./utils/systemInfo";
import { RooCodeEventName } from "@roo-code/types";
import { TaskEvent } from "./server/types";

import { ControllerManager } from "./core/controller";

let controllerManager = new ControllerManager();

class ControllerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly controllerId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(controllerId, collapsibleState);
    this.tooltip = controllerId;
    this.contextValue = "controller";
  }
}

class ControllerTreeProvider implements vscode.TreeDataProvider<ControllerTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ControllerTreeItem | undefined>();
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
      controllers.map(id => new ControllerTreeItem(
        id,
        vscode.TreeItemCollapsibleState.None
      ))
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug('Extension activation started agent maestro');

  // Register tree view
  const treeProvider = new ControllerTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'agentMaestroControllers',
      treeProvider
    )
  );

  // Register activity bar icon
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(server) Agent Maestro";
  statusBarItem.tooltip = "Manage Agent Maestro Controllers";
  statusBarItem.command = "agent-maestro.showControllers";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Show activation message
  vscode.window.showInformationMessage('Agent Maestro extension activated!');
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
        vscode.window.showInformationMessage("Hello World from agents-bridge!");
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
            context.globalState.update('lastActiveController', selected);
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

          // Получаем workspacePath из активного контроллера
          const workspacePath = activeController.getWorkspacePath();
          
          // Генерируем уникальный taskId для сообщения
          // Создаем уникальный taskId с привязкой к workspace
          const taskId = `msg-${Date.now()}-${workspacePath.replace(/\W/g, '-')}-${Math.random().toString(36).substring(2, 4)}`;
          
          // Логируем создание задачи
          logger.debug(`Creating task ${taskId} for workspace ${workspacePath}`);
          
          // Создаем и настраиваем задачу
          const taskOptions = {
            workspacePath,
            taskId,
            metadata: {
              source: 'vscode-extension',
              controllerId: activeController.getWorkspacePath()
            }
          };
          
          // Создаем новую задачу и логируем
          await adapter.startNewTask(taskOptions);
          logger.debug(`Task ${taskId} created successfully`);
          
          // Создаем output channel для задачи
          const outputChannel = vscode.window.createOutputChannel(`Task ${taskId}`);
          outputChannel.show();
          outputChannel.appendLine(`Starting task in workspace: ${workspacePath}`);
          outputChannel.appendLine(`Message: ${message}`);
          
          // Отправляем сообщение и обрабатываем события
          for await (const event of adapter.sendMessage(message, undefined, {
            taskId,
            workspacePath
          })) {
            // Логируем все события в output
            outputChannel.appendLine(`[${event.name}] ${JSON.stringify(event.data)}`);
            if (event.name === RooCodeEventName.Message) {
              const messageEvent = event as TaskEvent<RooCodeEventName.Message>;
              if (messageEvent.data.message?.text) {
                // Выводим в output канал
                outputChannel.appendLine(`Result: ${messageEvent.data.message.text}`);
                
                // Выполняем результат
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
      vscode.commands.registerCommand("agent-maestro.showPanel", () => {
        // Create and show panel
        const panel = vscode.window.createWebviewPanel(
          'agentMaestroPanel',
          'Agent Maestro Controllers',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        // Get all controllers with their workspace paths
        const controllers = controllerManager.getControllerIds().map(id => ({
          id,
          workspace: controllerManager.getController(id)?.getWorkspacePath() || ''
        }));
        const activeControllerId = controllerManager.getActiveController()?.getWorkspacePath();

        // Simple HTML for debugging
        panel.webview.html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: var(--vscode-font-family);
                padding: 20px;
              }
              .controller {
                padding: 10px;
                margin-bottom: 10px;
                border: 1px solid var(--vscode-editorWidget-border);
              }
              .active {
                background-color: var(--vscode-list-activeSelectionBackground);
              }
            </style>
          </head>
          <body>
            <h2>Agent Maestro Controllers (Debug)</h2>
            <div id="controllers">
              ${controllers.map(ctrl => `
                <div class="controller ${ctrl.id === activeControllerId ? 'active' : ''}">
                  <div><strong>${ctrl.id}</strong></div>
                  <div>${ctrl.workspace}</div>
                  <button onclick="activateController('${ctrl.id}')">Activate</button>
                  <button onclick="removeController('${ctrl.id}')">Remove</button>
                </div>
              `).join('')}
            </div>

            <script>
              const vscode = acquireVsCodeApi();
              function activateController(id) {
                vscode.postMessage({ command: 'activate', id });
              }
              function removeController(id) {
                vscode.postMessage({ command: 'remove', id });
              }
            </script>
          </body>
          </html>
        `;

        // Store panel reference for output updates
        const currentPanel = panel;
        
        // Handle messages from webview
        panel.webview.onDidReceiveMessage(message => {
          switch(message.command) {
            case 'activate':
              controllerManager.setActiveController(message.id);
              panel.dispose();
              break;
            case 'remove':
              if (controllerManager.getActiveController()?.getWorkspacePath() === message.id) {
                vscode.window.showErrorMessage('Cannot remove active controller');
              } else {
                controllerManager.removeController(message.id);
                panel.webview.html = panel.webview.html; // Refresh view
              }
              break;
            case 'sendMessage':
              vscode.commands.executeCommand(
                "agent-maestro.sendToRoo",
                message.message
              );
              break;
          }
        });
      }),
      vscode.commands.registerCommand("agent-maestro.refreshControllers", () => {
        treeProvider.refresh();
      }),
      vscode.commands.registerCommand("agent-maestro.controllerActions", (item: ControllerTreeItem) => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = [
          { label: '$(debug-start) Activate', description: 'Set as active controller' },
          { label: '$(trash) Remove', description: 'Delete this controller' },
          { label: '$(info) Status', description: 'Show controller status' }
        ];
        quickPick.onDidChangeSelection(selection => {
          if (selection[0]) {
            switch (selection[0].label) {
              case '$(debug-start) Activate':
                controllerManager.setActiveController(item.controllerId);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Controller ${item.controllerId} activated`);
                break;
              case '$(trash) Remove':
                if (controllerManager.getActiveController()?.getWorkspacePath() === item.controllerId) {
                  vscode.window.showErrorMessage('Cannot remove active controller');
                } else {
                  controllerManager.removeController(item.controllerId);
                  treeProvider.refresh();
                }
                break;
              case '$(info) Status':
                const controller = controllerManager.getController(item.controllerId);
                if (controller) {
                  const status = getSystemInfo(controller);
                  vscode.window.showInformationMessage(
                    JSON.stringify(status, null, 2)
                  );
                }
                break;
            }
          }
          quickPick.dispose();
        });
        quickPick.show();
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
