import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { auth, ADMIN_EMAIL_DOMAIN } from "../firebase.js";
import { logAuthEvent } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  function isAllowedEmail(email) {
    return typeof email === "string" && email.toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
  }

  async function signIn(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
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

  const value = { user, loading, signIn, signUp, signOut, getIdToken, reloadUser, isAllowedEmail };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
