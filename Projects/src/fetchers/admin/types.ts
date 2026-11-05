export const ADMIN_USERS_PAGE_SIZE = 20;
export const ADMIN_USERS_SEARCH_MAX_LENGTH = 200;

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  role: string;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: string | null;
  [key: string]: unknown;
};

export type AdminUsersResponse = { users: AdminUser[]; total: number };

export type UpdateAdminUserRequest = {
  userId: string;
  name: string;
  email: string;
  role?: string;
};

export type ToggleAdminUserStatusRequest = {
  userId: string;
  deactivate: boolean;
};
