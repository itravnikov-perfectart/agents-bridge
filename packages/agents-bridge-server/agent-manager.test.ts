import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {AgentManager} from './agent-manager';

class MockSocket {
  readyState = 1;
  sent: string[] = [];
  close = vi.fn();
  send = vi.fn((msg: string) => {
    this.sent.push(msg);
  });
}

describe('AgentManager', () => {
  let manager: AgentManager;
  let socket: MockSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new MockSocket();
    manager = new AgentManager(1000, 2);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('registers and retrieves agent', () => {
    const id = manager.registerAgent(socket as any, '/tmp');
    const agent = manager.getAgent(id);
    expect(agent?.workspacePath).toBe('/tmp');
  });

  it('sends heartbeat pings after grace period', () => {
    const id = manager.registerAgent(socket as any);
    // end grace period
    vi.advanceTimersByTime(30000);
    manager.sendHeartbeatPings();
    expect(socket.send).toHaveBeenCalled();
    expect(manager.getAgent(id)).toBeDefined();
  });

  it('removes agent on heartbeat timeout', () => {
    const id = manager.registerAgent(socket as any);
    vi.advanceTimersByTime(30000); // end grace
    // force lastHeartbeat far in past
    const agent = manager.getAgent(id)!;
    agent.lastHeartbeat = Date.now() - 100000;
    manager.checkHealth();
    expect(manager.getAgent(id)).toBeUndefined();
  });
});
