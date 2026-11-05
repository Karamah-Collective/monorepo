import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import {
  WorkspaceTimeline,
  WorkspaceTimelineModeToggle,
  type WorkspaceTimelineMode,
} from "@/components/workspace/workspace-timeline";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/timeline",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const [mode, setMode] = useState<WorkspaceTimelineMode>("projects");

  return (
    <>
      <PageTitle title="Timeline" />
      <WorkspaceLayout
        title="Timeline"
        headerActions={
          <WorkspaceTimelineModeToggle mode={mode} onChange={setMode} />
        }
      >
        <WorkspaceTimeline workspaceId={workspaceId} mode={mode} />
      </WorkspaceLayout>
    </>
  );
}
