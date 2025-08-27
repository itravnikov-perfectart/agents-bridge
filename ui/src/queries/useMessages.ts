import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Message } from '../types/messages.types';

export const getMessagesByTaskId = (taskId?: string) => {
  return queryOptions({
    queryKey: ['messages', taskId],
    queryFn: () => [] as Message[],
    enabled: !!taskId
  })
}

export const useMessagesByTaskId = (taskId?: string) => {
  return useQuery(getMessagesByTaskId(taskId));
}

type AddMessageRequest = {
  taskId: string;
  message: Message;
}

export const useAddMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: AddMessageRequest) => {
      queryClient.setQueryData(getMessagesByTaskId(request.taskId).queryKey, (old: Message[] | undefined) => [...(old || []), request.message])
      return Promise.resolve()
    }
  })
}