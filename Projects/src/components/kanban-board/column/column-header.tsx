import { produce } from "immer";
import { Archive, Plus, ArchiveIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getColumnIcon } from "@/lib/column";
import { toast, toastSubject } from "@/lib/toast";
import useProjectStore from "@/store/project";
import type { ProjectWithTasks } from "@/types/project";
import { ArchiveTasksModal } from "../../shared/modals/archive-tasks-modal";

type ColumnHeaderProps = {
  column: ProjectWithTasks["columns"][number];
  disableCollectionActions?: boolean;
};

export function ColumnHeader({
  column,
  disableCollectionActions = false,
}: ColumnHeaderProps) {
  const { t } = useTranslation();
  const { project, setProject } = useProjectStore();
  const { mutateAsync: updateTask } = useUpdateTask();
  const { canUpdateTasks, canCreateTasks } = useWorkspacePermission();
  const canTask = canUpdateTasks();
  const canCreate = canCreateTasks();

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleConfirmArchive = async () => {
    if (disableCollectionActions || !column.isFinal || !project) return;

    setIsArchiving(true);

    const updatedProject = produce(project, (draft) => {
      const archivedColumn = draft?.columns?.find(
        (col) => col.id === column.id,
      );
      if (!archivedColumn) return;
      archivedColumn.tasks = [];
    });

    try {
      await Promise.all(
        column.tasks.map((task) =>
          updateTask({
            ...task,
            status: "archived",
          }),
        ),
      );
      setProject(updatedProject);
      toast.success(t("tasks:archive.success", { count: column.tasks.length }), {
        description: toastSubject(column.name),
        icon: ArchiveIcon,
      });
      setIsArchiveModalOpen(false);
    } catch (error) {
      toast.error(t("tasks:archive.error"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="flex h-8 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-chip-icon">
          {getColumnIcon(column.id, column.isFinal, column.icon)}
        </span>
        <span className="truncate font-medium text-[13px] text-board-title leading-5">
          {column.name}
        </span>
        <span className="text-board-id text-xs tabular-nums">
          {column.tasks.length}
        </span>
      </div>

      <div className="flex items-center">
        {canTask && column.isFinal && column.tasks.length > 0 && (
          <button
            type="button"
            disabled={disableCollectionActions}
            onClick={() => setIsArchiveModalOpen(true)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-chip-icon transition-colors hover:bg-chip-hover hover:text-board-title"
            title={t("tasks:listView.archiveAllTooltip")}
            aria-label={t("tasks:listView.archiveAllTooltip")}
          >
            <Archive className="size-3.5" />
          </button>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={() => setIsTaskModalOpen(true)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-chip-icon transition-colors hover:bg-chip-hover hover:text-board-title"
            title={t("tasks:kanban.addTask")}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      <CreateTaskModal
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        projectId={project?.id}
        status={column.slug}
      />

      <ArchiveTasksModal
        open={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        disabled={disableCollectionActions}
        onConfirm={handleConfirmArchive}
        taskCount={column.tasks.length}
        pending={isArchiving}
      />
    </div>
  );
}
