# Agents Bridge

A VS Code extension, WebSocket server, and UI interface for managing AI agents and tasks.

## 🏗️ Project Structure

This project is organized as a **monorepo** using pnpm workspaces for better dependency management and code sharing.

```
packages/
├── agents-bridge-shared/     # Shared types, utilities, and validation
├── agents-bridge-extension/  # VS Code extension
├── agents-bridge-server/     # WebSocket server
└── agents-bridge-ui/         # React UI interface
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm build

# Start development mode for all packages
pnpm dev
```

## 📦 Package Commands

### Root Level Commands

- `pnpm build` - Build all packages
- `pnpm dev` - Start development mode for all packages
- `pnpm lint` - Lint all packages
- `pnpm clean` - Clean build artifacts from all packages
- `pnpm type-check` - Type check all packages

### Package-Specific Commands

- `pnpm extension:build` - Build the VS Code extension
- `pnpm server:dev` - Start the WebSocket server in development mode
- `pnpm ui:dev` - Start the UI in development mode
- `pnpm ui:build` - Build the UI

## 🏛️ Architecture

### agents-bridge-shared

- **Purpose**: Common types, enums, and utility functions
- **Usage**: Imported by all other packages
- **Features**:
  - Type definitions for messages, agents, and tasks
  - Validation schemas using Zod
  - Helper functions for common operations

### agents-bridge-extension

- **Purpose**: VS Code extension for agent management
- **Features**:
  - Tree view for agents and tasks
  - Webview panels for task interaction
  - Integration with RooCode extension
- **Build**: Uses esbuild for fast compilation

### agents-bridge-server

- **Purpose**: WebSocket server for real-time communication
- **Features**:
  - Agent registration and management
  - Task coordination
  - Message routing between UI and agents
- **Dependencies**: Express, WebSocket, shared types

### agents-bridge-ui

- **Purpose**: React-based web interface
- **Features**:
  - Real-time agent monitoring
  - Task management interface
  - Chat interface for agent interaction
- **Tech Stack**: React, TypeScript, Vite, Tailwind CSS

## 🔧 Development

### Adding New Packages

1. Create a new directory in `packages/`
2. Add a `package.json` with `"private": true`
3. Include `"agents-bridge-shared": "workspace:*"` in dependencies if needed
4. Add the package to root `tsconfig.json` references
5. Run `pnpm install` to update workspace

### Code Sharing

- **Types**: Define in `agents-bridge-shared/src/types/`
- **Utilities**: Add to `agents-bridge-shared/src/utils/`
- **Validation**: Use Zod schemas in `agents-bridge-shared/src/utils/validation.ts`

### Building Order

1. Build shared package first: `pnpm --filter agents-bridge-shared run build`
2. Build other packages: `pnpm build`

## 📚 Documentation

- [Monorepo Structure](MONOREPO.md) - Detailed monorepo documentation
- [API Reference](docs/api.md) - API documentation (coming soon)
- [Development Guide](docs/development.md) - Development guidelines (coming soon)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure all packages build: `pnpm build`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.
