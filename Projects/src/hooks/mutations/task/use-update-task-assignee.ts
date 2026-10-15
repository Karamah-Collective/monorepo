import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import updateTaskAssignee from "@/fetchers/task/update-task-assignee";
import { toast, toastSubject } from "@/lib/toast";
import type Task from "@/types/task";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";

export function useUpdateTaskAssignee({ notify = true }: { notify?: boolean } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskAssignee(task.id, task),
    onSuccess: (updated, variables) => {
      updateBoardTaskCache(queryClient, variables.projectId, variables.id, updated);
      if (notify) {
        toast.success(t("tasks:popover.assignee.updateSuccess"), {
          description: toastSubject(variables.title),
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
