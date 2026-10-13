import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type DeleteProjectRequest = InferRequestType<
  (typeof client)["project"][":id"]["$delete"]
>["param"];

async function deleteProject({ id }: DeleteProjectRequest) {
  const currentResponse = await client.project[":id"].$get({ param: { id } });
  if (!currentResponse.ok) {
    throw await HttpError.fromResponse(currentResponse);
  }
  const current = (await currentResponse.json()) as { revision?: number };
  const response = await client.project[":id"].$delete({
    param: { id },
    json: { expectedRevision: current.revision },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default deleteProject;
