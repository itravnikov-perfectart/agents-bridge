export type Task = {
  id: string;
  agentId: string;
  name?: string;
  isNewTask?: boolean;
  isCompleted?: boolean;
  parentTaskId?: string;
  isSubtask?: boolean;
  level?: number; // 0 for main tasks, 1+ for subtasks
}
