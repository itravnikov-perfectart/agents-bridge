import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Task } from "../types/task.types"

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
      queryClient.setQueryData(getTasksByAgentId(request.agentId).queryKey, (old: Task[] | undefined) => [...(old || []), request.task])
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
      queryClient.setQueryData(getTasksByAgentId(request.agentId).queryKey, (old: Task[] | undefined) => [...(old || []), ...request.tasks.filter(task => !old?.some(t => t.id === task.id))])
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
      (old: Task[] | undefined) => old?.map(task => task.id === request.taskId ? request.task : task) || [])
      return Promise.resolve()
    }
  })
}
