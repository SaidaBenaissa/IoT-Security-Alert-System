import { useEffect, useState } from "react";
import { onAuthStateChanged, reload, sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { isAdmin } from "./db";
import Login from "./Login";
import MfaStep from "./MfaStep";

type Phase = "loading" | "need-login" | "need-verify" | "need-mfa" | "denied" | "ok";

export default function Guard({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [uid, setUid] = useState<string | null>(null);

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
        await reload(u);
        
        // 1) Vérifier si admin
        const allowed = await isAdmin(u.uid);
        if (!allowed) { 
          console.log('❌ Guard: Access denied - not an admin');
          setPhase("denied"); 
          return; 
        }

        // 2) Identifier méthode d'authentification
        const providers = u.providerData.map((p: any) => p.providerId);
        const isGoogle = providers.includes("google.com");
        const isEmail = providers.includes("password");

        console.log('🔐 Auth method:', { isGoogle, isEmail, emailVerified: u.emailVerified });

        // 3) 🔥 LOGIQUE SIMPLIFIÉE - MFA TOUJOURS pour EMAIL
        if (isEmail) {
          if (!u.emailVerified) {
            console.log('📧 Email not verified');
            setPhase("need-verify");
          } else {
            console.log('🔐 Email user - MFA REQUIRED');
            setPhase("need-mfa");
          }
        } else if (isGoogle) {
          console.log('✅ Google user - Direct access');
          setPhase("ok");
        } else {
          console.log('🔐 Other method - MFA required');
          setPhase("need-mfa");
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

  if (phase === "need-mfa" && uid) {
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