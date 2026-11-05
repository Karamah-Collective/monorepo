import { useQuery } from "@tanstack/react-query";
import { requestAdminJson } from "@/lib/karamah-admin";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type ProjectMemberDirectoryEntry = {
  id: string;
  name: string;
  email: string;
};

export function useProjectMemberDirectory(
  workspaceId: string,
  search: string,
  enabled = true,
) {
  const debouncedSearch = useDebouncedValue(search.trim(), 200);

  return useQuery({
    queryKey: ["project-member-directory", workspaceId, debouncedSearch],
    enabled: enabled && Boolean(workspaceId) && debouncedSearch.length > 0,
    queryFn: () =>
      requestAdminJson<{ members?: ProjectMemberDirectoryEntry[] }>({
        action: "project-member-directory",
        query: { workspaceId, search: debouncedSearch },
      }).then((result) => result.members ?? []),
    staleTime: 30_000,
  });
}
