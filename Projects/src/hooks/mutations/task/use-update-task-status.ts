import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import updateTaskStatus from "@/fetchers/task/update-task-status";
import { getStatusLabel } from "@/lib/i18n/domain";
import { toast, toastSubject } from "@/lib/toast";
import type Task from "@/types/task";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";

export function useUpdateTaskStatus({ notify = true }: { notify?: boolean } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskStatus(task.id, task),
    onMutate: (task: Task) => {
      markBoardCacheChanged(queryClient, task.projectId, task.id);
      const version = getBoardCacheVersion(queryClient, task.projectId, task.id);
      updateBoardTaskCache(
        queryClient,
        task.projectId,
        task.id,
        { status: task.status, revision: Number(task.revision || 1) + 1 },
        version,
      );
      return { version };
    },
    onSuccess: (updated, variables, context) => {
      updateBoardTaskCache(queryClient, variables.projectId, variables.id, updated, context?.version);
      if (notify) {
        toast.success(t("tasks:popover.status.updateSuccess"), {
          description: [
            toastSubject(variables.title),
            getStatusLabel(variables.status),
          ]
            .filter(Boolean)
            .join(" → "),
        });
      }
      invalidateMyWork(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}
