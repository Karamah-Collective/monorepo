import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

type UpdateTaskAssigneePayload = Pick<Task, "userId" | "revision">;

async function updateTaskAssignee(
  taskId: string,
  task: UpdateTaskAssigneePayload,
) {
  const response = await client.task.assignee[":id"].$put({
    param: { id: taskId },
    json: {
      userId: task.userId || "",
      expectedRevision: task.revision,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default updateTaskAssignee;
