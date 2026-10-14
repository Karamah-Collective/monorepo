import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { ProjectScopeLink } from "./project-scope-link";
import { PROJECT_VIEWS, type ProjectView, tasksViewFor } from "./project-views";

type ProjectScopeToggleProps = {
  workspaceId: string;
  projectId: string;
  currentView: ProjectView;
  onSelect: (view: ProjectView) => void;
};

export function ProjectScopeToggle({
  workspaceId,
  projectId,
  currentView,
  onSelect,
}: ProjectScopeToggleProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const taskLayout = useUserPreferencesStore((state) => state.taskLayout);
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const onBacklog = currentView === "backlog";
  const tasksView = onBacklog
    ? tasksViewFor(taskLayout, viewMode)
    : currentView;

  useEffect(() => {
    const activeLink = activeLinkRef.current;
    if (!activeLink || typeof activeLink.scrollIntoView !== "function") return;
    activeLink.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [currentView, reduceMotion]);

  const isActive = (view: ProjectView) =>
    view === "board"
      ? !onBacklog && (tasksView === "board" || tasksView === "list")
      : view === tasksView;

  return (
    <nav
      aria-label={t("tasks:view.heading")}
      className="inline-flex w-max min-w-0 max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-border/80 bg-background p-0.5 [scrollbar-width:none] dark:bg-input/32 [&::-webkit-scrollbar]:hidden"
    >
      {PROJECT_VIEWS.filter((view) => view.id !== "list").map((layout) => {
        const Icon = layout.icon;
        return (
          <ProjectScopeLink
            key={layout.id}
            view={layout.id}
            workspaceId={workspaceId}
            projectId={projectId}
            active={isActive(layout.id)}
            onSelect={onSelect}
            linkRef={isActive(layout.id) ? activeLinkRef : undefined}
            reduceMotion={reduceMotion}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">
              {layout.id === "board" ? t("tasks:title") : t(layout.labelKey)}
            </span>
          </ProjectScopeLink>
        );
      })}
    </nav>
  );
}
