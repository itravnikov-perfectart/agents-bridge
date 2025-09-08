import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export const getProfiles = () => {
  return queryOptions({
    queryKey: ['profiles'],
    queryFn: () => [] as string[]
  })
}

export const useProfiles = () => {
  return useQuery(getProfiles());
}

export const getActiveProfile = () => {
  return queryOptions({
    queryKey: ['profiles', 'active'],
    queryFn: () => null as string | null
  })
}

export const useActiveProfile = () => {
  return useQuery(getActiveProfile());
}

export const useUpdateActiveProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: string) => {
      queryClient.setQueryData(getActiveProfile().queryKey, profile)
      return Promise.resolve()
    }
  })
}

export const useAddProfiles = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (profiles: string[]) => {
      queryClient.setQueryData(getProfiles().queryKey, (old: string[] | undefined) => [...(old || []), ...profiles.filter(profile => !old?.includes(profile))])
      return Promise.resolve()
    }
  })
}