import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Task } from "agents-bridge-shared"

export const getTasksByAgentId = (agentId: string | null) => {
  return queryOptions({
    queryKey: ['tasks', 'list', agentId],
    queryFn: () => [] as Task[],
    enabled: !!agentId
  })
}

export const useTasksByAgentId = (agentId: string | null) => {
  return useQuery(getTasksByAgentId(agentId || ''));
}

type AddTaskRequest = {
  agentId: string;
  task: Task;
}

export const useAddTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: AddTaskRequest) => {
      queryClient.setQueryData(getTasksByAgentId(request.agentId).queryKey, (old: Task[] | undefined) => {
        // Check if task already exists to prevent duplicates
        if (old?.some(task => task.id === request.task.id)) {
          return old;
        }
        return [...(old || []), request.task];
      })
      return Promise.resolve()
    }
  })
}

type AddTasksRequest = {
  agentId: string;
  tasks: Task[];
}

export const useAddTasks = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: AddTasksRequest) => {
      queryClient.setQueryData(getTasksByAgentId(request.agentId).queryKey, (old: Task[] | undefined) => {
        const existingTasks = old || [];
        const newTasks = request.tasks.filter(task => !existingTasks.some(t => t.id === task.id));
        
        // Merge new tasks with existing ones, but don't override active tasks with completed ones
        const mergedTasks = [...existingTasks];
        newTasks.forEach(newTask => {
          const existingIndex = mergedTasks.findIndex(t => t.id === newTask.id);
          if (existingIndex >= 0) {
            // Update existing task but preserve completion status if it's already active
            const existingTask = mergedTasks[existingIndex];
            if (!existingTask.isCompleted && newTask.isCompleted) {
              // Don't override active task with completed one
              return;
            }
            mergedTasks[existingIndex] = { ...existingTask, ...newTask };
          } else {
            mergedTasks.push(newTask);
          }
        });
        
        return mergedTasks;
      })
      return Promise.resolve()
    }
  })
}

type UpdateTaskRequest = {
  agentId: string;
  taskId: string;
  task: Task;
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: UpdateTaskRequest) => {
      queryClient.setQueryData(getTasksByAgentId(request.agentId).queryKey, 
      (old: Task[] | undefined) => old?.map(task => task.id === request.taskId ? { ...task, ...request.task } : task) || [])
      return Promise.resolve()
    }
  })
}
