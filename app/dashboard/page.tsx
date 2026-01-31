"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      if (alive) setEmail(data.session.user.email ?? "");
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
      else setEmail(session.user.email ?? "");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "40px auto",
        fontFamily: "system-ui",
        padding: 20,
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>empulse Dashboard</h1>
        <p style={{ color: "#6b7280" }}>
          {email ? `Angemeldet als ${email}` : "Lade..."}
        </p>
      </header>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Schnellzugriff</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
          }}
        >
          <Link href="/clients" style={{ textDecoration: "none" }}>
            <ActionCard title="➕ Kunde anlegen" text="Neue Kund:innen erfassen" />
          </Link>

          <Link href="/sessions" style={{ textDecoration: "none" }}>
            <ActionCard title="📝 Session dokumentieren" text="Behandlung erfassen" />
          </Link>

          <Link href="/clients" style={{ textDecoration: "none" }}>
            <ActionCard title="📊 Verlauf ansehen" text="Kundenhistorie" />
          </Link>

          <Link href="/webinars" style={{ textDecoration: "none" }}>
            <ActionCard title="🎥 Webinar" text="Schulungen & Inhalte" />
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 16 }}>Übersicht</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
          }}
        >
          <StatCard label="Kunden" value="–" />
          <StatCard label="Sessions" value="–" />
          <StatCard label="Heute" value="–" />
        </div>
      </section>
    </main>
  );
}

function ActionCard({ title, text }: { title: string; text: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg,#0b3354,#0098d8)",
        color: "white",
        padding: 20,
        borderRadius: 16,
        cursor: "pointer",
        boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
      }}
    >
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      <p style={{ opacity: 0.9 }}>{text}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        borderRadius: 14,
        padding: 20,
        border: "1px solid #e5e7eb",
      }}
    >
      <p style={{ color: "#6b7280", marginBottom: 6 }}>{label}</p>
      <strong style={{ fontSize: 24 }}>{value}</strong>
    </div>
  );
}
