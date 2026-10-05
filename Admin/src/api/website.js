import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { websiteRequest } from './website-client.js';

export const useWebsiteTeam = () => useQuery({ queryKey: ['website-team'], queryFn: () => websiteRequest('admin-team') });
export const useWebsiteSubscribers = () => useQuery({ queryKey: ['website-subscribers'], queryFn: () => websiteRequest('admin-subscribers') });
export const useWebsiteContent = () => useQuery({ queryKey: ['website-content'], queryFn: () => websiteRequest('admin-content') });

export function useWebsiteMutation(action, key) {
  const client = useQueryClient();
  return useMutation({ mutationFn: body => websiteRequest(action, body), onSuccess: () => client.invalidateQueries({ queryKey: [key] }) });
}
