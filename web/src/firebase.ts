// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getPerformance } from "firebase/performance";


// Your web app's Firebase configuration
const firebaseConfig = {
 
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
