import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type { AdminWorkspaceMember } from "./workspace-types";

export async function getAdminWorkspaceMembers(workspaceId: string): Promise<AdminWorkspaceMember[]> {
  const response = await client.admin.workspaces[":workspaceId"].members.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  if (Array.isArray(data)) return data as AdminWorkspaceMember[];
  if (data && typeof data === "object" && Array.isArray(data.members)) {
    return data.members as AdminWorkspaceMember[];
  }
  return [];
}
