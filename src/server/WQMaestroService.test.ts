import { WQMaestroService } from './WQMaestroService';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Docker from 'dockerode';
import { WebSocket } from 'ws';

// Mock Dockerode
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      ping: vi.fn().mockResolvedValue(true),
      createContainer: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        inspect: vi.fn().mockResolvedValue({
          Id: 'test-container-id',
          Name: '/test-container',
          State: { Running: true }
        })
      })),
      getContainer: vi.fn().mockImplementation(() => ({
        stop: vi.fn(),
        remove: vi.fn(),
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false }
        })
      }))
    }))
  };
});

// Mock WebSocket client
vi.mock('ws', () => {
  const WebSocketMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn()
  }));
  return { WebSocket: WebSocketMock };
});

describe('WQMaestroService', () => {
  let service: WQMaestroService;

  beforeAll(async () => {
    service = new WQMaestroService(8081, {
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    await service.stop();
  });

  it('should start and stop container', async () => {
    const containerId = await service.startProcess({
      command: 'echo',
      args: ['hello'],
      image: 'alpine'
    });

    expect(containerId).toBeTruthy();
    
    await service.stopProcess(containerId);
    const status = await service.getProcessStatus(containerId);
    expect(status.status).toBe('stopped');
  });

  it('should list running processes', async () => {
    const processes = await service.listProcesses();
    expect(Array.isArray(processes)).toBeTruthy();
  });
});

describe('WQMaestroService Error Handling', () => {
  let service: WQMaestroService;

  beforeAll(async () => {
    service = new WQMaestroService(8081, {
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    await service.stop();
  });

  it('should handle container start errors', async () => {
    await expect(service.startProcess({
      command: 'nonexistent',
      args: [],
      image: 'invalid-image'
    })).rejects.toThrow();
  });

  it('should handle invalid container stop', async () => {
    await expect(service.stopProcess('invalid-id'))
      .rejects.toThrow('Container not found');
  });
});

describe('WQMaestroService WebSocket', () => {
  let service: WQMaestroService;

  beforeAll(async () => {
    service = new WQMaestroService(8081, {
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    await service.stop();
  });

  it('should establish WebSocket connection', async () => {
    const ws = await service.createWebSocketConnection('test-client');
    expect(ws).toBeTruthy();
    ws.close();
  });

  it('should reject unauthorized connections', async () => {
    await expect(service.createWebSocketConnection('invalid-client', 'wrong-token'))
      .rejects.toThrow('Unauthorized');
  });
});

describe('WQMaestroService WebSocket Errors', () => {
  let service: WQMaestroService;

  beforeAll(async () => {
    service = new WQMaestroService(8081, {
      host: 'localhost',
      port: 6379
    });
  });

  afterAll(async () => {
    await service.stop();
  });

  it('should handle WebSocket connection errors', async () => {
    const mockWs = new WebSocket('ws://localhost:8081');
    mockWs.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'error') {
        cb(new Error('Connection failed'));
      }
    });

    await expect(service.createWebSocketConnection('test-client'))
      .rejects.toThrow('Connection failed');
  });

  it('should handle WebSocket authentication timeout', async () => {
    const mockWs = new WebSocket('ws://localhost:8081');
    mockWs.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'close') {
        cb(1008, 'Authentication timeout');
      }
    });

    await expect(service.createWebSocketConnection('test-client'))
      .rejects.toThrow('Authentication timeout');
  });
});