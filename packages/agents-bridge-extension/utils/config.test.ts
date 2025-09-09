import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as vscode from 'vscode';
import {readConfiguration, CONFIG_KEYS, DEFAULT_CONFIG, updateConfiguration} from './config';

vi.mock('vscode', () => {
  const store = new Map<string, any>();
  return {
    workspace: {
      getConfiguration: () => ({
        get: (key: string, def: any) => (store.has(key) ? store.get(key) : def),
        update: async (key: string, value: any) => {
          if (value === undefined) {
            store.delete(key);
          } else {
            store.set(key, value);
          }
        }
      })
    },
    ConfigurationTarget: {Global: 1, Workspace: 2}
  } as any;
});

describe('config utils', () => {
  beforeEach(() => {
    // reset mock store by re-mocking
  });

  it('reads defaults when not set', () => {
    const cfg = readConfiguration();
    expect(cfg.defaultRooIdentifier).toBe(DEFAULT_CONFIG.defaultRooIdentifier);
    expect(cfg.wsUrl).toBe(DEFAULT_CONFIG.wsUrl);
    expect(cfg.wsPingInterval).toBe(DEFAULT_CONFIG.wsPingInterval);
  });

  it('updates configuration values', async () => {
    await updateConfiguration('WS_URL', 'ws://example');
    const cfg = readConfiguration();
    expect(cfg.wsUrl).toBe('ws://example');
  });
});
