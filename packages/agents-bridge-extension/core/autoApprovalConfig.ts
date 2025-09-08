import { RooCodeSettings } from "@roo-code/types";

/**
 * Auto-approval configuration for agents-bridge extension
 * This configuration enables all auto-approval features to turn off manual approvals
 */
export const AUTO_APPROVAL_CONFIG: RooCodeSettings = {
  // Core auto-approval settings
  autoApprovalEnabled: true,
  alwaysAllowReadOnly: true,
  alwaysAllowReadOnlyOutsideWorkspace: true,
  alwaysAllowWrite: true,
  alwaysAllowWriteOutsideWorkspace: true,
  alwaysAllowWriteProtected: true,
  writeDelayMs: 1, // Minimal delay for writes
  alwaysAllowBrowser: true,
  alwaysApproveResubmit: true,
  requestDelaySeconds: 1, // Minimal delay for requests
  alwaysAllowMcp: true,
  alwaysAllowModeSwitch: true,
  alwaysAllowSubtasks: true,
  alwaysAllowExecute: true,
  alwaysAllowFollowupQuestions: true,
  alwaysAllowUpdateTodoList: true,
  followupAutoApproveTimeoutMs: 1, // Minimal timeout for follow-up questions

  // Command execution settings
  allowedCommands: ["*"], // Allow all commands
  commandExecutionTimeout: 20,
  commandTimeoutAllowlist: [],
  preventCompletionWithOpenTodos: false,

  // Additional settings for smooth operation
  diagnosticsEnabled: true,
  diffEnabled: true,
  fuzzyMatchThreshold: 1,
  enableCheckpoints: false,
  rateLimitSeconds: 0,
  maxOpenTabsContext: 20,
  maxWorkspaceFiles: 200,
  showRooIgnoredFiles: true,
  maxReadFileLine: -1, // Enable full file reading
  includeDiagnosticMessages: true,
  maxDiagnosticMessages: 50,
  language: "en",
  telemetrySetting: "enabled",
  mcpEnabled: false,
  remoteControlEnabled: false,
  mode: "code",
  customModes: [],
};

/**
 * Creates a task configuration with auto-approval enabled
 * @param overrides Optional configuration overrides
 * @returns RooCodeSettings with auto-approval enabled
 */
export function createAutoApprovalTaskConfig(overrides: Partial<RooCodeSettings> = {}): RooCodeSettings {
  return {
    ...AUTO_APPROVAL_CONFIG,
    ...overrides,
  };
}

/**
 * Manual-approval configuration for agents-bridge extension
 * This configuration disables all auto-approval features to require manual approvals
 */
export const MANUAL_APPROVAL_CONFIG: RooCodeSettings = {
  autoApprovalEnabled: false,
  alwaysAllowReadOnly: false,
  alwaysAllowReadOnlyOutsideWorkspace: false,
  alwaysAllowWrite: false,
  alwaysAllowWriteOutsideWorkspace: false,
  alwaysAllowWriteProtected: false,
  writeDelayMs: 0,
  alwaysAllowBrowser: false,
  alwaysApproveResubmit: false,
  requestDelaySeconds: 0,
  alwaysAllowMcp: false,
  alwaysAllowModeSwitch: false,
  alwaysAllowSubtasks: false,
  alwaysAllowExecute: false,
  alwaysAllowFollowupQuestions: false,
  alwaysAllowUpdateTodoList: false,
  followupAutoApproveTimeoutMs: 0,
  allowedCommands: [],
  commandExecutionTimeout: 20,
  commandTimeoutAllowlist: [],
  preventCompletionWithOpenTodos: true,
  diagnosticsEnabled: true,
  diffEnabled: true,
  fuzzyMatchThreshold: 1,
  enableCheckpoints: false,
  rateLimitSeconds: 0,
  maxOpenTabsContext: 20,
  maxWorkspaceFiles: 200,
  showRooIgnoredFiles: true,
  maxReadFileLine: -1,
  includeDiagnosticMessages: true,
  maxDiagnosticMessages: 50,
  language: "en",
  telemetrySetting: "enabled",
  mcpEnabled: false,
  remoteControlEnabled: false,
  mode: "code",
  customModes: [],
};

/**
 * Creates a task configuration with manual-approval enforced
 * @param overrides Optional configuration overrides
 * @returns RooCodeSettings with manual approvals
 */
export function createManualApprovalTaskConfig(overrides: Partial<RooCodeSettings> = {}): RooCodeSettings {
  return {
    ...MANUAL_APPROVAL_CONFIG,
    ...overrides,
  };
}
