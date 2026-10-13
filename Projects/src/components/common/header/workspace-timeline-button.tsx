import { Link } from "@tanstack/react-router";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceTimelineButton({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return (
    <Link
      to="/dashboard/workspace/$workspaceId/timeline"
      params={{ workspaceId }}
      aria-label="Open workspace timeline"
      title="Workspace timeline"
    >
      <Button variant="ghost" size="xs" className="gap-1.5 px-2">
        <CalendarRange aria-hidden="true" />
        <span className="hidden sm:inline">Timeline</span>
      </Button>
    </Link>
  );
}
