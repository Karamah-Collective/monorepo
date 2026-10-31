import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$projectId/integrations",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/settings/projects/$projectId/workflow",
      params: { projectId: params.projectId },
    });
  },
});
