import * as vscode from "vscode";

export interface AgentConfiguration {
  defaultRooIdentifier: string;
  wsUrl: string;
  wsPingInterval: number;
}

/**
 * Configuration keys used in VS Code workspace configuration
 */
export const CONFIG_KEYS = {
  DEFAULT_ROO_IDENTIFIER: "agent-bridge.defaultRooIdentifier",
  WS_URL: "agent-bridge.wsUrl",
  WS_PING_INTERVAL: "agent-bridge.wsPingInterval",
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AgentConfiguration = {
  defaultRooIdentifier: "rooveterinaryinc.roo-cline",
  wsUrl: "ws://localhost:8080",
  wsPingInterval: 10000,
};

/**
 * Reads the current configuration from VS Code workspace settings
 */
export const readConfiguration = (): AgentConfiguration => {
  const config = vscode.workspace.getConfiguration();

  return {
    defaultRooIdentifier: config.get<string>(
      CONFIG_KEYS.DEFAULT_ROO_IDENTIFIER,
      DEFAULT_CONFIG.defaultRooIdentifier,
    ),
    wsUrl: config.get<string>(
      CONFIG_KEYS.WS_URL,
      DEFAULT_CONFIG.wsUrl,
    ),
    wsPingInterval: config.get<number>(
      CONFIG_KEYS.WS_PING_INTERVAL,
      DEFAULT_CONFIG.wsPingInterval,
    ),
  };
};
