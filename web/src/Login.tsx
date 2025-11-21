// src/Login.tsx
import { useState } from "react";
import { auth } from "./firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendEmailVerification,
  reload,
  signOut,
} from "firebase/auth";
import { logEvent } from "./supabase";

export default function Login({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false); 
  const [emailLoading, setEmailLoading] = useState(false);   
  const [needVerify, setNeedVerify] = useState(false);

  const loginGoogle = async () => {
    setErr(""); setInfo(""); setNeedVerify(false); 
    setGoogleLoading(true); 
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // 🔥 LOG Google Login (non-bloquant)
      logEvent('GOOGLE_LOGIN_ATTEMPT', {
        email: result.user.email,
        uid: result.user.uid,
        provider: 'google'
      }, result.user.uid).catch(console.error);
      
      console.log('Google login successful');

    } catch (e: any) {
      // 🔥 LOG Google Login Error (non-bloquant)
      logEvent('GOOGLE_LOGIN_ERROR', {
        email: email,
        error: e.message,
        provider: 'google'
      }).catch(console.error);
      
      setErr(e.message || "Échec de la connexion Google");
    } finally {
      setGoogleLoading(false); 
    }
  };

  const loginEmail = async (e: React.FormEvent) => {
  e.preventDefault();
  setErr(""); setInfo(""); setNeedVerify(false); 
  setEmailLoading(true); 
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
    
    // 🔥 LOG Email Login Attempt (NON-BLOQUANT)
    logEvent('EMAIL_LOGIN_ATTEMPT', {
      email: cred.user.email,
      uid: cred.user.uid,
      emailVerified: cred.user.emailVerified,
      providers: cred.user.providerData.map(p => p.providerId) // ← AJOUT
    }, cred.user.uid).catch(console.error);

    console.log('🔐 Login successful - waiting for Guard MFA check');
    // Le Guard va maintenant gérer la redirection vers MFA
    
  } catch (e: any) {
      // 🔥 LOG Email Login Error (non-bloquant)
      logEvent('EMAIL_LOGIN_ERROR', {
        email: email,
        error: e.message
      }).catch(console.error);
      
      setErr(e.message || "Échec de la connexion par email");
    } finally {
      setEmailLoading(false); 
    }
  };

  const iveVerified = async () => {
    try {
      setErr(""); setInfo("Vérification…");
      await reload(auth.currentUser!);
      
      if (auth.currentUser?.emailVerified) {
        // 🔥 LOG Email Verified (non-bloquant)
        logEvent('EMAIL_VERIFIED', {
          email: auth.currentUser.email,
          uid: auth.currentUser.uid
        }, auth.currentUser.uid).catch(console.error);
        
        setNeedVerify(false);
      } else {
        setErr("Email non vérifié.");
      }
    } catch (e: any) { 
      setErr(e.message); 
    }
  };

  if (needVerify) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Vérification Email</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <p className="text-gray-700">
              Nous avons envoyé un lien à <b>{auth.currentUser?.email}</b>.
            </p>
            {info && <p className="text-emerald-600 mt-2">{info}</p>}
            {err && <p className="text-red-600 mt-2">{err}</p>}
            <div className="flex gap-3 mt-4 flex-wrap">
              <button
                onClick={() => auth.currentUser && sendEmailVerification(auth.currentUser)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition"
              >
                Renvoyer
              </button>
              <button
                onClick={iveVerified}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-gray-800 font-semibold transition"
              >
                J'ai vérifié
              </button>
              <button
                onClick={() => signOut(auth)}
                className="px-4 py-2 rounded-xl bg-white border hover:bg-gray-50 transition"
              >
                Changer de compte
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-12 flex flex-col justify-center">
        <h2 className="text-4xl font-extrabold mb-10 text-center text-gray-800">Connexion</h2>
        
        {/* Google Button - Accès direct sans MFA */}
        <div className="mb-6">
          <button
            disabled={googleLoading || emailLoading}
            onClick={loginGoogle}
            className="w-full flex items-center justify-center gap-3 bg-[#4285F4] hover:bg-[#3a76d8] text-white font-semibold py-4 rounded-2xl shadow-lg text-lg transition disabled:opacity-60"
          >
            <img
              src="https://www.svgrepo.com/show/355037/google.svg"
              alt="Google"
              className="w-6 h-6 bg-white rounded-full p-1"
            />
            {googleLoading ? "Connexion Google..." : "Se connecter avec Google"}
          </button>
        </div>

        <div className="opacity-60 text-center my-6">ou</div>

        {/* Email/Password - Avec MFA requis */}
        <div>
          <form onSubmit={loginEmail} className="space-y-6">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Email</label>
              <input
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full p-4 border border-gray-300 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md text-lg transition"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Mot de passe</label>
              <input
                type="password"
                placeholder="********"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                className="w-full p-4 border border-gray-300 rounded-2xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md text-lg transition"
              />
            </div>

            <button
              type="submit"
              disabled={emailLoading || googleLoading}
              className="w-full bg-black hover:bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-lg text-lg transition disabled:opacity-60"
            >
              {emailLoading ? "Connexion Email..." : "Se connecter"}
            </button>
          </form>
        </div>

        {err && <p className="text-red-600 text-sm mt-4 text-center font-medium">{err}</p>}
        {info && <p className="text-emerald-600 text-sm mt-4 text-center font-medium">{info}</p>}

        <p className="text-gray-500 text-center mt-8 text-sm">© 2025 IoT Dashboard</p>
      </div>
    </div>
  );
}