import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/import",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { data: workspace } = useActiveWorkspace();

  useEffect(() => {
    if (!workspace?.id) return;
    void navigate({
      to: "/dashboard/workspace/$workspaceId/projects",
      params: { workspaceId: workspace.id },
      replace: true,
    });
  }, [navigate, workspace?.id]);

  return null;
}
