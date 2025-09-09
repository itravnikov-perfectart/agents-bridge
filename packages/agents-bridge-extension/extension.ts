import * as vscode from 'vscode';
import {logger} from './utils/logger';
import {Commands} from './commands';
import {ExtensionController} from './core/controller';

let extensionController: ExtensionController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug('Extension activation started');

  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.path || '';

  // Create the extension controller
  extensionController = new ExtensionController(initialWorkspacePath);

  logger.debug('Extension controller created with workspace path:', initialWorkspacePath);

  // Ensure controller (and RooCode adapter) is initialized before handling commands or WS
  try {
    await extensionController.initialize();

    // Auto-connect to WebSocket server after initialization
    extensionController.connectToWSServer();
  } catch (err) {
    logger.error('Controller initialization failed:', err);
  }

  // Register commands
  const disposables = [
    vscode.commands.registerCommand(Commands.GetStatus, async () => {
      try {
        if (!extensionController) {
          throw new Error('Extension controller not initialized');
        }

        const adapter = extensionController.getRooAdapter();
        if (!adapter) {
          vscode.window.showInformationMessage('No RooCode adapter available');
          return;
        }

        const status = {
          isReady: adapter.isReady(),
          lastHeartbeat: adapter.lastHeartbeat,
          activeTaskIds: adapter.getActiveTaskIds(),
          extensionId: adapter.getExtensionId(),
          taskHistory: adapter.getTaskHistory()
        };

        vscode.window.showInformationMessage(`RooCode Status: ${JSON.stringify(status, null, 2)}`);
      } catch (error) {
        logger.error('Error getting status:', error);
        vscode.window.showErrorMessage(`Failed to get status: ${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(Commands.GetAllTasks, async () => {
      try {
        if (!extensionController) {
          throw new Error('Extension controller not initialized');
        }

        const adapter = extensionController.getRooAdapter();
        if (!adapter) {
          vscode.window.showInformationMessage('No RooCode adapter available');
          return;
        }

        const history = adapter.getTaskHistory();
        vscode.window.showInformationMessage(
          `RooCode Task History: ${JSON.stringify(history, null, 2)}`
        );
      } catch (error) {
        logger.error('Error getting task history:', error);
        vscode.window.showErrorMessage(`Failed to get tasks: ${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(Commands.SendToRoo, async () => {
      try {
        const message = await vscode.window.showInputBox({
          prompt: 'Enter message to send to RooCode',
          placeHolder: 'Type your message here...'
        });

        if (!message) {
          return;
        }

        if (!extensionController) {
          throw new Error('Extension controller not initialized');
        }

        await extensionController.sendToRooCode(message);
        vscode.window.showInformationMessage('Message sent to RooCode successfully');
      } catch (error) {
        logger.error('Error sending message to RooCode:', error);
        vscode.window.showErrorMessage(`Failed to send message: ${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(Commands.ConnectToWSServer, async () => {
      try {
        if (!extensionController) {
          throw new Error('Extension controller not initialized');
        }

        // Connect the controller to the WebSocket server
        extensionController.connectToWSServer();
        vscode.window.showInformationMessage(`Connecting to WebSocket server...`);
      } catch (error) {
        logger.error('Error connecting to WebSocket server:', error);
        vscode.window.showErrorMessage(`Failed to connect: ${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(Commands.ReconnectToWSServer, async () => {
      try {
        if (!extensionController) {
          throw new Error('Extension controller not initialized');
        }
        extensionController.connectToWSServer();
        vscode.window.showInformationMessage(`Reconnecting to WebSocket server on ...`);
      } catch (error) {
        logger.error('Error reconnecting to WebSocket server:', error);
        vscode.window.showErrorMessage(`Failed to reconnect: ${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(Commands.ShowPanel, () => {
      vscode.window.showInformationMessage('Agent Bridge panel would be shown here');
    })
  ];

  // Register all disposables
  context.subscriptions.push(...disposables);

  // Show activation message
  vscode.window.showInformationMessage('Agent Bridge extension activated!');
  logger.info('Extension activated successfully');
}

export function deactivate() {
  if (extensionController) {
    extensionController.dispose();
  }
  logger.info('Extension deactivated');
}
