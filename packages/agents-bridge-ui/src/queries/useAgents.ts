import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Agent } from "agents-bridge-shared"

export const getAgents = () => {
  return queryOptions({
    queryKey: ['agents'],
    queryFn: () => [] as Agent[]
  })
}

export const useAgents = () => {
  return useQuery(getAgents());
}

export const useAddAgents = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (agents: Agent[]) => {
      queryClient.setQueryData(getAgents().queryKey, (old: Agent[] | undefined) => [...(old || []), ...agents])
      return Promise.resolve()
    }
  })
}

export const useUpdateAgents = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (agents: Agent[]) => {
      queryClient.setQueryData(getAgents().queryKey, () => agents)
      return Promise.resolve()
    }
  })
}

export const useRemoveAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (agentId: string) => {
      queryClient.setQueryData(getAgents().queryKey, (old: Agent[] | undefined) => {
        if (!old) return [];
        return old.filter(agent => agent.id !== agentId);
      });
      return Promise.resolve();
    }
  });
}