"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  // ✅ Wenn Session existiert -> sofort weg von /login
  useEffect(() => {
    let mounted = true;

    async function go() {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) {
        router.replace("/dashboard");
      }
    }

    go();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/dashboard");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function signUp() {
    setMsg("...");
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? error.message : "Account erstellt. Jetzt einloggen.");
  }

  async function signIn() {
    setMsg("...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Eingeloggt ✅");
    router.refresh();
    router.replace("/dashboard");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.refresh();
    router.replace("/login");
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Login</h1>

      <label style={{ display: "block", marginTop: 16 }}>E-Mail</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 6 }}
      />

      <label style={{ display: "block", marginTop: 16 }}>Passwort</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        style={{ width: "100%", padding: 10, marginTop: 6 }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={signUp} style={{ padding: 10, flex: 1 }}>
          Sign Up
        </button>
        <button onClick={signIn} style={{ padding: 10, flex: 1 }}>
          Sign In
        </button>
      </div>

      <button onClick={signOut} style={{ padding: 10, marginTop: 10, width: "100%" }}>
        Sign Out
      </button>

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}
