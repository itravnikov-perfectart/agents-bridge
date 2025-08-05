import * as vscode from "vscode";
import { logger } from "./utils/logger";
import { ExtensionController } from "./core/controller";
import { getSystemInfo } from "./utils/systemInfo";
import { readConfiguration } from "./utils/config";
import { RooCodeEventName } from "@roo-code/types";
import { TaskEvent } from "./server/types";

let controller: ExtensionController;

export async function activate(context: vscode.ExtensionContext) {
  // Only show logger automatically in development mode
  const isDevMode = context.extensionMode === vscode.ExtensionMode.Development;
  if (isDevMode) {
    logger.show();
  }

  // Initialize the extension controller
  controller = new ExtensionController();

  try {
    await controller.initialize();
  } catch (error) {
    logger.error("Failed to initialize extension controller:", error);
    vscode.window.showErrorMessage(
      `Agent Maestro: Failed to initialize - ${(error as Error).message}`,
    );
  }

  // Get configuration
  const config = readConfiguration();

  try {
    // Register commands
    const disposables = [
      vscode.commands.registerCommand("agent-maestro.getStatus", () => {
        try {
          const systemInfo = getSystemInfo(controller);
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
      vscode.commands.registerCommand("agent-maestro.sendToRoo", async (message: string) => {
        try {
          const adapter = controller.getRooAdapter();
          if (!adapter) {
            throw new Error("No active RooCode adapter found");
          }
          
          for await (const event of adapter.sendMessage(message)) {
            if (event.name === RooCodeEventName.Message) {
              const messageEvent = event as TaskEvent<RooCodeEventName.Message>;
              if (messageEvent.data.message?.text) {
                await vscode.commands.executeCommand(
                  `agent-maestro.executeRooResult-${adapter['extensionId']}`,
                  messageEvent.data.message.text
                );
              }
            }
          }
        } catch (error) {
          logger.error("Error sending message to RooCode:", error);
          vscode.window.showErrorMessage(
            `Failed to send message to RooCode: ${(error as Error).message}`,
          );
        }
      }),
      vscode.commands.registerCommand("agent-maestro.startProcess", async (command: string) => {
        try {
          const process = controller.wqMaestroAdapter.startProcess({
            command: command
          });
          
          for await (const event of process) {
            if (event.type === "processOutput") {
              vscode.window.showInformationMessage(
                `Process output: ${event.data}`
              );
            }
          }
        } catch (error) {
          logger.error("Error starting process:", error);
          vscode.window.showErrorMessage(
            `Failed to start process: ${(error as Error).message}`,
          );
        }
      }),
      vscode.commands.registerCommand("agent-maestro.listProcesses", async () => {
        try {
          const processes = await controller.wqMaestroAdapter.listProcesses();
          vscode.window.showInformationMessage(
            `Active processes: ${processes.join(", ")}`
          );
        } catch (error) {
          logger.error("Error listing processes:", error);
          vscode.window.showErrorMessage(
            `Failed to list processes: ${(error as Error).message}`,
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
      logger.info("Extension controller disposed");
    }
  } catch (error) {
    logger.error("Error during deactivation:", error);
  }
}
