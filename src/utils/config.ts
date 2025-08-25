import * as vscode from "vscode";

export interface AgentMaestroConfiguration {
  rooVariantIdentifiers: string[];
  defaultRooIdentifier: string;
  allowOutsideWorkspaceAccess: boolean;
  wsPort: number;
  wsPingInterval: number;
}

/**
 * Configuration keys used in VS Code workspace configuration
 */
export const CONFIG_KEYS = {
  ROO_VARIANT_IDENTIFIERS: "agent-maestro.rooVariantIdentifiers",
  DEFAULT_ROO_IDENTIFIER: "agent-maestro.defaultRooIdentifier",
  ALLOW_OUTSIDE_WORKSPACE_ACCESS: "agent-maestro.allowOutsideWorkspaceAccess",
  WS_PORT: "agent-maestro.wsPort",
  WS_PING_INTERVAL: "agent-maestro.wsPingInterval",
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AgentMaestroConfiguration = {
  rooVariantIdentifiers: [],
  defaultRooIdentifier: "rooveterinaryinc.roo-cline",
  allowOutsideWorkspaceAccess: false,
  wsPort: 8080,
  wsPingInterval: 10000,
};

/**
 * Reads the current configuration from VS Code workspace settings
 */
export const readConfiguration = (): AgentMaestroConfiguration => {
  const config = vscode.workspace.getConfiguration();

  return {
    rooVariantIdentifiers: config.get<string[]>(
      CONFIG_KEYS.ROO_VARIANT_IDENTIFIERS,
      DEFAULT_CONFIG.rooVariantIdentifiers,
    ),
    defaultRooIdentifier: config.get<string>(
      CONFIG_KEYS.DEFAULT_ROO_IDENTIFIER,
      DEFAULT_CONFIG.defaultRooIdentifier,
    ),
    allowOutsideWorkspaceAccess: config.get<boolean>(
      CONFIG_KEYS.ALLOW_OUTSIDE_WORKSPACE_ACCESS,
      DEFAULT_CONFIG.allowOutsideWorkspaceAccess,
    ),
    wsPort: config.get<number>(
      CONFIG_KEYS.WS_PORT,
      DEFAULT_CONFIG.wsPort,
    ),
    wsPingInterval: config.get<number>(
      CONFIG_KEYS.WS_PING_INTERVAL,
      DEFAULT_CONFIG.wsPingInterval,
    ),
  };
};
