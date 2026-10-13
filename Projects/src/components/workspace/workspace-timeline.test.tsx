import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  projects: [
    { id: "project-a", name: "Community campaign", slug: "campaign" },
    { id: "project-b", name: "Website refresh", slug: "website" },
  ],
  taskResults: [
    {
      columns: [
        {
          tasks: [
            {
              id: "task-a",
              title: "Prepare the campaign brief",
              number: 12,
              status: "in-progress",
              priority: "high",
              startDate: "2026-10-12",
              dueDate: "2026-10-16",
              userId: "member-a",
              projectId: "project-a",
            },
          ],
        },
      ],
    },
    {
      columns: [
        {
          tasks: [
            {
              id: "task-b",
              title: "Review the new homepage",
              number: 4,
              status: "to-do",
              priority: "medium",
              startDate: "2026-10-14",
              dueDate: "2026-10-20",
              userId: "member-b",
              projectId: "project-b",
            },
          ],
        },
      ],
    },
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueries: () => mocks.taskResults.map((data) => ({ data, isLoading: false })),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

vi.mock("@/fetchers/task/get-tasks", () => ({ default: vi.fn() }));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: mocks.projects, isLoading: false }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-active-workspace-users", () => ({
  useGetActiveWorkspaceUsers: () => ({
    data: {
      members: [
        { userId: "member-a", user: { name: "Amina Rahman", email: "amina@example.com" } },
        { userId: "member-b", user: { name: "Bilal Khan", email: "bilal@example.com" } },
      ],
    },
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: (selector: (state: { weekStartsOn: 1 }) => unknown) =>
    selector({ weekStartsOn: 1 }),
}));
vi.mock("@/components/gantt/gantt-task-bar", () => ({
  GanttTaskBar: ({
    task,
    onOpenTask,
  }: {
    task: { id: string; title: string };
    onOpenTask: () => void;
  }) => (
    <button type="button" data-testid={`timeline-task-${task.id}`} onClick={onOpenTask}>
      {task.title}
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

import { WorkspaceTimeline } from "./workspace-timeline";

describe("WorkspaceTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("resolves people, expands the hierarchy, and opens actionable task bars", () => {
    render(<WorkspaceTimeline workspaceId="workspace-a" mode="people" />);

    expect(screen.getByText("Amina Rahman")).toBeVisible();
    expect(screen.getByText("Bilal Khan")).toBeVisible();
    expect(screen.queryByTestId("timeline-task-task-a")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Amina Rahman" }));
    expect(screen.getByText("Community campaign")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand Community campaign" }));

    const taskBar = screen.getByTestId("timeline-task-task-a");
    expect(taskBar).toBeVisible();
    fireEvent.click(taskBar);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: { workspaceId: "workspace-a", projectId: "project-a" },
      search: { taskId: "task-a" },
    });
  });

  it("keeps the old date-input pane out while exposing compact navigation and zoom", () => {
    render(<WorkspaceTimeline workspaceId="workspace-a" mode="projects" />);

    expect(screen.queryByLabelText("Timeline start date")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to today" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Timeline zoom" })).toBeVisible();
  });
});
