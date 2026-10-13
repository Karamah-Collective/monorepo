import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { useSyncExternalStore } from "react";
import { auth, googleProvider } from "../firebase.js";
import { requestAdminJson } from "./karamah-admin";

type ProjectsUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
};

const workspace = {
  id: "workspace-default",
  name: "Karamah Projects",
  slug: "karamah",
  logo: null,
  metadata: null,
};

let firebaseUser: FirebaseUser | null | undefined;
const listeners = new Set<() => void>();
onAuthStateChanged(auth, (user) => {
  firebaseUser = user || null;
  for (const listener of listeners) listener();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return firebaseUser;
}

function mapUser(user: FirebaseUser): ProjectsUser {
  return {
    id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Karamah user",
    email: user.email || "",
    image: user.photoURL,
    emailVerified: user.emailVerified,
  };
}

function sessionValue(user = firebaseUser) {
  return user ? { user: mapUser(user), session: { userId: user.uid } } : null;
}

type AdminWorkspaceMember = {
  email: string;
  displayName?: string;
  roleId?: string;
  roleName?: string;
  createdAt?: string;
};

async function loadWorkspaceMembers() {
  const result = await requestAdminJson<{ members?: AdminWorkspaceMember[] }>({ action: "access-members" });
  const members = Array.isArray(result.members) ? result.members : [];
  const current = firebaseUser?.email?.toLowerCase();
  if (firebaseUser?.email && !members.some((member) => member.email.toLowerCase() === current)) {
    const access = await requestAdminJson<{ access?: { roleId?: string; roleName?: string; displayName?: string } }>({ action: "admin-access" });
    members.push({
      email: firebaseUser.email,
      displayName: access.access?.displayName || firebaseUser.displayName || undefined,
      roleId: access.access?.roleId || "viewer",
      roleName: access.access?.roleName || "Viewer",
      createdAt: undefined,
    });
  }
  return members.map((member) => {
    const isCurrent = member.email.toLowerCase() === current;
    const role = member.roleId === "administrator" ? "owner" : member.roleId || "viewer";
    return {
      id: member.email,
      organizationId: workspace.id,
      userId: isCurrent && firebaseUser ? firebaseUser.uid : member.email,
      role,
      createdAt: member.createdAt || null,
      user: {
        id: isCurrent && firebaseUser ? firebaseUser.uid : member.email,
        name: member.displayName || member.email.split("@")[0],
        email: member.email,
        image: isCurrent ? firebaseUser?.photoURL || null : null,
      },
    };
  });
}

function ok<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

function unsupported<T = null>(
  message = "This Projects capability is not enabled in the Cloudflare deployment.",
) {
  return Promise.resolve({
    data: null as T | null,
    error: { message, status: 501 },
  });
}

type AdminAccessResponse = { access?: { permissions?: string[] } };

function permissionCandidates(resource: string, action: string): string[] {
  const map: Record<string, Record<string, string[]>> = {
    project: {
      create: ["operations.projects.write"], read: ["operations.projects.read"],
      update: ["operations.projects.write"], delete: ["operations.projects.write"], share: ["operations.projects.write"],
    },
    task: {
      create: ["operations.tasks.create", "operations.tasks.write"], read: ["operations.tasks.read"],
      update: ["operations.tasks.write"], delete: ["operations.tasks.delete", "operations.tasks.write"], assign: ["operations.tasks.assign"],
    },
    label: {
      create: ["operations.projects.write"], read: ["operations.tasks.read"],
      update: ["operations.tasks.write"], delete: ["operations.projects.write"],
    },
    workspace: { read: ["operations.projects.read"], update: ["operations.projects.write"], delete: ["operations.projects.write"], manage_settings: ["operations.settings.write"] },
    member: { update: ["operations.projects.manage_members"], delete: ["operations.projects.manage_members"] },
    invitation: { create: ["operations.projects.manage_members"] },
  };
  return map[resource]?.[action] || [`${resource}.${action}`];
}

function allowsPermission(permissions: string[], permission: string): boolean {
  return permissions.some((candidate) => candidate === "*" || candidate === permission || candidate.endsWith(".*") && permission.startsWith(candidate.slice(0, -1)));
}

async function readAdminAccess() {
  return requestAdminJson<AdminAccessResponse>({ action: "admin-access" });
}

async function checkPermission(permissions: Record<string, string[]> = {}) {
  const result = await readAdminAccess();
  const granted = result.access?.permissions || [];
  return Object.entries(permissions).every(([resource, actions]) => actions.every((action) => permissionCandidates(resource, action).some((permission) => allowsPermission(granted, permission))));
}

function useSession() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    data: sessionValue(user),
    isPending: user === undefined,
    error: null,
    refetch: async () => ({ data: sessionValue(), error: null }),
  };
}

function useListOrganizations() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { data: user ? [workspace] : [], isPending: user === undefined, error: null };
}

function useActiveOrganization() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { data: user ? workspace : null, isPending: user === undefined, error: null };
}

const organization = {
  list: async () => ok([workspace]),
  getFullOrganization: async () => ok({ ...workspace, members: await loadWorkspaceMembers(), projects: [] }),
  listMembers: async () => ok({ members: await loadWorkspaceMembers() }),
  getActiveMember: async () => {
    const members = await loadWorkspaceMembers();
    return ok(members.find((member) => member.userId === firebaseUser?.uid) || null);
  },
  listInvitations: async () => ok([]),
  listUserInvitations: async () => ok([]),
  getInvitation: async () => ok(null),
  create: async () => unsupported("Project workspaces are managed by Karamah Admin."),
  update: async () => unsupported("Project workspace settings are managed by Karamah Admin."),
  delete: async () => unsupported("Project workspaces cannot be deleted from this surface."),
  setActive: async () => ok(workspace),
  hasPermission: async ({ permissions = {} } = {}) => {
    try {
      return ok({ success: await checkPermission(permissions) });
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Permission check failed.", status: 403 } };
    }
  },
  inviteMember: async () => unsupported(),
  removeMember: async () => unsupported(),
  updateMemberRole: async () => unsupported(),
  acceptInvitation: async () => unsupported(),
  rejectInvitation: async () => unsupported(),
  cancelInvitation: async () => unsupported(),
  listRoles: async () => {
    const result = await requestAdminJson<{ roles?: Array<{ id: string; name: string; description?: string; permissions?: string[] }> }>({ action: "access-roles" });
    return ok((result.roles || []).map((role) => ({
      id: role.id,
      organizationId: workspace.id,
      role: role.id,
      permission: { workspace: role.permissions || [] },
      createdAt: null,
      updatedAt: null,
      name: role.name,
      description: role.description || "",
    })));
  },
  createRole: async () => unsupported(),
  updateRole: async () => unsupported(),
  deleteRole: async () => unsupported(),
};

export const authClient: any = {
  useSession,
  useListOrganizations,
  useActiveOrganization,
  organization,
  getSession: async () => ok(sessionValue()),
  signIn: {
    social: async () => {
      try {
        await signInWithPopup(auth, googleProvider);
        return { data: sessionValue(), error: null };
      } catch (error) {
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : "Sign in failed." },
        };
      }
    },
    oauth2: async () => authClient.signIn.social(),
    email: async () => unsupported(),
    anonymous: async () => unsupported(),
    emailOtp: async () => unsupported(),
  },
  signUp: { email: async () => unsupported() },
  signOut: async () => {
    await firebaseSignOut(auth);
    return { data: null, error: null };
  },
  updateUser: async () => ok(sessionValue()?.user || null),
  changePassword: async () => unsupported(),
  deleteUser: async () => unsupported(),
  resetPassword: async () => unsupported(),
  requestPasswordReset: async () => unsupported(),
  listAccounts: async () => ok([]),
  linkSocial: async () => unsupported(),
  getLastUsedLoginMethod: () => "google",
  admin: {
    hasPermission: async ({ permissions = {} } = {}) => {
      try {
        return ok({ success: await checkPermission(permissions) });
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "Permission check failed.", status: 403 } };
      }
    },
    updateUser: async () => unsupported(),
    banUser: async () => unsupported(),
    unbanUser: async () => unsupported(),
    removeUser: async () => unsupported(),
  },
  emailOtp: { sendVerificationOtp: async () => unsupported() },
  device: async () => unsupported(),
};

export async function getAdminProjects() {
  return requestAdminJson<{ projects: unknown[] }>({ action: "project-list" });
}

