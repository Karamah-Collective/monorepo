import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

type UpdateTaskPriorityValue = InferRequestType<
  (typeof client)["task"]["priority"][":id"]["$put"]
>["json"]["priority"];

async function updateTaskPriority(taskId: string, task: Task) {
  const response = await client.task.priority[":id"].$put({
    param: { id: taskId },
    json: {
      priority: (task.priority === "no-priority" ? "normal" : task.priority || "normal") as UpdateTaskPriorityValue,
      expectedRevision: task.revision,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default updateTaskPriority;
