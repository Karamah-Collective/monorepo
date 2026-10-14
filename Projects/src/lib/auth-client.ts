import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { useEffect, useSyncExternalStore } from "react";
import { auth, googleProvider } from "../firebase.js";
import { requestAdminJson } from "./karamah-admin";
import { isKaramahEmail } from "./is-karamah-email";

type ProjectsUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  description?: string;
  role?: string | null;
  [key: string]: unknown;
};

type WorkspaceMember = {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string | null;
  updatedAt?: string | null;
  isExternal?: boolean;
  user: { id: string; name: string; email: string; image: string | null };
};

let firebaseUser: FirebaseUser | null | undefined;
const listeners = new Set<() => void>();
const organizationListeners = new Set<() => void>();
let activeOrganizationId: string | null = typeof window === "undefined" ? null : window.localStorage.getItem("projects.activeWorkspace");
let organizationState: { userId: string | null; data: Workspace[] | undefined; error: Error | null } = { userId: null, data: undefined, error: null };

function notify() {
  for (const listener of listeners) listener();
  for (const listener of organizationListeners) listener();
}
function notifyOrganizations() { for (const listener of organizationListeners) listener(); }
function setOrganizationState(next: typeof organizationState) { organizationState = next; notifyOrganizations(); }

function mapWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (!source.id || !source.name) return null;
  return {
    ...source,
    id: String(source.id),
    name: String(source.name),
    slug: String(source.slug || source.id),
    logo: (source.logo as string | null) || null,
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : null,
  };
}

async function loadOrganizations(user = firebaseUser, force = false): Promise<Workspace[]> {
  if (!user) {
    setOrganizationState({ userId: null, data: [], error: null });
    return [];
  }
  if (!force && organizationState.userId === user.uid && organizationState.data) return organizationState.data;
  setOrganizationState({ userId: user.uid, data: undefined, error: null });
  try {
    const result = await requestAdminJson<{ workspaces?: unknown[] }>({ action: "project-workspace-list" });
    const data = (result.workspaces || []).map(mapWorkspace).filter(Boolean) as Workspace[];
    setOrganizationState({ userId: user.uid, data, error: null });
    return data;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("Failed to load workspaces.");
    setOrganizationState({ userId: user.uid, data: [], error: failure });
    throw failure;
  }
}

function publishFirebaseUser(user: FirebaseUser | null) {
  firebaseUser = user || null;
  activeOrganizationId = user && typeof window !== "undefined" ? window.localStorage.getItem("projects.activeWorkspace") : null;
  setOrganizationState({ userId: user?.uid || null, data: user ? undefined : [], error: null });
  notify();
  if (user) void loadOrganizations(user).catch(() => undefined);
}

onAuthStateChanged(auth, publishFirebaseUser);

const GOOGLE_SIGN_IN_TIMEOUT_MS = 45_000;
async function signInWithGooglePopup() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      signInWithPopup(auth, googleProvider),
      new Promise<never>((_, reject) => { timeoutId = setTimeout(() => reject(new Error("Google sign-in did not finish. Check the Firebase authorized domains and try again.")), GOOGLE_SIGN_IN_TIMEOUT_MS); }),
    ]);
    publishFirebaseUser(result.user);
    return result.user;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function subscribeOrganizations(listener: () => void) { organizationListeners.add(listener); return () => organizationListeners.delete(listener); }
function getSnapshot() { return firebaseUser; }
function getOrganizationSnapshot() { return organizationState; }
function mapUser(user: FirebaseUser): ProjectsUser { return { id: user.uid, name: user.displayName || user.email?.split("@")[0] || "Karamah user", email: user.email || "", image: user.photoURL, emailVerified: user.emailVerified }; }
function sessionValue(user = firebaseUser) { return user ? { user: mapUser(user), session: { userId: user.uid } } : null; }
function ok<T>(data: T) { return Promise.resolve({ data, error: null }); }
function failure<T = null>(error: unknown, fallback = "Projects request failed.") { return Promise.resolve({ data: null as T | null, error: { message: error instanceof Error ? error.message : fallback, status: (error as { status?: number })?.status || 500 } }); }
function unsupported<T = null>(message = "This Projects capability is not enabled in the Cloudflare deployment.") { return Promise.resolve({ data: null as T | null, error: { message, status: 501 } }); }
function firebaseFailure(error: unknown) {
  const code = String((error as { code?: string })?.code || "").replace(/^auth\//, "");
  const messages: Record<string, string> = {
    invalidCredential: "The email or password is incorrect.",
    invalidLoginCredentials: "The email or password is incorrect.",
    userNotFound: "The email or password is incorrect.",
    wrongPassword: "The email or password is incorrect.",
    emailAlreadyInUse: "An account already exists for this email.",
    weakPassword: "Choose a stronger password.",
    tooManyRequests: "Too many attempts. Try again in a few minutes.",
    expiredActionCode: "This link has expired. Request a new one.",
    invalidActionCode: "This link is no longer valid. Request a new one.",
  };
  return { code, message: messages[code] || (error instanceof Error ? error.message : "Authentication failed."), status: 400 };
}
function invitationIdFromOptions(options?: { headers?: Record<string, string> }) { return options?.headers?.["x-invitation-id"] || ""; }
function workspaceId(options: { organizationId?: string; query?: { organizationId?: string } } = {}) { return options.organizationId || options.query?.organizationId || activeOrganizationId || ""; }

function useSession() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { data: sessionValue(user), isPending: user === undefined, error: null, refetch: async () => ({ data: sessionValue(), error: null }) };
}

function useListOrganizations() {
  const state = useSyncExternalStore(subscribeOrganizations, getOrganizationSnapshot, getOrganizationSnapshot);
  useEffect(() => {
    if (firebaseUser && (state.userId !== firebaseUser.uid || state.data === undefined)) void loadOrganizations(firebaseUser).catch(() => undefined);
  }, [state.userId, state.data]);
  return { data: state.data || [], isPending: firebaseUser === undefined || (!!firebaseUser && state.data === undefined), error: state.error };
}

function useActiveOrganization() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const state = useSyncExternalStore(subscribeOrganizations, getOrganizationSnapshot, getOrganizationSnapshot);
  const active = state.data?.find(item => item.id === activeOrganizationId) || state.data?.[0] || null;
  return { data: user ? active : null, isPending: user === undefined || (!!user && state.data === undefined), error: state.error };
}

const organization = {
  list: async () => { try { return ok(await loadOrganizations()); } catch (error) { return failure<Workspace[]>(error, "Failed to load workspaces."); } },
  getFullOrganization: async ({ query = {} }: { query?: { organizationId?: string } } = {}) => {
    try {
      const result = await requestAdminJson<{ workspace?: Workspace; members?: WorkspaceMember[]; invitations?: unknown[]; projects?: unknown[] }>({ action: "project-workspace-get", query: { workspaceId: workspaceId({ query }) } });
      return ok({ ...(result.workspace || {}), members: result.members || [], invitations: result.invitations || [], projects: result.projects || [] });
    } catch (error) { return failure(error, "Failed to load workspace."); }
  },
  listMembers: async ({ query = {} }: { query?: { organizationId?: string } } = {}) => {
    try {
      const result = await requestAdminJson<{ members?: WorkspaceMember[] }>({ action: "project-workspace-members-list", query: { workspaceId: workspaceId({ query }) } });
      return ok({ members: result.members || [] });
    } catch (error) { return failure<{ members: WorkspaceMember[] }>(error, "Failed to load workspace members."); }
  },
  getActiveMember: async ({ organizationId: requestedId }: { organizationId?: string } = {}) => {
    const result = await organization.listMembers({ query: { organizationId: requestedId } });
    if (result.error) return result;
    return ok(result.data?.members.find(member => member.userId === firebaseUser?.uid || member.user.email.toLowerCase() === firebaseUser?.email?.toLowerCase()) || null);
  },
  listInvitations: async ({ query = {} }: { query?: { organizationId?: string } } = {}) => {
    try {
      const result = await requestAdminJson<{ invitations?: unknown[] }>({ action: "project-workspace-invitations-list", query: { workspaceId: workspaceId({ query }) } });
      return ok(result.invitations || []);
    } catch (error) { return failure<unknown[]>(error, "Failed to load workspace invitations."); }
  },
  listUserInvitations: async () => ok([]),
  getInvitation: async ({ query = {} }: { query?: { id?: string } } = {}) => {
    try { return ok(await requestAdminJson({ action: "project-invitation-get", query: { invitationId: query.id } })); }
    catch (error) { return failure(error, "Failed to load invitation."); }
  },
  create: async ({ name, slug, metadata }: { name: string; slug?: string; metadata?: Record<string, unknown> } = { name: "" }) => {
    try {
      const result = await requestAdminJson<{ workspace?: Workspace }>({ action: "project-workspace-create", method: "POST", body: { name, slug, description: metadata?.description } });
      const workspace = mapWorkspace(result.workspace);
      await loadOrganizations(firebaseUser, true);
      return ok(workspace);
    } catch (error) { return failure<Workspace>(error, "Failed to create workspace."); }
  },
  update: async ({ organizationId: id, data }: { organizationId?: string; data?: { name?: string; metadata?: Record<string, unknown> } } = {}) => {
    try {
      const result = await requestAdminJson<{ workspace?: Workspace }>({ action: "project-workspace-update", method: "POST", body: { workspaceId: id || activeOrganizationId, name: data?.name, description: data?.metadata?.description } });
      await loadOrganizations(firebaseUser, true);
      return ok(mapWorkspace(result.workspace));
    } catch (error) { return failure<Workspace>(error, "Failed to update workspace."); }
  },
  delete: async ({ organizationId: id }: { organizationId?: string } = {}) => {
    try {
      await requestAdminJson({ action: "project-workspace-delete", method: "POST", body: { workspaceId: id || activeOrganizationId } });
      if (activeOrganizationId === (id || activeOrganizationId)) activeOrganizationId = null;
      await loadOrganizations(firebaseUser, true);
      return ok({ success: true });
    } catch (error) { return failure(error, "Failed to delete workspace."); }
  },
  setActive: async ({ organizationId: id }: { organizationId?: string } = {}) => {
    activeOrganizationId = id || null;
    if (typeof window !== "undefined") {
      if (activeOrganizationId) window.localStorage.setItem("projects.activeWorkspace", activeOrganizationId);
      else window.localStorage.removeItem("projects.activeWorkspace");
    }
    notifyOrganizations();
    return ok(organizationState.data?.find(item => item.id === activeOrganizationId) || null);
  },
  hasPermission: async ({ organizationId: id, permissions = {} }: { organizationId?: string; permissions?: Record<string, string[]> } = {}) => {
    try {
      const result = await requestAdminJson<{ success?: boolean }>({ action: "project-workspace-permission-check", query: { organizationId: id || activeOrganizationId, permissions: JSON.stringify(permissions) } });
      return ok({ success: result.success === true });
    } catch (error) { return failure(error, "Permission check failed."); }
  },
  inviteMember: async ({ organizationId: id, email, role = "member", workspaceRole, projectAccess, projectIds, projectRoles }: { organizationId?: string; email: string; role?: string; workspaceRole?: string | null; projectAccess?: string; projectIds?: string[]; projectRoles?: Record<string, string> }) => {
    try {
      const result = await requestAdminJson<{ invitation?: Record<string, unknown>; external?: boolean; id?: string }>({ action: "project-workspace-member-update", method: "POST", body: { workspaceId: id || activeOrganizationId, member: { email, role: workspaceRole ?? role }, workspaceRole, projectAccess, projectIds, projectRoles } });
      return ok(result.invitation ? { ...result.invitation, external: result.external } : result);
    }
    catch (error) { return failure(error, "Failed to add workspace member."); }
  },
  removeMember: async ({ organizationId: id, memberId }: { organizationId?: string; memberId: string }) => {
    try { return ok(await requestAdminJson({ action: "project-workspace-member-remove", method: "POST", body: { workspaceId: id || activeOrganizationId, email: memberId } })); }
    catch (error) { return failure(error, "Failed to remove workspace member."); }
  },
  updateMemberRole: async ({ organizationId: id, memberId, role }: { organizationId?: string; memberId: string; role: string }) => {
    try { return ok(await requestAdminJson({ action: "project-workspace-member-update", method: "POST", body: { workspaceId: id || activeOrganizationId, member: { email: memberId, role } } })); }
    catch (error) { return failure(error, "Failed to update workspace member."); }
  },
  acceptInvitation: async ({ invitationId }: { invitationId: string }) => {
    try { return ok(await requestAdminJson({ action: "project-invitation-accept", method: "POST", body: { invitationId } })); }
    catch (error) { return failure(error, "Failed to accept invitation."); }
  },
  rejectInvitation: async () => unsupported(),
  cancelInvitation: async ({ invitationId }: { invitationId: string }) => {
    try { return ok(await requestAdminJson({ action: "project-invitation-cancel", method: "POST", body: { invitationId } })); }
    catch (error) { return failure(error, "Failed to cancel invitation."); }
  },
  listRoles: async ({ query = {} }: { query?: { organizationId?: string } } = {}) => {
    try {
      const result = await requestAdminJson<{ roles?: unknown[] }>({ action: "project-workspace-roles-list", query: { workspaceId: workspaceId({ query }) } });
      return ok(result.roles || []);
    } catch (error) { return failure<unknown[]>(error, "Failed to load workspace roles."); }
  },
  createRole: async ({ organizationId: id, role, permission }: { organizationId?: string; role: string; permission: Record<string, string[]> }) => {
    try { return ok(await requestAdminJson({ action: "project-workspace-role-create", method: "POST", body: { workspaceId: id || activeOrganizationId, role, permission } })); }
    catch (error) { return failure(error, "Failed to create workspace role."); }
  },
  updateRole: async ({ organizationId: id, roleName, data }: { organizationId?: string; roleName: string; data?: { permission?: Record<string, string[]> } }) => {
    try { return ok(await requestAdminJson({ action: "project-workspace-role-update", method: "POST", body: { workspaceId: id || activeOrganizationId, roleName, permission: data?.permission || {} } })); }
    catch (error) { return failure(error, "Failed to update workspace role."); }
  },
  deleteRole: async ({ organizationId: id, roleName }: { organizationId?: string; roleName: string }) => {
    try { return ok(await requestAdminJson({ action: "project-workspace-role-delete", method: "POST", body: { workspaceId: id || activeOrganizationId, roleName } })); }
    catch (error) { return failure(error, "Failed to delete workspace role."); }
  },
};

export const authClient: any = {
  useSession, useListOrganizations, useActiveOrganization, organization,
  getSession: async () => ok(sessionValue()),
  signIn: {
    social: async () => { try { const user = await signInWithGooglePopup(); return { data: sessionValue(user), error: null }; } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Sign in failed." } }; } },
    oauth2: async () => authClient.signIn.social(),
    email: async ({ email, password }: { email: string; password: string }) => {
      try { const result = await signInWithEmailAndPassword(auth, email.trim(), password); publishFirebaseUser(result.user); return { data: sessionValue(result.user), error: null }; }
      catch (error) { return { data: null, error: firebaseFailure(error) }; }
    },
    anonymous: async () => unsupported(), emailOtp: async () => unsupported(),
  },
  signUp: {
    email: async ({ name, email, password }: { name: string; email: string; password: string }, options?: { headers?: Record<string, string> }) => {
      const normalizedEmail = email.trim().toLowerCase();
      const invitationId = invitationIdFromOptions(options);
      const isKaramah = isKaramahEmail(normalizedEmail);
      if (!isKaramah && !invitationId) return { data: null, error: { code: "INVITATION_REQUIRED", message: "External collaborators can only sign up from an invitation." } };
      if (!isKaramah && invitationId) {
        try {
          const invitation = await requestAdminJson<{ valid?: boolean; invitation?: { email?: string; isExternal?: boolean } }>({ action: "project-invitation-get", query: { invitationId } });
          if (!invitation.valid || invitation.invitation?.email?.toLowerCase() !== normalizedEmail || invitation.invitation?.isExternal !== true) return { data: null, error: { code: "INVITATION_INVALID", message: "This invitation is invalid, expired, or belongs to another email." } };
        } catch (error) { return { data: null, error: firebaseFailure(error) }; }
      }
      try {
        const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        if (name.trim()) await updateProfile(result.user, { displayName: name.trim() });
        await sendEmailVerification(result.user, invitationId ? { url: `${window.location.origin}/invitation/accept/${encodeURIComponent(invitationId)}` } : undefined);
        publishFirebaseUser(result.user);
        return { data: sessionValue(result.user), error: null };
      } catch (error) { return { data: null, error: firebaseFailure(error) }; }
    },
  },
  signOut: async () => { await firebaseSignOut(auth); return { data: null, error: null }; },
  updateUser: async ({ name }: { name?: string } = {}) => {
    try {
      if (auth.currentUser && name !== undefined) await updateProfile(auth.currentUser, { displayName: name });
      if (auth.currentUser) publishFirebaseUser(auth.currentUser);
      return ok(sessionValue()?.user || null);
    } catch (error) { return { data: null, error: firebaseFailure(error) }; }
  },
  changePassword: async ({ newPassword }: { currentPassword?: string; newPassword: string }) => {
    try { if (!auth.currentUser) return { data: null, error: { message: "You are not signed in." } }; await updatePassword(auth.currentUser, newPassword); return ok(null); }
    catch (error) { return { data: null, error: firebaseFailure(error) }; }
  },
  deleteUser: async () => unsupported(),
  resetPassword: async ({ newPassword, token }: { newPassword: string; token: string }) => {
    try { await confirmPasswordReset(auth, token, newPassword); return ok(null); }
    catch (error) { const failure = firebaseFailure(error); return { data: null, error: { ...failure, code: ["expiredActionCode", "invalidActionCode"].includes(failure.code) ? "INVALID_TOKEN" : failure.code } }; }
  },
  requestPasswordReset: async ({ email, redirectTo }: { email: string; redirectTo?: string }) => {
    try { await sendPasswordResetEmail(auth, email.trim(), redirectTo ? { url: redirectTo } : undefined); return ok(null); }
    catch (error) { return { data: null, error: firebaseFailure(error) }; }
  },
  sendEmailVerification: async ({ continueUrl }: { continueUrl?: string } = {}) => {
    try { if (!auth.currentUser) return { data: null, error: { message: "You are not signed in." } }; await sendEmailVerification(auth.currentUser, continueUrl ? { url: continueUrl } : undefined); return ok(null); }
    catch (error) { return { data: null, error: firebaseFailure(error) }; }
  },
  reload: async () => { try { if (auth.currentUser) await reload(auth.currentUser); publishFirebaseUser(auth.currentUser); return ok(sessionValue()); } catch (error) { return { data: null, error: firebaseFailure(error) }; } },
  listAccounts: async () => ok([]), linkSocial: async () => unsupported(), getLastUsedLoginMethod: () => "google",
  admin: { hasPermission: async ({ permissions = {} } = {}) => organization.hasPermission({ permissions }), updateUser: async () => unsupported(), banUser: async () => unsupported(), unbanUser: async () => unsupported(), removeUser: async () => unsupported() },
  emailOtp: { sendVerificationOtp: async () => unsupported() }, device: async () => unsupported(),
};

export async function getAdminProjects() {
  return requestAdminJson<{ projects: unknown[] }>({ action: "project-list" });
}
