"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type ApptInfo = {
  id: string;
  starts_at: string;
  duration_min: number | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED" | null;
  client_name: string;
  client_email: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });
}

export default function AppointmentManagePage() {
  const params = useParams();
  const search = useSearchParams();
  const token = params?.token as string;
  const action = search.get("action");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<ApptInfo | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const actionLabel = useMemo(() => {
    if (action === "confirm") return "Termin bestätigen";
    if (action === "cancel") return "Termin absagen";
    if (action === "reschedule") return "Termin verschieben";
    return "Termin verwalten";
  }, [action]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("appointment-actions", {
        body: { action: "get", token },
      });
      if (!alive) return;
      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }
      setInfo(data?.appointment ?? null);
      setLoading(false);
    }
    if (token) load();
    return () => {
      alive = false;
    };
  }, [token]);

  async function runAction(nextAction: "confirm" | "cancel") {
    setMsg("");
    const { data, error } = await supabase.functions.invoke("appointment-actions", {
      body: { action: nextAction, token },
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setInfo(data?.appointment ?? info);
    setMsg(nextAction === "confirm" ? "Termin bestätigt." : "Termin abgesagt.");
  }

  async function reschedule() {
    setMsg("");
    if (!newDate || !newTime) {
      setMsg("Bitte Datum und Uhrzeit wählen.");
      return;
    }
    const startsISO = new Date(`${newDate}T${newTime}:00`).toISOString();
    const { data, error } = await supabase.functions.invoke("appointment-actions", {
      body: { action: "reschedule", token, starts_at: startsISO },
    });
    if (error) {
      setMsg(error.message);
      return;
    }
    setInfo(data?.appointment ?? info);
    setMsg("Termin verschoben.");
  }

  return (
    <div className="page" style={{ padding: "34px 0" }}>
      <div className="surface pad" style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>{actionLabel}</h1>
        <div style={{ marginTop: 6, opacity: 0.7 }}>
          Bitte bestätigen oder ändern Sie Ihren Termin.
        </div>

        {loading ? (
          <div style={{ marginTop: 16 }}>Lade Termin…</div>
        ) : info ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700 }}>{info.client_name}</div>
            <div style={{ opacity: 0.8 }}>{info.client_email}</div>
            <div style={{ marginTop: 10 }}>
              Termin: <b>{formatDateTime(info.starts_at)}</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
              Status: {info.status ?? "—"}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-appointment" onClick={() => runAction("confirm")}>
                Bestätigen
              </button>
              <button className="btn ghost" onClick={() => runAction("cancel")}>
                Absagen
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="label">Termin verschieben</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <input
                  className="input"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
                <input
                  className="input"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={reschedule}>
                  Verschieben
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>Termin nicht gefunden.</div>
        )}

        {msg ? <div style={{ marginTop: 16, opacity: 0.8 }}>{msg}</div> : null}
      </div>
    </div>
  );
}
