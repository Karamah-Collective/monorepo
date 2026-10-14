import type { ProjectWithTasks } from "@/types/project";
import BoardTaskCard from "../board-task-card";


type ColumnDropzoneProps = {
  column: ProjectWithTasks["columns"][number];
  disableDragDrop?: boolean;
  disableSorting?: boolean;
};

export function ColumnDropzone({
  column,
  disableDragDrop = false,
  disableSorting = false,
}: ColumnDropzoneProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {column.tasks.map((task) => (
        <BoardTaskCard
          key={task.id}
          task={task}
          disableDragDrop={disableDragDrop}
          disableSorting={disableSorting}
          isFinalColumn={column.isFinal}
        />
      ))}
    </div>
  );
}
