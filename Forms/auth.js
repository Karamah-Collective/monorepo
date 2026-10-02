import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, linkWithCredential } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebase = initializeApp({ apiKey: "AIzaSyA8eOK1dL3hzz6cbQ2C73S4K4IQv9foMGU", authDomain: "auth.karamahcollective.com", projectId: "halal-map-karamah", appId: "1:372947925614:web:e4f700b0512e1aa25bc47f" });
const auth = getAuth(firebase), google = new GoogleAuthProvider(), facebook = new FacebookAuthProvider(), microsoft = new OAuthProvider("microsoft.com");
microsoft.addScope("User.Read");
facebook.addScope("public_profile");
facebook.addScope("email");
let pendingFacebookCredential = null;

async function linkPendingFacebookCredential(user) {
  const pending = pendingFacebookCredential;
  if (!pending || !user || (user.email || "").toLowerCase() !== pending.email) return;
  try {
    await linkWithCredential(user, pending.credential);
    pendingFacebookCredential = null;
  } catch (error) {
    // A credential can be linked only once. Keep the user's successful
    // existing-account sign-in even when Facebook has already been linked.
    if (error?.code === "auth/provider-already-linked" || error?.code === "auth/credential-already-in-use") pendingFacebookCredential = null;
    else throw error;
  }
}

export const currentUser = () => auth.currentUser;
export const getToken = async () => auth.currentUser ? auth.currentUser.getIdToken() : "";
export const watchAuth = callback => onAuthStateChanged(auth, callback);
export async function signInProvider(provider) {
  try {
    const credential = await signInWithPopup(auth, provider === "microsoft" ? microsoft : provider === "facebook" ? facebook : google);
    await linkPendingFacebookCredential(credential.user);
    return credential;
  } catch (error) {
    if (provider === "facebook" && error?.code === "auth/account-exists-with-different-credential") {
      const credential = FacebookAuthProvider.credentialFromError(error);
      const email = String(error?.customData?.email || error?.email || "").trim().toLowerCase();
      if (credential && email) pendingFacebookCredential = { credential, email };
    }
    throw error;
  }
}
export async function signInEmail(email, password, create = false) {
  if (create) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(credential.user); await signOut(auth);
    const verification = new Error("verification-sent"); verification.code = "auth/verification-sent"; throw verification;
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await linkPendingFacebookCredential(credential.user);
    return credential;
  }
  catch (error) {
    if (error?.code === "auth/invalid-credential" || error?.code === "auth/user-not-found") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user); await signOut(auth);
      const verification = new Error("verification-sent"); verification.code = "auth/verification-sent"; throw verification;
    }
    throw error;
  }
}
export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const signOutUser = () => signOut(auth);
