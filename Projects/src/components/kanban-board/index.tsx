import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import BulkToolbar from "@/components/bulk-selection/bulk-toolbar";
import { useTaskViewShortcuts } from "@/components/project/task-view-keys/use-task-view-shortcuts";
import reorderTasks, { type TaskReorder } from "@/fetchers/task/reorder-tasks";
import { useProjectBackground } from "@/hooks/use-project-background";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { markBoardCacheChanged } from "@/lib/board-cache-version";
import { cn } from "@/lib/cn";
import { EASE_OUT_CSS } from "@/lib/motion";
import { toast, toastSubject } from "@/lib/toast";
import useBulkSelectionStore from "@/store/bulk-selection";
import { useBackgroundStore } from "@/store/background";
import useProjectStore from "@/store/project";
import type { ProjectWithTasks } from "@/types/project";
import Column from "./column";
import {
  boardCollisionDetection,
  findBoardColumn,
  moveBoardTask,
  rollbackBoardReorder,
  selectReorderBoard,
} from "./board-model";
import TaskCardContent from "./task-card/task-card-content";

type KanbanBoardProps = {
  project: ProjectWithTasks;
  workspaceId?: string;
  disableDragDrop?: boolean;
  disableCollectionActions?: boolean;
  sortedByNumber?: boolean;
  sortedByPriority?: boolean;
};

type PendingReorder = TaskReorder & { previousBoard: ProjectWithTasks };

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.8" } },
  }),
  duration: 250,
  easing: EASE_OUT_CSS,
};

function KanbanBoard({
  project,
  workspaceId,
  disableDragDrop = false,
  disableCollectionActions = false,
  sortedByNumber = false,
  sortedByPriority = false,
}: KanbanBoardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { project: storedProject, setProject } = useProjectStore();
  const setAvailableTasks = useBulkSelectionStore(
    (state) => state.setAvailableTasks,
  );
  const clearFocus = useBulkSelectionStore((state) => state.clearFocus);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [hintColumnId, setHintColumnId] = useState<string | null>(null);
  const automaticallySorted = sortedByNumber || sortedByPriority;
  const { background, setBackground } = useBackgroundStore();
  const projectBackground = useProjectBackground({
    backgroundVersion: project.backgroundVersion,
    projectId: project.id,
    viewMode: "board",
  });

  const { mutate: saveReorder, isPending: isSaving } = useMutation({
    mutationFn: ({ previousBoard: _previousBoard, ...request }: PendingReorder) =>
      reorderTasks(request),
    onMutate: (variables) => ({ previousBoard: variables.previousBoard }),
    onSuccess: (_result, variables) => {
      if (variables.tasks.some((task) => task.status !== undefined)) {
        invalidateMyWork(queryClient);
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
      }
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      for (const task of variables.tasks) {
        void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      }
      const currentBoard = queryClient.getQueryData<ProjectWithTasks>([
        "tasks",
        variables.projectId,
      ]);
      const changedTask = variables.tasks.find((task) => task.status) ?? variables.tasks[0];
      const savedTask = currentBoard?.columns
        .flatMap((column) => column.tasks)
        .find((task) => task.id === changedTask?.id);
      const destination = currentBoard?.columns.find((column) =>
        column.tasks.some((task) => task.id === changedTask?.id),
      );
      toast.success(t("tasks:board.reorderSuccess"), {
        description: [
          toastSubject(savedTask?.title),
          destination?.name,
        ]
          .filter(Boolean)
          .join(" → ") || undefined,
      });
    },
    onError: (error, variables, context) => {
      const current = queryClient.getQueryData<ProjectWithTasks>([
        "tasks",
        variables.projectId,
      ]);
      const restored = current
        ? rollbackBoardReorder(
            current,
            context?.previousBoard ?? variables.previousBoard,
            variables.tasks,
          )
        : null;
      if (restored) {
        queryClient.setQueryData(["tasks", variables.projectId], restored);
        if (useProjectStore.getState().project?.id === variables.projectId) {
          setProject(restored);
        }
      }
      toast.error(t("tasks:board.reorderFailed"), {
        description:
          error instanceof Error && error.message ? error.message : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["tasks", project.id] });
    },
  });

  useEffect(() => {
    setBackground(projectBackground);
    return () => setBackground(null);
  }, [projectBackground, setBackground]);

  useEffect(() => {
    setAvailableTasks(
      project.columns.flatMap((column) =>
        column.tasks.map((task) => task.id),
      ),
    );
  }, [project, setAvailableTasks]);

  useEffect(() => clearFocus(), [clearFocus]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: disableDragDrop ? 999999 : 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: disableDragDrop ? 999999 : 250,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const reduceMotion = useReducedMotion();

  const resetDrag = useCallback(() => {
    setActiveId(null);
    setHintColumnId(null);
  }, []);

  const canDrop = !disableDragDrop && !isSaving;

  const commitMove = useCallback(
    (taskId: string, overId: string) => {
      if (!canDrop) return;
      const board = selectReorderBoard(
        project.id,
        taskId,
        queryClient.getQueryData<ProjectWithTasks>(["tasks", project.id]),
        storedProject,
      );
      if (!board) return;

      const moved = moveBoardTask(board, taskId, overId, automaticallySorted);
      if (!moved || moved.tasks.length === 0) return;

      for (const task of moved.tasks) {
        markBoardCacheChanged(queryClient, project.id, task.id);
      }
      setProject(moved.project);
      queryClient.setQueryData(["tasks", project.id], moved.project);
      saveReorder({
        projectId: project.id,
        tasks: moved.tasks,
        expectedTasks: moved.expectedTasks,
        previousBoard: board,
      });
    },
    [
      automaticallySorted,
      canDrop,
      project.id,
      queryClient,
      saveReorder,
      setProject,
      storedProject,
    ],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      setHintColumnId(
        findBoardColumn(project, event.active.id.toString())?.id ?? null,
      );
    },
    [project],
  );

  const handleDragOver = useCallback(
    ({ over }: DragOverEvent) => {
      if (!over || !canDrop) {
        setHintColumnId(null);
        return;
      }
      setHintColumnId(findBoardColumn(project, over.id.toString())?.id ?? null);
    },
    [canDrop, project],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const taskId = active.id.toString();
      const overId = over?.id.toString();
      resetDrag();
      if (overId) commitMove(taskId, overId);
    },
    [commitMove, resetDrag],
  );

  useTaskViewShortcuts({
    layout: "board",
    selection: useBulkSelectionStore,
    getGroups: () =>
      project.columns.map((column) => ({
        id: column.id,
        taskIds: column.tasks.map((task) => task.id),
      })),
    project: { id: project.id, workspaceId: workspaceId ?? "" },
    enabled: activeId === null,
    canMove: !disableDragDrop,
    onMove: commitMove,
  });

  const activeTask = useMemo(
    () =>
      activeId === null
        ? null
        : project.columns
            .flatMap((column) => column.tasks)
            .find((task) => task.id === activeId.toString()),
    [activeId, project],
  );

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        screenReaderInstructions: {
          draggable: t("tasks:board.keyboardInstructions"),
        },
      }}
      collisionDetection={boardCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <div
        className={cn("flex h-full w-full flex-col", {
          "bg-linear-to-b from-muted/20 to-background": !background,
        })}
      >
        <div
          className={cn(
            "min-h-0 flex-1 scroll-px-4 overflow-x-auto [-webkit-overflow-scrolling:touch]",
            activeId === null && "snap-x snap-mandatory sm:snap-none",
          )}
        >
          <div className="flex h-full min-w-max gap-4 px-4 py-4 md:px-5">
            {project.columns.map((column) => (
              <div
                key={column.id}
                className={cn(
                  "h-full max-w-96 min-w-[min(20rem,calc(100vw-4.5rem))] shrink-0 flex-1 snap-start",
                )}
              >
                <Column
                  column={column}
                  sortHint={
                    column.id === hintColumnId && automaticallySorted
                      ? t("tasks:kanban.automaticallySortedHint", {
                          sort: t(
                            sortedByNumber
                              ? "tasks:sort.fields.number"
                              : "tasks:sort.fields.priority",
                          ),
                        })
                      : undefined
                  }
                  isDropTarget={column.id === hintColumnId}
                  disableDragDrop={disableDragDrop}
                  disableSorting={automaticallySorted}
                  disableCollectionActions={disableCollectionActions}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {typeof document === "undefined"
        ? null
        : createPortal(
            <DragOverlay
              adjustScale={false}
              dropAnimation={reduceMotion ? null : dropAnimation}
            >
              {activeTask ? (
                <div className="pointer-events-none shadow-lg">
                  <div className="rounded-lg ring-2 ring-ring/35">
                    <TaskCardContent
                      task={activeTask}
                      disableDragDrop
                      isFinalColumn={
                        findBoardColumn(project, activeTask.id)?.isFinal
                      }
                      isDragging
                    />
                  </div>
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}

      <BulkToolbar />
    </DndContext>
  );
}

export default KanbanBoard;
