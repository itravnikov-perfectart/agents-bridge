import * as vscode from 'vscode';

export interface AgentConfiguration {
  defaultRooIdentifier: string;
  wsUrl: string;
  wsPingInterval: number;
  agentId?: string;
}

/**
 * Configuration keys used in VS Code workspace configuration
 */
export const CONFIG_KEYS = {
  DEFAULT_ROO_IDENTIFIER: 'agent-bridge.defaultRooIdentifier',
  WS_URL: 'agent-bridge.wsUrl',
  WS_PING_INTERVAL: 'agent-bridge.wsPingInterval',
  AGENT_ID: 'agent-bridge.agentId'
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AgentConfiguration = {
  defaultRooIdentifier: 'RooVeterinaryInc.roo-cline',
  wsUrl: 'ws://localhost:8080',
  wsPingInterval: 10000,
  agentId: undefined
};

/**
 * Reads the current configuration from VS Code workspace settings
 */
export const readConfiguration = (): AgentConfiguration => {
  const config = vscode.workspace.getConfiguration();

  return {
    defaultRooIdentifier: config.get<string>(
      CONFIG_KEYS.DEFAULT_ROO_IDENTIFIER,
      DEFAULT_CONFIG.defaultRooIdentifier
    ),
    wsUrl: config.get<string>(CONFIG_KEYS.WS_URL, DEFAULT_CONFIG.wsUrl),
    wsPingInterval: config.get<number>(CONFIG_KEYS.WS_PING_INTERVAL, DEFAULT_CONFIG.wsPingInterval),
    agentId: config.get<string>(CONFIG_KEYS.AGENT_ID, DEFAULT_CONFIG.agentId ?? '')
  };
};

/**
 * Updates a configuration value programmatically
 * @param key Configuration key to update
 * @param value New value
 * @param isGlobal Whether to update global (true) or workspace (false) settings
 */
export const updateConfiguration = async (
  key: keyof typeof CONFIG_KEYS,
  value: string | number,
  isGlobal: boolean = true
): Promise<void> => {
  const config = vscode.workspace.getConfiguration();
  const configKey = CONFIG_KEYS[key];

  try {
    await config.update(
      configKey,
      value,
      isGlobal ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace
    );
  } catch (error) {
    throw new Error(`Failed to update configuration ${configKey}: ${error}`);
  }
};

/**
 * Resets configuration to default values
 */
export const resetConfiguration = async (isGlobal: boolean = true): Promise<void> => {
  const config = vscode.workspace.getConfiguration();
  const target = isGlobal
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;

  try {
    await Promise.all([
      config.update(CONFIG_KEYS.DEFAULT_ROO_IDENTIFIER, undefined, target),
      config.update(CONFIG_KEYS.WS_URL, undefined, target),
      config.update(CONFIG_KEYS.WS_PING_INTERVAL, undefined, target)
    ]);
  } catch (error) {
    throw new Error(`Failed to reset configuration: ${error}`);
  }
};
