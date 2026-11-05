import type { ReactNode, Ref } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { isPlainClick } from "./is-plain-click";
import type { ProjectView } from "./project-views";
import { useProjectViewHref } from "./use-project-view-href";

type ProjectScopeLinkProps = {
  view: ProjectView;
  workspaceId: string;
  projectId: string;
  active: boolean;
  onSelect: (view: ProjectView) => void;
  children: ReactNode;
  linkRef?: Ref<HTMLAnchorElement>;
  reduceMotion?: boolean | null;
};

export function ProjectScopeLink({
  view,
  workspaceId,
  projectId,
  active,
  onSelect,
  children,
  linkRef,
  reduceMotion = false,
}: ProjectScopeLinkProps) {
  const href = useProjectViewHref(view, workspaceId, projectId);

  return (
    <a
      ref={linkRef}
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onSelect(view);
      }}
      className={cn(
        "relative isolate inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium outline-none transition-[color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="project-view-active"
          className="absolute inset-0 -z-10 rounded-md bg-accent shadow-xs/5"
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          aria-hidden="true"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {children}
      </span>
    </a>
  );
}
