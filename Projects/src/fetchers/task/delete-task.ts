import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type DeleteTaskRequest = InferRequestType<
  (typeof client)["task"][":id"]["$delete"]
>["param"];

async function deleteTask(taskId: string) {
  const currentResponse = await client.task[":id"].$get({ param: { id: taskId } });
  if (!currentResponse.ok) {
    throw await HttpError.fromResponse(currentResponse);
  }
  const current = (await currentResponse.json()) as { revision?: number };
  const response = await client.task[":id"].$delete({
    param: { id: taskId },
    json: { expectedRevision: current.revision },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default deleteTask;
