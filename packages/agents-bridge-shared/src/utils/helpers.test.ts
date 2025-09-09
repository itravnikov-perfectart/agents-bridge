import {describe, it, expect, vi} from 'vitest';
import {generateId, getTimestamp, isValidWorkspacePath, sanitizeAgentId} from './helpers';

describe('helpers', () => {
  it('generateId returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getTimestamp returns increasing numbers', () => {
    const a = getTimestamp();
    const b = getTimestamp();
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('isValidWorkspacePath validates correctly', () => {
    expect(isValidWorkspacePath('/tmp')).toBe(true);
    expect(isValidWorkspacePath('')).toBe(false);
    expect(isValidWorkspacePath('../evil')).toBe(false);
  });

  it('sanitizeAgentId removes invalid characters', () => {
    expect(sanitizeAgentId('abc-123_')).toBe('abc-123_');
    expect(sanitizeAgentId('a!b@c#')).toBe('abc');
  });
});
