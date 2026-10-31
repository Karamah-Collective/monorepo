import { authClient } from "@/lib/auth-client";
import type { WorkspaceUser } from "@/types/workspace-user";

export type GetActiveWorkspaceUsersRequest = {
  workspaceId: string;
};

async function getActiveWorkspaceUsers({
  workspaceId,
}: GetActiveWorkspaceUsersRequest): Promise<{ members: WorkspaceUser[] }> {
  const { data, error } = await authClient.organization.listMembers({
    query: {
      organizationId: workspaceId,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to fetch workspace users");
  }

  const rawMembers: WorkspaceUser[] = Array.isArray(data)
    ? data as WorkspaceUser[]
    : Array.isArray(data?.members)
      ? data.members as WorkspaceUser[]
      : [];
  return {
    members: rawMembers.map((member) => ({
      ...member,
      name: member.name || member.user?.name || "",
      email: member.email || member.user?.email || "",
      image: member.image ?? member.user?.image ?? null,
      user: member.user || { id: member.userId, name: member.name || "", email: member.email || "", image: member.image ?? null },
    })),
  };
}

export default getActiveWorkspaceUsers;
