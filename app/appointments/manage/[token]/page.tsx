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
  const statusTone: Record<
    NonNullable<ApptInfo["status"]>,
    { label: string; tone: "green" | "amber" | "red" | "blue" }
  > = {
    PENDING: { label: "Ausstehend", tone: "amber" },
    CONFIRMED: { label: "Bestätigt", tone: "green" },
    CANCELLED: { label: "Abgesagt", tone: "red" },
    RESCHEDULED: { label: "Verschoben", tone: "blue" },
  };

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<ApptInfo | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const explicitAction =
    action === "cancel" || action === "reschedule" || action === "confirm" ? action : null;
  const preferredAction = explicitAction ?? "confirm";
  const [activeAction, setActiveAction] = useState<"confirm" | "cancel" | "reschedule">("confirm");

  // keep state in sync with URL / defaults
  useEffect(() => {
    setActiveAction(preferredAction);
  }, [preferredAction]);

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setMsg("Supabase env fehlt.");
      setLoading(false);
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };
    const res = await fetch(`${supabaseUrl}/functions/v1/appointment-actions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "get", token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!alive) return;
    if (!res.ok || data?.error) {
      setMsg(data?.error || `HTTP ${res.status}`);
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setMsg("Supabase env fehlt.");
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };
    const res = await fetch(`${supabaseUrl}/functions/v1/appointment-actions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: nextAction, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      setMsg(data?.error || `HTTP ${res.status}`);
      return;
    }
    setInfo(data?.appointment ?? info);
    setMsg(nextAction === "confirm" ? "Termin bestätigt." : "Termin abgesagt.");
  }

  function selectAction(action: "confirm" | "cancel" | "reschedule") {
    setActiveAction(action);
    setMsg("");
  }

  async function reschedule() {
    setMsg("");
    if (!newDate || !newTime) {
      setMsg("Bitte Datum und Uhrzeit wählen.");
      return;
    }
    const startsISO = new Date(`${newDate}T${newTime}:00`).toISOString();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setMsg("Supabase env fehlt.");
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };
    const res = await fetch(`${supabaseUrl}/functions/v1/appointment-actions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "reschedule", token, starts_at: startsISO }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      setMsg(data?.error || `HTTP ${res.status}`);
      return;
    }
    setInfo(data?.appointment ?? info);
    setMsg("Termin verschoben.");
  }

  return (
    <div className="page appt-manage-page">
      <div className="appt-card">
        <div className="appt-card__head">
          <div>
            <div className="eyebrow">Appointment</div>
            <h1 className="appt-title">{actionLabel}</h1>
            <p className="appt-sub">Bitte bestätigen oder ändern Sie Ihren Termin.</p>
          </div>
          {info && (
            <div
              className={`status-chip tone-${
                info.status ? statusTone[info.status].tone : "amber"
              }`}
            >
              {info.status ? statusTone[info.status].label : "Unbekannt"}
            </div>
          )}
        </div>

        {loading ? (
          <div className="appt-ghost">Lade Termin…</div>
        ) : info ? (
          <>
            <div className="appt-meta">
              <div>
                <div className="meta-label">Name</div>
                <div className="meta-value strong">{info.client_name}</div>
              </div>
              <div>
                <div className="meta-label">E-Mail</div>
                <div className="meta-value">{info.client_email}</div>
              </div>
              <div>
                <div className="meta-label">Termin</div>
                <div className="meta-value strong">{formatDateTime(info.starts_at)}</div>
              </div>
            </div>

            {!explicitAction && (
              <div className="appt-actions">
                <button
                  className={`btn-appointment ${activeAction === "confirm" ? "is-active" : ""}`}
                  onClick={() => selectAction("confirm")}
                >
                  Bestätigen
                </button>
                <button
                  className={`btn-appointment danger ${activeAction === "cancel" ? "is-active" : ""}`}
                  onClick={() => selectAction("cancel")}
                >
                  Absagen
                </button>
                <button
                  className={`btn-appointment ${activeAction === "reschedule" ? "is-active" : ""}`}
                  onClick={() => selectAction("reschedule")}
                >
                  Verschieben
                </button>
              </div>
            )}

            {activeAction === "confirm" && (
              <div className="appt-single-action">
                <button className="btn-appointment" onClick={() => runAction("confirm")}>
                  Jetzt bestätigen
                </button>
              </div>
            )}

            {activeAction === "cancel" && (
              <div className="appt-panel">
                <div className="meta-label">Termin absagen</div>
                <p className="appt-help">Der Termin wird storniert und steht wieder frei.</p>
                <button className="btn-appointment danger" onClick={() => runAction("cancel")}>
                  Termin absagen
                </button>
              </div>
            )}

            {activeAction === "reschedule" && (
              <div className="appt-panel">
                <div className="meta-label">Termin verschieben</div>
                <p className="appt-help">Neuen Zeitpunkt auswählen und speichern.</p>
                <div className="appt-reschedule__grid">
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
                  <button className="btn-appointment" onClick={reschedule}>
                    Verschieben
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="appt-ghost">Termin nicht gefunden.</div>
        )}

        {msg ? <div className="appt-msg">{msg}</div> : null}
      </div>
    </div>
  );
}
