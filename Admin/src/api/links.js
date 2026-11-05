import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export const useLinkHub = () => useQuery({ queryKey: ['link-hub'], queryFn: () => apiGet('admin-link-hub') });

export function useLinkHubMutation(action) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: body => apiPost(action, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['link-hub'] }),
  });
}
