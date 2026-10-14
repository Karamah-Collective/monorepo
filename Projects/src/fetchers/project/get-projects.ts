import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { collectionResponse } from "@/lib/collection-response";
import { HttpError } from "@/lib/http-error";

export type GetProjectsRequest = InferRequestType<
  (typeof client)["project"]["$get"]
>["query"];

async function getProjects({
  workspaceId,
  includeArchived,
}: GetProjectsRequest) {
  // Keep the query contract array-shaped even while the workspace context is
  // resolving. Several Projects navigation surfaces call array methods during
  // their first render.
  if (!workspaceId) return [];

  const response = await client.project.$get({
    query: includeArchived ? { workspaceId, includeArchived } : { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  // The project hooks consume a collection directly. Keep this boundary
  // defensive because the Admin adapter may return an envelope while an
  // older local worker is still running during development.
  return collectionResponse(data, ["projects", "data", "items", "results"]);
}

export default getProjects;
