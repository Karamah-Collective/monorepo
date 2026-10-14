import { requestAdminJson } from "@/lib/karamah-admin";

export type InvitationAccess = {
  workspaceRole: string | null;
  inheritedProjectRole: string | null;
  projectOverrides: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  appliesToAllProjects: boolean;
};

export type InvitationDetails = {
  id: string;
  email: string;
  workspaceName: string;
  inviterName: string;
  expiresAt: string;
  status: string;
  expired: boolean;
  workspaceId?: string | null;
  projectId?: string | null;
  projectName?: string;
  scope?: "workspace" | "project";
  role?: string;
  isExternal?: boolean;
  access?: InvitationAccess;
};

export type GetInvitationDetailsResponse = {
  valid: boolean;
  invitation?: InvitationDetails;
  error?: string;
};

export async function getInvitationDetails(
  invitationId: string,
): Promise<GetInvitationDetailsResponse> {
  return requestAdminJson<GetInvitationDetailsResponse>({ action: "project-invitation-get", query: { invitationId } });
}
