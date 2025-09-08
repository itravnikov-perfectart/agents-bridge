import { v4 as uuidv4 } from 'uuid';

export const generateId = (): string => uuidv4();

export const getTimestamp = (): number => Date.now();

export const isValidWorkspacePath = (path: string): boolean => {
  return path.length > 0 && !path.includes('..');
};

export const sanitizeAgentId = (id: string): string => {
  return id.replace(/[^a-zA-Z0-9-_]/g, '');
};
