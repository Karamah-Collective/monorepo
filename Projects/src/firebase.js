import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const config = {
  apiKey: "AIzaSyA8eOK1dL3hzz6cbQ2C73S4K4IQv9foMGU",
  authDomain: "auth.karamahcollective.com",
  projectId: "halal-map-karamah",
  appId: "1:372947925614:web:e4f700b0512e1aa25bc47f",
};

const app = initializeApp(config);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: "karamahcollective.com", prompt: "select_account" });
export const ADMIN_ORIGIN = import.meta.env.VITE_ADMIN_ORIGIN || "https://admin.karamahcollective.com";
