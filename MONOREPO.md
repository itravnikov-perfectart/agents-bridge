# Agents Bridge Monorepo Structure

This project is organized as a monorepo using pnpm workspaces for better dependency management and code sharing.

## Package Structure

```
packages/
├── agents-bridge-shared/     # Shared types, utilities, and validation
├── agents-bridge-extension/  # VS Code extension
├── agents-bridge-server/     # WebSocket server
└── agents-bridge-ui/         # React UI interface
```

## Development Commands

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

## Package Dependencies

### agents-bridge-shared
- Contains common types, enums, and utility functions
- Used by all other packages
- Exports validation schemas using Zod
- Provides helper functions for common operations

### agents-bridge-extension
- VS Code extension package
- Depends on `agents-bridge-shared`
- Builds using esbuild for fast compilation

### agents-bridge-server
- WebSocket server implementation
- Depends on `agents-bridge-shared`
- Uses Express and WebSocket libraries

### agents-bridge-ui
- React-based UI interface
- Depends on `agents-bridge-shared`
- Built with Vite and TypeScript

## Workspace Configuration

The monorepo uses pnpm workspaces with the following configuration:
- `pnpm-workspace.yaml` - Defines workspace packages
- `tsconfig.json` - Project references for TypeScript
- `.eslintrc.js` - Shared ESLint configuration
- `.prettierrc` - Shared Prettier configuration

## Adding New Packages

To add a new package:
1. Create a new directory in `packages/`
2. Add a `package.json` with `"private": true`
3. Include `"agents-bridge-shared": "workspace:*"` in dependencies if needed
4. Add the package to root `tsconfig.json` references
5. Run `pnpm install` to update workspace

## Building and Development

1. Install dependencies: `pnpm install`
2. Build shared package first: `pnpm --filter agents-bridge-shared run build`
3. Build other packages: `pnpm build`
4. Start development: `pnpm dev`
