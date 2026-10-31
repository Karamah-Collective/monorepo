import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import type { Workspace } from "@/lib/auth-client";

function useActiveWorkspace() {
  const { data: activeOrganization, error } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: isOrganizationsPending } =
    authClient.useListOrganizations();
  const { workspaceId } = useParams({
    strict: false,
    select: (params) => ({
      workspaceId:
        "workspaceId" in params && typeof params.workspaceId === "string"
          ? params.workspaceId
          : undefined,
    }),
  });

  const workspaceFromRoute = workspaceId
    ? organizations?.find((organization: Workspace) => organization.id === workspaceId)
    : undefined;
  const shouldLoadRouteWorkspace =
    Boolean(workspaceId && !isOrganizationsPending && !workspaceFromRoute);
  const routeWorkspaceQuery = useQuery({
    queryKey: ["workspace-route", workspaceId],
    enabled: shouldLoadRouteWorkspace,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId: workspaceId },
      });
      if (error) throw new Error(error.message || "Failed to load workspace.");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const workspace = workspaceId
    ? workspaceFromRoute ?? routeWorkspaceQuery.data
    : activeOrganization;
  const isLoading =
    (!!workspaceId && isOrganizationsPending && !workspaceFromRoute) ||
    (!workspace && !error && !routeWorkspaceQuery.error);

  return {
    data: workspace,
    error,
    isLoading,
    isError: !!error,
  };
}

export default useActiveWorkspace;
