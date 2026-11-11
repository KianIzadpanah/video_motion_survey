// Thin wrapper that loads the Firebase SDK from Google's CDN only when needed.
import { FIREBASE_CONFIG } from "../config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export const firebaseConfigured =
  typeof FIREBASE_CONFIG.apiKey === "string" &&
  FIREBASE_CONFIG.apiKey.length > 0 &&
  !FIREBASE_CONFIG.apiKey.startsWith("PASTE");

let appPromise;
let dbPromise;
let authPromise;

function getApp() {
  if (!appPromise) {
    appPromise = import(`${SDK}/firebase-app.js`).then(({ initializeApp }) => initializeApp(FIREBASE_CONFIG));
  }
  return appPromise;
}

/** Returns { db, fs } where fs is the Firestore module namespace. */
export function getFirestoreKit() {
  if (!dbPromise) {
    dbPromise = Promise.all([getApp(), import(`${SDK}/firebase-firestore.js`)]).then(([app, fs]) => ({
      db: fs.initializeFirestore(app, { ignoreUndefinedProperties: true }),
      fs,
    }));
  }
  return dbPromise;
}

/** Returns { auth, au } where au is the Auth module namespace. */
export function getAuthKit() {
  if (!authPromise) {
    authPromise = Promise.all([getApp(), import(`${SDK}/firebase-auth.js`)]).then(([app, au]) => ({
      auth: au.getAuth(app),
      au,
    }));
  }
  return authPromise;
}
