export type WorkspaceUser = {
  id: string;
  userId: string;
  organizationId?: string;
  workspaceId?: string;
  role: string;
  name: string;
  email: string;
  image: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  user: { id: string; name: string; email: string; image: string | null };
  [key: string]: unknown;
};

export type ActiveWorkspaceUser = WorkspaceUser;

export type WorkspaceUserInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
  status?: string;
  [key: string]: unknown;
};

export type UserInvitation = WorkspaceUserInvitation;

export default WorkspaceUser;
