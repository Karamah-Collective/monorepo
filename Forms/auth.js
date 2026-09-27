import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, FacebookAuthProvider, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebase = initializeApp({ apiKey: "AIzaSyA8eOK1dL3hzz6cbQ2C73S4K4IQv9foMGU", authDomain: "halal-map-karamah.firebaseapp.com", projectId: "halal-map-karamah", appId: "1:372947925614:web:e4f700b0512e1aa25bc47f" });
const auth = getAuth(firebase), google = new GoogleAuthProvider(), facebook = new FacebookAuthProvider(), microsoft = new OAuthProvider("microsoft.com");
microsoft.addScope("User.Read");

export const currentUser = () => auth.currentUser;
export const getToken = async () => auth.currentUser ? auth.currentUser.getIdToken() : "";
export const watchAuth = callback => onAuthStateChanged(auth, callback);
export async function signInProvider(provider) { return signInWithPopup(auth, provider === "microsoft" ? microsoft : provider === "facebook" ? facebook : google); }
export async function signInEmail(email, password, create = false) {
  if (create) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(credential.user); await signOut(auth);
    const verification = new Error("verification-sent"); verification.code = "auth/verification-sent"; throw verification;
  }
  try { return await signInWithEmailAndPassword(auth, email, password); }
  catch (error) {
    if (error?.code === "auth/invalid-credential" || error?.code === "auth/user-not-found") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user); await signOut(auth);
      const verification = new Error("verification-sent"); verification.code = "auth/verification-sent"; throw verification;
    }
    throw error;
  }
}
export const signOutUser = () => signOut(auth);
