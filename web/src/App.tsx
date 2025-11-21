// src/App.tsx
import React, { useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Guard from "./Guard";
import Dashboard from "./Dashboard";
import Login from "./Login";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔄 App: Auth state changed:', user?.email);
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!user ? (
        // Si pas d'utilisateur → Page de connexion
        <Login onOk={() => {}} />
      ) : (
        // Si utilisateur connecté → Guard gère le reste
        <Guard>
          <Dashboard />
        </Guard>
      )}
    </div>
  );
}

export default App;