import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import type { WorkspaceActivity } from "./get-workspace-activities";

export type GetActivitesByTaskIdRequest = InferRequestType<
  (typeof client)["activity"][":taskId"]["$get"]
>["param"] & { limit?: number };

async function getActivitesByTaskId({
  taskId,
  limit,
}: GetActivitesByTaskIdRequest): Promise<WorkspaceActivity[]> {
  const response = await client.activity[":taskId"].$get({
    param: { taskId },
    query: limit === undefined ? {} : { limit: String(limit) },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getActivitesByTaskId;
