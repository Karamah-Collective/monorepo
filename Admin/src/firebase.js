import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Same public, non-secret client config as the public site's src/config.js
// (FIREBASE_CONFIG) — keep both in sync if the Firebase project ever rotates
// its web app config.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA8eOK1dL3hzz6cbQ2C73S4K4IQv9foMGU",
  authDomain: "halal-map-karamah.firebaseapp.com",
  projectId: "halal-map-karamah",
  appId: "1:372947925614:web:e4f700b0512e1aa25bc47f",
};

export const ADMIN_EMAIL_DOMAIN = "@karamahcollective.com";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
