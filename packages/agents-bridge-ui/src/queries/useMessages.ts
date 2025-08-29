import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChatMessage } from 'agents-bridge-shared';

export const getMessagesByTaskId = (taskId?: string) => {
  return queryOptions({
    queryKey: ['messages', taskId],
    queryFn: () => [] as ChatMessage[],
    enabled: !!taskId
  })
}

export const useMessagesByTaskId = (taskId?: string) => {
  return useQuery(getMessagesByTaskId(taskId));
}

type AddMessageRequest = {
  taskId: string;
  message: ChatMessage;
}

export const useAddMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: AddMessageRequest) => {
      queryClient.setQueryData(getMessagesByTaskId(request.taskId).queryKey, (old: ChatMessage[] | undefined) => [...(old || []), request.message])
      return Promise.resolve()
    }
  })
}


type AddMessagesRequest = {
  taskId: string;
  messages: ChatMessage[];
}

export const useAddMessages = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (request: AddMessagesRequest) => {
      queryClient.setQueryData(getMessagesByTaskId(request.taskId).queryKey, (old: ChatMessage[] | undefined) => [...(old || []), ...request.messages])
      return Promise.resolve()
    }
  })
}