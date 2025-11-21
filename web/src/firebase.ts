// src/firebase.ts
// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAIkm7ts3cjUNfBpDj_DwAAH3S0gzWlz6c",
  authDomain: "iot-security-11.firebaseapp.com",
  databaseURL: "https://iot-security-11-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iot-security-11",
  storageBucket: "iot-security-11.firebasestorage.app",
  messagingSenderId: "857717164447",
  appId: "1:857717164447:web:b7c3e3dec9aa0beb54d5aa",
  measurementId: "G-SWSQGMB7P1"
};

// Init
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const performance = getPerformance(app);

// Protéger Analytics/Perf (ne pas bloquer l'app si non supportés)
export let analytics: ReturnType<typeof getAnalytics> | undefined;
export let perf: ReturnType<typeof getPerformance> | undefined;

if (typeof window !== "undefined") {
  try { analytics = getAnalytics(app); } catch {}
  try { perf = getPerformance(app); } catch {}
}