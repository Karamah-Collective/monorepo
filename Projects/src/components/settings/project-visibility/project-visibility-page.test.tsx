import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectVisibilityPage } from "./project-visibility-page";

const m = vi.hoisted(() => ({
  project: {
    id: "p1",
    name: "Website",
    slug: "website",
    description: "",
    icon: "Layout",
    visibility: "workspace",
    revision: 4,
  } as Record<string, unknown>,
  canShare: false,
  updateProject: vi.fn().mockResolvedValue({}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "w1", name: "Studio" } }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: m.project }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    hasPermission: async () => m.canShare,
  }),
}));
vi.mock("@/hooks/mutations/project/use-update-project", () => ({
  default: () => ({ mutateAsync: m.updateProject }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: { members: [] }, isLoading: false, error: null }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("ProjectVisibilityPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    m.project = {
      id: "p1",
      name: "Website",
      slug: "website",
      description: "",
      icon: "Layout",
      visibility: "workspace",
      revision: 4,
    };
    m.canShare = false;
    m.updateProject.mockClear();
  });

  it("shows workspace visibility without exposing a public link", () => {
    render(<ProjectVisibilityPage />);

    const toggle = screen.getByRole("switch", {
      name: "settings:projectVisibility.publicAccess",
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByLabelText("settings:projectVisibility.publicUrl")).toBeNull();
    expect(screen.queryByText("settings:projectVisibility.on")).toBeNull();
  });

  it("shows restricted visibility and the per-project member surface", async () => {
    m.project = { ...m.project, visibility: "restricted" };
    m.canShare = true;
    render(<ProjectVisibilityPage />);

    expect(screen.getByText("settings:projectVisibility.on")).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "settings:projectVisibility.publicAccess",
      }),
    ).toBeChecked();
    expect(await screen.findByText("Project members")).toBeTruthy();
    expect(screen.queryByLabelText("settings:projectVisibility.publicUrl")).toBeNull();
  });

  it("requires project management permission before changing visibility", async () => {
    render(<ProjectVisibilityPage />);
    const toggle = screen.getByRole("switch", {
      name: "settings:projectVisibility.publicAccess",
    });
    expect(toggle).toHaveAttribute("aria-disabled", "true");

    cleanup();
    m.canShare = true;
    render(<ProjectVisibilityPage />);
    const enabledToggle = await screen.findByRole("switch", {
      name: "settings:projectVisibility.publicAccess",
    });
    await waitFor(() =>
      expect(enabledToggle).not.toHaveAttribute("aria-disabled", "true"),
    );

    fireEvent.click(enabledToggle);
    await waitFor(() =>
      expect(m.updateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "p1",
          visibility: "restricted",
          expectedRevision: 4,
        }),
      ),
    );
  });
});
