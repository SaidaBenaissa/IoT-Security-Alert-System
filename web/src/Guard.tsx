// src/Guard.tsx
import { useEffect, useState } from "react";
import { onAuthStateChanged, reload, sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { isAdmin } from "./db";
import Login from "./Login";
import MfaStep from "./MfaStep";

type Phase = "loading" | "need-login" | "need-verify" | "need-mfa" | "denied" | "ok";

function decodeJwtPayload(t?: string): any|null {
  try {
    if (!t) return null;
    const p = t.split(".")[1];
    const s = p.replace(/-/g,"+").replace(/_/g,"/") + "==".slice((2 - p.length*3) & 3);
    return JSON.parse(atob(s));
  } catch { return null; }
}

// Add missing isMfaOk function (you'll need to implement this based on your MFA logic)
async function isMfaOk(uid: string, session: number): Promise<boolean> {
  // Implement your MFA validation logic here
  // This should check if MFA has been completed for this session
  console.log('🔐 Checking MFA status for:', { uid, session });
  return false; // Default to false until implemented
}

export default function Guard({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [uid, setUid] = useState<string | null>(null);
  const [session, setSession] = useState<number | null>(null);

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      console.log('🔄 Guard: Auth state changed:', u?.email);
      
      if (!u) {
        setPhase("need-login");
        setUid(null);
        return;
      }

      setUid(u.uid);

      try {
        // Identifier la méthode d'authentification
        const providers = u.providerData.map(p => p.providerId);
        const isPassword = providers.includes("password");
        const isGoogle = providers.includes("google.com");

        console.log('🔐 Auth method:', { isPassword, isGoogle, providers });

        // Recharger les données utilisateur
        await reload(u);
        
        // Vérifier si admin (OBLIGATOIRE pour tous)
        console.log('🔐 Guard: Checking admin status for:', u.uid);
        const allowed = await isAdmin(u.uid);
        if (!allowed) { 
          console.log('❌ Guard: Access denied - not an admin');
          setPhase("denied"); 
          return; 
        }

        // Session (auth_time du token)
        const idToken = await u.getIdToken(false);
        const payload = decodeJwtPayload(idToken);
        const sess = payload?.auth_time ?? null;
        setSession(sess);

        // LOGIQUE D'AUTHENTIFICATION SIMPLIFIÉE :
        // - Google: Accès DIRECT après vérification admin
        // - Email: Vérification email + MFA OBLIGATOIRE
        
        if (isGoogle) {
          // Utilisateur Google → Accès DIRECT
          console.log('✅ Google user - MFA skipped, direct access');
          setPhase("ok");
        } else if (isPassword) {
          // Utilisateur Email → Vérifier email puis MFA
          if (!u.emailVerified) {
            console.log('📧 Email not verified');
            setPhase("need-verify");
          } else {
            console.log('🔐 Email user - MFA required');
            const mfaValid = (sess != null) ? await isMfaOk(u.uid, sess) : false;
            console.log('📊 MFA validation result:', mfaValid);
            setPhase(mfaValid ? "ok" : "need-mfa");
          }
        } else {
          // Autre méthode → MFA requis par défaut
          console.log('🔐 Other auth method - MFA required');
          const mfaValid = (sess != null) ? await isMfaOk(u.uid, sess) : false;
          setPhase(mfaValid ? "ok" : "need-mfa");
        }
      } catch (error) {
        console.error('❌ Error in auth flow:', error);
        setPhase("need-login");
      }
    });
    return () => off();
  }, []);

  // Écrans selon phase
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Vérification de sécurité...</p>
        </div>
      </div>
    );
  }

  if (phase === "need-login") {
    return <Login onOk={() => setPhase("ok")} />;
  }

  if (phase === "need-verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Vérifiez votre email</h3>
          <p className="text-gray-600 mb-4">
            Nous avons envoyé un lien de vérification à <b>{auth.currentUser?.email}</b>.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button 
              onClick={() => auth.currentUser && sendEmailVerification(auth.currentUser)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Renvoyer
            </button>
            <button 
              onClick={async () => {
                if (auth.currentUser) { 
                  await reload(auth.currentUser); 
                  if (auth.currentUser.emailVerified) {
                    // Redémarrer le processus de vérification
                    setPhase("loading");
                  }
                }
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
            >
              J'ai vérifié
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition"
            >
              Changer de compte
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h3 className="text-xl font-bold text-red-600 mb-4">Accès refusé</h3>
          <p className="text-gray-600 mb-4">Vous n'êtes pas autorisé à accéder à cette application.</p>
          <button 
            onClick={() => signOut(auth)}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
          >
            Changer de compte
          </button>
        </div>
      </div>
    );
  }

  if (phase === "need-mfa" && uid && session != null) {
    return (
      <MfaStep 
        uid={uid} 
        onOk={() => {
          console.log('✅ MFA validated, accessing dashboard');
          setPhase("ok");
        }} 
      />
    );
  }

  return <>{children}</>;
}
