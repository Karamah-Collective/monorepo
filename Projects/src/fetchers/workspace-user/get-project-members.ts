import { client } from "@karamah/projects-libs";
import { HttpError } from "@/lib/http-error";
import type { WorkspaceUser } from "@/types/workspace-user";

export type GetProjectMembersRequest = {
  workspaceId: string;
  projectId: string;
};

async function getProjectMembers({
  workspaceId,
  projectId,
}: GetProjectMembersRequest): Promise<WorkspaceUser[]> {
  const response = await client.workspace[":workspaceId"].members.$get({
    param: { workspaceId },
    query: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  const rawMembers = data && typeof data === "object" && Array.isArray(data.members) ? data.members : [];
  return rawMembers as WorkspaceUser[];
}

export default getProjectMembers;
