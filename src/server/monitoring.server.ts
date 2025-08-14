import express, { Express, Request, Response } from 'express';
import { ExtensionController } from '../core/controller';
import { logger } from '../utils/logger';
import Docker from 'dockerode';
import { AgentStatus } from '../core/types';

export function createMonitoringServer(controller: ExtensionController, port: number = 3001) {
  const app: Express = express();
  const docker = new Docker();
  app.use(express.json());

  // System health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now()
    });
  });

  // Agent health check endpoint
  app.get('/agents/:id/health', async (req: Request, res: Response) => {
    try {
      const agentId = req.params.id;
      const status = controller.getAgentStatus(agentId);
      
      if (!status) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Check container health if running in Docker
      let containerHealth = 'unknown';
      if (status.containerId) {
        try {
          const container = docker.getContainer(status.containerId);
          const containerInfo = await container.inspect();
          containerHealth = containerInfo.State.Health?.Status || containerInfo.State.Status;
        } catch (error) {
          containerHealth = 'unavailable';
        }
      }

      // Calculate time since last heartbeat (in seconds)
      const secondsSinceHeartbeat = status.lastHeartbeat
        ? Math.floor((Date.now() - status.lastHeartbeat) / 1000)
        : -1;

      // Determine overall health status
      const isRunning = status.state === AgentStatus.RUNNING;
      const isContainerHealthy = containerHealth === 'running' || containerHealth === 'healthy';
      const isHeartbeatFresh = secondsSinceHeartbeat <= 10; // Within 10 seconds

      res.json({
        agentId,
        status: status.state,
        lastHeartbeat: status.lastHeartbeat,
        secondsSinceHeartbeat,
        containerHealth,
        healthy: isRunning && isContainerHealthy && isHeartbeatFresh,
        details: {
          isRunning,
          isContainerHealthy,
          isHeartbeatFresh
        }
      });
    } catch (error) {
      logger.error('Failed to check agent health', error);
      res.status(500).json({ error: 'Failed to check agent health' });
    }
  });

  // Agent status endpoint
  app.get('/agents', async (req: Request, res: Response) => {
    try {
      const status = controller.getExtensionStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get agent status', error);
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  });

  // Task queue status endpoint
  app.get('/tasks', async (req: Request, res: Response) => {
    try {
      // TODO: Implement task status aggregation
      res.json({ tasks: [] });
    } catch (error) {
      logger.error('Failed to get task status', error);
      res.status(500).json({ error: 'Failed to get task status' });
    }
  });

  // Start new agent endpoint
  app.post('/api/agents', async (req: Request, res: Response) => {
    try {
      const { image, port } = req.body;
      const container = await docker.createContainer({
        Image: image,
        ExposedPorts: { '8080/tcp': {} },
        HostConfig: {
          PortBindings: {
            '8080/tcp': [{ HostPort: port.toString() }]
          }
        }
      });
      await container.start();
      res.status(201).json({ id: container.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start agent container', message);
      res.status(500).json({ error: message });
    }
  });

  // Container status endpoint
  app.get('/containers', async (req: Request, res: Response) => {
    try {
      // TODO: Implement container status aggregation
      res.json({ containers: [] });
    } catch (error) {
      logger.error('Failed to get container status', error);
      res.status(500).json({ error: 'Failed to get container status' });
    }
  });

  const server = app.listen(port, () => {
    logger.info(`Monitoring server running on port ${port}`);
  });

  return {
    server,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
    })
  };
}

export type MonitoringServer = ReturnType<typeof createMonitoringServer>;