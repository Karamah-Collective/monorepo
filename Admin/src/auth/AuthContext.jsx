import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { auth, ADMIN_EMAIL_DOMAIN, googleProvider } from "../firebase.js";
import { apiGet, apiPost, logAuthEvent } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const hasResolvedInitialAuth = useRef(false);

  const refreshAccess = useCallback(async () => {
    const nextAccess = (await apiGet("admin-access")).access;
    setAccess(nextAccess);
    return nextAccess;
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      const isInitialAuthState = !hasResolvedInitialAuth.current;
      hasResolvedInitialAuth.current = true;
      setUser(u);
      if (!u) { setAccess(null); setLoading(false); return; }
      try { await refreshAccess(); } catch { setAccess(null); }
      if (isInitialAuthState) void logAuthEvent("login");
      setLoading(false);
    });
  }, [refreshAccess]);

  function isAllowedEmail(email) {
    return typeof email === "string" && email.toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
  }

  async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await refreshAccess();
    await logAuthEvent("login");
    return cred.user;
  }

  async function signInWithGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    if (!isAllowedEmail(cred.user.email)) {
      await firebaseSignOut(auth);
      throw new Error(`Use a ${ADMIN_EMAIL_DOMAIN} Google Workspace account.`);
    }
    await refreshAccess();
    await logAuthEvent("login");
    return cred.user;
  }

  async function signUp(name, email, password) {
    if (!isAllowedEmail(email)) {
      throw new Error(`Please use your ${ADMIN_EMAIL_DOMAIN} email address to sign up.`);
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    await logAuthEvent("signup");
    return cred.user;
  }

  async function signOut() {
    setAccess(null);
    await firebaseSignOut(auth);
  }

  async function getIdToken() {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }

  async function reloadUser() {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser({ ...auth.currentUser });
  }
  async function updateDisplayName(displayName) {
    if (!auth.currentUser) throw new Error("Not signed in");
    const saved = await apiPost("save-my-profile", { displayName: displayName.trim() });
    const value = saved.displayName || "";
    await updateProfile(auth.currentUser, { displayName: value });
    setUser({ ...auth.currentUser });
    setAccess(current => current ? { ...current, displayName: value } : current);
  }
  async function changePassword(password) {
    if (!auth.currentUser) throw new Error("Not signed in");
    await updatePassword(auth.currentUser, password);
  }
  async function requestEmailChange(email) {
    if (!auth.currentUser) throw new Error("Not signed in");
    if (!isAllowedEmail(email)) throw new Error(`Use a ${ADMIN_EMAIL_DOMAIN} email address.`);
    await verifyBeforeUpdateEmail(auth.currentUser, email.trim().toLowerCase());
  }

  const value = { user, loading, access, signIn, signInWithGoogle, signUp, signOut, getIdToken, reloadUser, updateDisplayName, changePassword, requestEmailChange, refreshAccess, isAllowedEmail };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
