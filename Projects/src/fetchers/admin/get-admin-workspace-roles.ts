import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";

export async function getAdminWorkspaceRoles(workspaceId: string) {
  const response = await client.admin.workspaces[":workspaceId"].roles.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}
