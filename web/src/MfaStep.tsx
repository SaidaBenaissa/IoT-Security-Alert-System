// src/MfaStep.tsx
import { useEffect, useRef, useState } from "react";
import { auth } from "./firebase";

const WORKER_BASE = "https://dry-wildflower-2539.saaidabenaissa.workers.dev";

function decodeJwtPayload(t?: string): any|null {
  try {
    if (!t) return null;
    const p = t.split(".")[1];
    const s = p.replace(/-/g,"+").replace(/_/g,"/") + "==".slice((2 - p.length*3) & 3);
    return JSON.parse(atob(s));
  } catch { return null; }
}

export default function MfaStep({ uid, onOk }: { uid: string; onOk: () => void }) {
  const [code, setCode]   = useState("");
  const [msg, setMsg]     = useState("");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<number|string>("");
  const sentRef = useRef(false);

  const send = async (s: number|string, requestId?: string) => {
    setErr(""); setMsg(""); setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken(false);
      const email   = auth.currentUser?.email || undefined;
      const reqId   = requestId ?? crypto.randomUUID();

      const r = await fetch(`${WORKER_BASE}/mfa/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, uid, email, session: s, requestId: reqId })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "mfa/start failed");
      setMsg(j.already_pending ? "Code existant toujours valide." : "Code envoyé à votre email.");
    } catch (e:any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    (async () => {
      const tok = await auth.currentUser?.getIdToken(false);
      const payload = decodeJwtPayload(tok);
      const s = payload?.auth_time ?? Math.floor(Date.now()/1000);
      setSession(s);
      await send(s, crypto.randomUUID());
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      const r = await fetch(`${WORKER_BASE}/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, uid, code, session })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "mfa/verify failed");
      setMsg("2FA validé !");
      onOk();
    } catch (e:any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">Authentification à deux facteurs</h3>
        <p className="text-gray-600 mb-6">Nous avons envoyé un code à 6 chiffres à votre email.</p>
        
        <button
          onClick={() => session && send(session, crypto.randomUUID())}
          disabled={loading}
          className="w-full mb-6 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition disabled:opacity-50"
        >
          Renvoyer le code
        </button>

        <form onSubmit={verify} className="space-y-4">
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="Entrez le code à 6 chiffres"
            className="w-full p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg"
          />
          <button
            disabled={loading || code.length !== 6}
            type="submit"
            className="w-full p-4 bg-black hover:bg-gray-800 text-white font-semibold rounded-xl transition disabled:opacity-50"
          >
            Vérifier
          </button>
        </form>

        {msg && <p className="mt-4 text-green-600 text-center">{msg}</p>}
        {err && <p className="mt-4 text-red-600 text-center">{err}</p>}
      </div>
    </div>
  );
}