# Agents Bridge - RooCode Integration

A bridge extension for integrating with RooCode AI assistant. Provides two-way communication and result execution capabilities.

## Features

- **RooCode Integration**: Seamless communication with RooCode extension
- **Result Execution**: Automatically execute commands and results from RooCode
- **Configuration**: Customizable settings for integration behavior

## Commands

- `agent-maestro.getStatus`: Show extension status
- `agent-maestro.sendToRoo`: Send message to RooCode
- `agent-maestro.executeRooResult`: Execute result from RooCode (internal)

## Configuration

```json
{
  "agentMaestro.rooCodeIntegration": true,
  "agentMaestro.rooCodeIdentifier": "roo-code",
  "agentMaestro.autoExecuteResults": true
}
```

## Requirements

- RooCode extension installed
- VS Code 1.102.0 or higher

## Extension Settings

Enable/disable RooCode integration through the settings UI or workspace settings.

## Usage Examples

### 1. Sending a message to RooCode
```javascript
// In your extension code:
await vscode.commands.executeCommand(
  'agent-maestro.sendToRoo',
  'Analyze this code and suggest improvements'
);
```

### 2. Receiving and executing results
RooCode can return results in two formats:

**Simple command:**
```json
"vscode.open"
```

**Structured command:**
```json
{
  "type": "execute",
  "command": "vscode.open",
  "args": ["file:///path/to/file"]
}
```

### 3. Checking extension status
```javascript
// Get current status
const status = await vscode.commands.executeCommand('agent-maestro.getStatus');
console.log(status);
```

### 4. Keybindings (add to keybindings.json)
```json
{
  "command": "agent-maestro.sendToRoo",
  "key": "ctrl+alt+r",
  "when": "editorTextFocus"
}
```

### 5. Configuration example (settings.json)
```json
{
  "agentMaestro.rooCodeIntegration": true,
  "agentMaestro.autoExecuteResults": true,
  "agentMaestro.rooCodeIdentifier": "roo-code-pro"
}
```
