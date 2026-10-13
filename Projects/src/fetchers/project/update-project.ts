import { client } from "@karamah/projects-libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type UpdateProjectRequest = InferRequestType<
  (typeof client)["project"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["project"][":id"]["$put"]>["param"];

async function updateProject({
  id,
  name,
  icon,
  slug,
  description,
  isPublic,
  visibility,
  expectedRevision,
}: UpdateProjectRequest) {
  const response = await client.project[":id"].$put({
    param: { id },
    json: { name, icon, slug, description, isPublic, visibility, expectedRevision },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default updateProject;
