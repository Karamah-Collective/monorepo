export const ADMIN_WORKSPACES_PAGE_SIZE = 20;
export const ADMIN_WORKSPACES_SEARCH_MAX_LENGTH = 200;

export type AdminWorkspaceOwner = {
  id: string;
  name: string;
  email: string;
};

export type AdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  owners: AdminWorkspaceOwner[];
  [key: string]: unknown;
};

export type AdminWorkspacesResponse = {
  workspaces: AdminWorkspace[];
  total: number;
};

export type AdminWorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
  [key: string]: unknown;
};

export type AdminWorkspaceMemberTarget = {
  workspaceId: string;
  userId: string;
};

export type AdminWorkspaceMemberRoleRequest = AdminWorkspaceMemberTarget & {
  role: string;
};
