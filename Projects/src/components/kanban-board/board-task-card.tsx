import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CSSProperties } from "react";
import { useRestoreTaskFocus } from "@/components/project/task-view-keys/use-restore-task-focus";
import { isKeyboardFocus } from "@/lib/is-keyboard-focus";
import useBulkSelectionStore from "@/store/bulk-selection";
import type Task from "@/types/task";
import TaskCardContent from "./task-card/task-card-content";
import { useTaskCardClick } from "./task-card/use-task-card-click";

type BoardTaskCardProps = {
  task: Task;
  disableDragDrop?: boolean;
  disableSorting?: boolean;
  isFinalColumn?: boolean;
};

function BoardTaskCard({
  task,
  disableDragDrop = false,
  disableSorting = false,
  isFinalColumn,
}: BoardTaskCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id: task.id,
      disabled: disableDragDrop,
      data: {
        type: "task",
        task,
        isFinalColumn,
      },
    });
  const { setNodeRef: setDropRef } = useDroppable({
    id: task.id,
    disabled: disableDragDrop || disableSorting,
    data: {
      type: "task",
      task,
      isFinalColumn,
    },
  });
  const { handleKeyDown } = useTaskCardClick(task);
  const setFocusedTask = useBulkSelectionStore((state) => state.setFocusedTask);
  useRestoreTaskFocus(task.id, useBulkSelectionStore);

  const setNodeRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const style: CSSProperties = {
    opacity: isDragging ? 0 : 1,
    touchAction: isDragging ? "none" : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-projects-sortable
      data-task-id={task.id}
      data-shortcut-surface
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        setFocusedTask(isKeyboardFocus(event) ? task.id : null);
      }}
      className="outline-none"
    >
      <TaskCardContent
        task={task}
        disableDragDrop={disableDragDrop}
        isFinalColumn={isFinalColumn}
        isDragging={isDragging}
      />
    </div>
  );
}

export default BoardTaskCard;
