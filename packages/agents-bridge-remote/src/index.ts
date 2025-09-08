#!/usr/bin/env node

import { createWriteStream } from 'fs';
import * as path from "path"
import { execa } from "execa"

class ContainerManager {
  private isShuttingDown = false;
  private logStream = createWriteStream('/tmp/container.log', { flags: 'a' });
  private workspaceDir = path.resolve("/tmp", "task-workspace")

  constructor() {
    this.log('🚀 Container Manager starting...');
  }

  private log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${message}`;
    console.log(logMessage);
    this.logStream.write(logMessage + '\n');
  }

  private async startVsCode(): Promise<void> {
    const controller = new AbortController()
    const cancelSignal = controller.signal
  
    // Команда для запуска VS Code
    const codeCommand = `xvfb-run --auto-servernum --server-num=1 code --wait --log trace --disable-workspace-trust --disable-gpu --disable-lcd-text --no-sandbox --user-data-dir /app/.vscode --password-store="basic" -n ${this.workspaceDir}`
  
    console.log("🚀 Запуск VS Code...")
    console.log(`Команда: ${codeCommand}`)
  
    const subprocess = execa({ shell: "/bin/bash", cancelSignal })`${codeCommand}`
  
    // Добавляем обработчики для вывода VS Code
    subprocess.stdout?.on("data", (data) => {
      console.log("VS Code stdout:", data.toString().trim())
    })
    subprocess.stderr?.on("data", (data) => {
      console.log("VS Code stderr:", data.toString().trim())
    })

    	// Ждем запуска VS Code
      console.log("⏳ Ожидание запуска VS Code...")
      await new Promise((resolve) => setTimeout(resolve, 5000))
  }


  public async start(): Promise<void> {
    try {
      // Set environment variables
      process.env.DONT_PROMPT_WSL_INSTALL = '1';

      this.log('🎉 Container Manager started successfully');
      this.log('💡 Container is now running and waiting for commands.');
      this.log('📡 Agents Bridge Extension can connect to WebSocket server');
      this.log('🔄 Container will run until shutdown command is received');
      this.log('');
      this.log('📋 To manually shutdown container, create file: /tmp/container-shutdown-signal');

      this.startVsCode();
      
      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      this.log(`❌ Failed to start services: ${error}`);
      this.shutdown();
    }
  }

  private keepAlive(): void {
    // Keep the process alive by periodic health checks
    const checkInterval = setInterval(() => {
      if (this.isShuttingDown) {
        clearInterval(checkInterval);
        return;
      }

      // Log heartbeat every minute
      this.log('💓 Container heartbeat - still running...');
    }, 60000); // Log every minute

    this.log('♾️  Container is now running indefinitely...');
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.log('🛑 Shutting down container...');

    // Close log stream
    this.logStream.end();

    // Exit gracefully
    setTimeout(() => {
      this.log('✅ Container shutdown complete');
      process.exit(0);
    }, 2000);
  }
}

// Start the container manager
const manager = new ContainerManager();
manager.start().catch((error) => {
  console.error('Failed to start container:', error);
  process.exit(1);
});
