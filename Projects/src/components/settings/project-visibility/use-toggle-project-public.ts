import { useQueryClient } from "@tanstack/react-query";
import { LockKeyholeIcon } from "lucide-react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import useUpdateProject from "@/hooks/mutations/project/use-update-project";
import { toast } from "@/lib/toast";
import type { Project } from "@/types/project";

export function useToggleProjectPublic(
  project: Project | undefined,
  workspaceId: string | undefined,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: updateProject } = useUpdateProject();
  const savingRef = useRef(false);

  return useCallback(async () => {
    if (!project || savingRef.current) return;
    savingRef.current = true;

    try {
      const restricted = project.visibility === "restricted";
      await updateProject({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description || "",
        icon: project.icon || "Layout",
        visibility: restricted ? "workspace" : "restricted",
        expectedRevision: project.revision,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["projects", workspaceId, project.id],
        }),
      ]);
      toast.success(t("settings:projectVisibility.toastUpdated"), {
        icon: LockKeyholeIcon,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:projectVisibility.toastUpdateError"),
      );
    } finally {
      savingRef.current = false;
    }
  }, [project, updateProject, queryClient, workspaceId, t]);
}
