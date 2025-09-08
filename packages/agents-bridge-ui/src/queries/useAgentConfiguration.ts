import { RooCodeSettings } from "@roo-code/types";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export const getAgentConfiguration = (id: string) => {
  return queryOptions({
    queryKey: ['agent-configuration', id],
    queryFn: () => ({}) as RooCodeSettings
  });
};

export const useAgentConfiguration = (id: string) => {
  return useQuery(getAgentConfiguration(id));
}


export const useAddAgentConfiguration = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, configuration }: { id: string, configuration: RooCodeSettings }) => {
      queryClient.setQueryData(getAgentConfiguration(id).queryKey, configuration)
      return Promise.resolve()
    }
  })
}