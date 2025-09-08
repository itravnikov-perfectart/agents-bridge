import { z } from 'zod';

export const AgentSchema = z.object({
  id: z.string(),
  workspacePath: z.string(),
  status: z.enum(['connected', 'disconnected', 'timeout']),
  lastHeartbeat: z.number(),
  connectedAt: z.number(),
});

export const TaskSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string().optional(),
  isNewTask: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  parentTaskId: z.string().optional(),
  isSubtask: z.boolean().optional(),
  level: z.number().optional(),
});

export const MessageSchema = z.object({
  type: z.string(),
  source: z.string(),
  timestamp: z.number().optional(),
  agent: z.object({
    id: z.string().optional(),
    workspacePath: z.string().optional(),
  }).optional(),
  data: z.record(z.any()).optional(),
  event: z.any().optional(),
});

export type ValidatedAgent = z.infer<typeof AgentSchema>;
export type ValidatedTask = z.infer<typeof TaskSchema>;
export type ValidatedMessage = z.infer<typeof MessageSchema>;
