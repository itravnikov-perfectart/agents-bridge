import * as vscode from "vscode";
import { logger } from "./utils/logger";
import { Commands } from "./commands";
import { ExtensionController } from "./core/controller";

let extensionController: ExtensionController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // Debug activation flow
  logger.debug("Extension activation started");

  // Initialize with either VSCode workspace or empty path
  const initialWorkspacePath =
    vscode.workspace.workspaceFolders?.[0]?.uri?.path || "";
  
  // Create the extension controller
  extensionController = new ExtensionController(initialWorkspacePath);

  logger.debug(
    "Extension controller created with workspace path:",
    initialWorkspacePath,
  );

  // Register commands
  const disposables = [
    vscode.commands.registerCommand(Commands.GetStatus, async () => {
      try {
        if (!extensionController) {
          throw new Error("Extension controller not initialized");
        }
        
        const adapter = extensionController.getRooAdapter();
        if (!adapter) {
          vscode.window.showInformationMessage("No RooCode adapter available");
          return;
        }

        const status = {
          isReady: adapter.isReady(),
          lastHeartbeat: adapter.lastHeartbeat,
          activeTaskIds: adapter.getActiveTaskIds(),
          extensionId: adapter.getExtensionId(),
        };

        vscode.window.showInformationMessage(
          `RooCode Status: ${JSON.stringify(status, null, 2)}`
        );
      } catch (error) {
        logger.error("Error getting status:", error);
        vscode.window.showErrorMessage(
          `Failed to get status: ${(error as Error).message}`
        );
      }
    }),

    vscode.commands.registerCommand(Commands.SendToRoo, async () => {
      try {
        const message = await vscode.window.showInputBox({
          prompt: "Enter message to send to RooCode",
          placeHolder: "Type your message here...",
        });

        if (!message) {
          return;
        }

        if (!extensionController) {
          throw new Error("Extension controller not initialized");
        }

        await extensionController.sendToRooCode(message);
        vscode.window.showInformationMessage("Message sent to RooCode successfully");
      } catch (error) {
        logger.error("Error sending message to RooCode:", error);
        vscode.window.showErrorMessage(
          `Failed to send message: ${(error as Error).message}`
        );
      }
    }),

    vscode.commands.registerCommand(Commands.ConnectToWSServer, async () => {
      try {
        const port = await vscode.window.showInputBox({
          prompt: "Enter WebSocket server port",
          placeHolder: "8080",
          value: "8080",
        });

        if (!port) {
          return;
        }

        if (!extensionController) {
          throw new Error("Extension controller not initialized");
        }

        // Connect the controller to the WebSocket server
        extensionController.connectToWSServer(parseInt(port, 10));
        vscode.window.showInformationMessage(
          `Connecting to WebSocket server on port ${port}...`
        );
      } catch (error) {
        logger.error("Error connecting to WebSocket server:", error);
        vscode.window.showErrorMessage(
          `Failed to connect: ${(error as Error).message}`
        );
      }
    }),

    // Legacy alias for backward compatibility with older command ids
    vscode.commands.registerCommand('agent-maestro.connectToWSServer', async () => {
      await vscode.commands.executeCommand(Commands.ConnectToWSServer);
    }),

    vscode.commands.registerCommand(Commands.ShowPanel, () => {
      vscode.window.showInformationMessage("Agent Bridge panel would be shown here");
    }),
  ];

  // Register all disposables
  context.subscriptions.push(...disposables);

  // Show activation message
  vscode.window.showInformationMessage("Agent Bridge extension activated!");
  logger.info("Extension activated successfully");
}

export function deactivate() {
  if (extensionController) {
    extensionController.dispose();
  }
  logger.info("Extension deactivated");
}
