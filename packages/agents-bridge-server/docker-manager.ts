import {spawn, exec} from 'child_process';
import {promisify} from 'util';
import {logger} from './serverLogger';
import path from 'path';

const execAsync = promisify(exec);

export interface RemoteAgentContainer {
  id: string;
  containerId?: string;
  name: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  port?: number;
  workspacePath?: string;
  createdAt: number;
  error?: string;
}

export class DockerManager {
  private containers = new Map<string, RemoteAgentContainer>();
  private nextPort = 3001; // Starting port for remote agents

  constructor() {
    this.loadExistingContainers();
  }

  async createRemoteAgent(agentId: string, workspacePath?: string): Promise<RemoteAgentContainer> {
    const port = this.nextPort++;
    const containerName = `agents-bridge-remote-${agentId}`;

    const container: RemoteAgentContainer = {
      id: agentId,
      name: containerName,
      status: 'creating',
      port,
      workspacePath: workspacePath || `/tmp/workspace-${agentId}`,
      createdAt: Date.now()
    };

    this.containers.set(agentId, container);
    logger.info(`Creating remote agent container: ${containerName}`);

    try {
      // Build the Docker image if it doesn't exist
      await this.ensureDockerImage();

      // Create and start the container
      const dockerArgs = [
        'run',
        '-d',
        '--name',
        containerName,
        '--rm',
        '-p',
        `${port}:3000`,
        '-e',
        'AGENTS_BRIDGE_WS_URL=ws://host.docker.internal:8080',
        '-e',
        `WORKSPACE_PATH=${container.workspacePath}`,
        '-e',
        `AGENT_ID=${agentId}`,
        '-v',
        `${container.workspacePath}:/workspace`,
        '--add-host',
        'host.docker.internal:host-gateway',
        'agents-bridge-remote'
      ];

      const {stdout} = await execAsync(`docker ${dockerArgs.join(' ')}`);
      const containerId = stdout.trim();

      container.containerId = containerId;
      container.status = 'running';

      logger.info(`Remote agent container created successfully: ${containerName} (${containerId})`);
      return container;
    } catch (error) {
      logger.error(`Failed to create remote agent container: ${containerName}`, error);
      container.status = 'error';
      container.error = error instanceof Error ? error.message : 'Unknown error';
      return container;
    }
  }

  async stopRemoteAgent(agentId: string): Promise<boolean> {
    const container = this.containers.get(agentId);
    if (!container) {
      logger.warn(`Remote agent container not found: ${agentId}`);
      return false;
    }

    try {
      if (container.containerId) {
        await execAsync(`docker stop ${container.containerId}`);
        logger.info(`Remote agent container stopped: ${container.name}`);
      }

      container.status = 'stopped';
      this.containers.delete(agentId);
      return true;
    } catch (error) {
      logger.error(`Failed to stop remote agent container: ${container.name}`, error);
      container.status = 'error';
      container.error = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  getRemoteAgents(): RemoteAgentContainer[] {
    return Array.from(this.containers.values());
  }

  getRemoteAgent(agentId: string): RemoteAgentContainer | undefined {
    return this.containers.get(agentId);
  }

  private async ensureDockerImage(): Promise<void> {
    try {
      // Check if image exists
      await execAsync('docker image inspect agents-bridge-remote');
      logger.info('Docker image agents-bridge-remote already exists');
    } catch (error) {
      logger.info('Docker image agents-bridge-remote not found, building...');

      // Build the image from the agents-bridge-remote directory
      const buildPath = path.join(__dirname, '../../agents-bridge-remote');
      const buildCommand = `docker build -t agents-bridge-remote -f ${buildPath}/Dockerfile ${path.join(__dirname, '../../..')}`;

      logger.info(`Building Docker image with command: ${buildCommand}`);

      const buildProcess = spawn(
        'docker',
        [
          'build',
          '-t',
          'agents-bridge-remote',
          '-f',
          `${buildPath}/Dockerfile`,
          path.join(__dirname, '../../..')
        ],
        {
          stdio: 'pipe'
        }
      );

      return new Promise((resolve, reject) => {
        let output = '';

        buildProcess.stdout?.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          logger.info(`Docker build: ${chunk.trim()}`);
        });

        buildProcess.stderr?.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          logger.warn(`Docker build stderr: ${chunk.trim()}`);
        });

        buildProcess.on('close', (code) => {
          if (code === 0) {
            logger.info('Docker image built successfully');
            resolve();
          } else {
            logger.error(`Docker build failed with code ${code}: ${output}`);
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        buildProcess.on('error', (error) => {
          logger.error('Docker build process error:', error);
          reject(error);
        });
      });
    }
  }

  private async loadExistingContainers(): Promise<void> {
    try {
      // Get all running containers with our naming pattern
      const {stdout} = await execAsync(
        'docker ps --filter "name=agents-bridge-remote-" --format "{{.Names}}\t{{.ID}}\t{{.Status}}"'
      );

      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const [name, containerId, status] = line.split('\t');
          const agentId = name.replace('agents-bridge-remote-', '');

          const container: RemoteAgentContainer = {
            id: agentId,
            containerId,
            name,
            status: status.includes('Up') ? 'running' : 'stopped',
            createdAt: Date.now()
          };

          this.containers.set(agentId, container);
          logger.info(`Found existing remote agent container: ${name} (${containerId})`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load existing containers:', error);
    }
  }

  async cleanup(): Promise<void> {
    const containers = Array.from(this.containers.keys());
    for (const agentId of containers) {
      await this.stopRemoteAgent(agentId);
    }
  }
}
