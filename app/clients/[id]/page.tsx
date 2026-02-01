"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import PageShell from "../../ui/PageShell";
import Surface from "../../ui/Surface";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";


import { X, Pencil, Trash2, CheckCircle2, RotateCcw } from "lucide-react";

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  goals: string | null;
  notes: string | null;
  health_flag?: boolean | null;
  health_check_passed?: boolean | null;
  health_check_flags?: string | null;
  consent_name?: string | null;
  consent_location?: string | null;
  consent_signature?: string | null;
  consent_signed_at?: string | null;
};

type Appointment = {
  id: string;
  starts_at: string; // timestamptz
  duration_min: number | null;
  notes: string | null;
  status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED" | null;
};

type Session = {
  id: string;
  session_date: string; // YYYY-MM-DD
  location: string | null;
  focus: string | null;
  notes: string | null;
  progress_score: number | null; // 0–10
  price_cents: number | null;
  paid_cents: number | null;
};

/* ---------------- Helpers ---------------- */

function formatTimeInputHHMM(value: string) {
  // erlaubt: "19:30", "1930", "19.30", "19 30" -> macht "19:30"
  const digits = value.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits; // "1", "19"
  return `${digits.slice(0, 2)}:${digits.slice(2)}`; // "19:3" / "19:30"
}

function normalizeTimeHHMM(value: string) {
  const v = value.trim();
  if (!v) return null; // leer -> später default
  const m = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function generateToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}


function isoToDE(dateISO: string) {
  return new Date(dateISO).toLocaleDateString("de-DE");
}
function isoToDEStrict(iso: string) {
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return "";
  return `${dd}.${mm}.${yyyy}`; // immer TT.MM.JJJJ
}

function formatDateInputDE(value: string) {
  let v = value.replace(/[^\d]/g, "").slice(0, 8); // TTMMJJJJ
  if (v.length > 2) v = v.slice(0, 2) + "." + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + "." + v.slice(5);
  return v;
}

function deToISO(de: string) {
  const s = de.trim();
  if (!s) return null;
  const parts = s.split(".");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function eurToCents(eur: string) {
  const cleaned = eur.replace(",", ".").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function centsToEUR(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function clampScore(n: number) {
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, n));
}

function getPaymentStatus(price: number, paid: number) {
  const open = Math.max(price - paid, 0);
  if (price <= 0) return { key: "OPEN" as const, open };
  if (open === 0) return { key: "PAID" as const, open };
  if (paid > 0) return { key: "PARTIAL" as const, open };
  return { key: "OPEN" as const, open };
}

function StatusBadge({ status }: { status: "OPEN" | "PARTIAL" | "PAID" }) {
  const style: React.CSSProperties =
    status === "PAID"
      ? {
          background: "rgba(22,163,74,.12)",
          color: "#16a34a",
          border: "1px solid rgba(22,163,74,.25)",
        }
      : status === "PARTIAL"
      ? {
          background: "rgba(245,158,11,.14)",
          color: "#b45309",
          border: "1px solid rgba(245,158,11,.28)",
        }
      : {
          background: "rgba(220,38,38,.10)",
          color: "#dc2626",
          border: "1px solid rgba(220,38,38,.22)",
        };

  return (
    <span
      style={{
        ...style,
        fontSize: 12,
        fontWeight: 700,
        padding: "5px 10px",
        borderRadius: 999,
        letterSpacing: 0.4,
      }}
    >
      {status}
    </span>
  );
}

/* ---------- PDF helpers ---------- */
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Simple SVG chart (clickable points) */
function LineChartSimple({
  points,
  height = 150,
  onPointClick,
}: {
  points: { id: string; xLabel: string; y: number }[];
  height?: number;
  onPointClick?: (id: string) => void;
}) {
  const width = 680;
  const pad = 26;

  if (points.length < 2) {
    return (
      <div style={{ opacity: 0.7 }}>Noch nicht genug Daten für ein Diagramm.</div>
    );
  }

  const minY = 0;
  const maxY = 10;
  const stepX = (width - pad * 2) / (points.length - 1);

  const poly = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const yNorm = (p.y - minY) / (maxY - minY);
      const y = pad + (1 - yNorm) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
      {[0, 2, 4, 6, 8, 10].map((v) => {
        const yNorm = (v - minY) / (maxY - minY);
        const y = pad + (1 - yNorm) * (height - pad * 2);
        return (
          <g key={v}>
            <line
              x1={pad}
              x2={width - pad}
              y1={y}
              y2={y}
              stroke="rgba(11,28,45,0.10)"
            />
            <text x={6} y={y + 4} fontSize="10" fill="rgba(11,28,45,0.55)">
              {v}
            </text>
          </g>
        );
      })}

      <polyline
        points={poly}
        fill="none"
        stroke="rgba(0,152,216,0.92)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => {
        const x = pad + i * stepX;
        const yNorm = (p.y - minY) / (maxY - minY);
        const y = pad + (1 - yNorm) * (height - pad * 2);
        return (
          <circle
            key={p.id}
            cx={x}
            cy={y}
            r="6"
            fill="#0B1C2D"
            stroke="#0098d8"
            strokeWidth="2"
            style={{ cursor: onPointClick ? "pointer" : "default" }}
            onClick={() => onPointClick?.(p.id)}
          />
        );
      })}
      {/* X-Labels (S1, S2, …) */}
{points.map((p, i) => {
  const x = pad + i * stepX;
  return (
    <text
      key={`xl-${p.id}`}
      x={x}
      y={height - 6}
      fontSize="10"
      textAnchor="middle"
      fill="rgba(11,28,45,0.55)"
    >
      {p.xLabel}
    </text>
  );
})}

    </svg>
  );
}

/* ---------------- Page ---------------- */

export default function ClientDetailPage() {
  const router = useRouter();


  function openApptModal() {
  setApptDateDE("");
  setApptTime("");
  setApptNotes("");
  setApptModalOpen(true);
}

async function saveAppointment() {
  // ✅ statt apptWhen prüfen wir jetzt Datum (und optional Uhrzeit)
  if (!apptDateDE.trim()) {
    setMsg("Bitte ein Datum im Format TT.MM.JJJJ eingeben.");
    return;
  }

  setApptSaving(true);
  setMsg("");

  const dateISO = deToISO(apptDateDE);
  if (!dateISO) {
    setApptSaving(false);
    setMsg("Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.");
    return;
  }

  // Uhrzeit: leer -> default 09:00, sonst validieren
const normalized = normalizeTimeHHMM(apptTime);

if (apptTime.trim() && !normalized) {
  setApptSaving(false);
  setMsg("Bitte eine gültige Uhrzeit eingeben (HH:MM), z.B. 19:30.");
  return;
}

const time = normalized ?? "09:00";
const [hh2, mm2] = time.split(":");

// ISO mit lokaler Zeit -> Date erzeugen
if (!dateISO) {
  setApptSaving(false);
  setMsg("Bitte ein gültiges Datum eingeben (TT.MM.JJJJ).");
  return;
}
const startsLocal = new Date(`${dateISO}T${hh2}:${mm2}:00`);
if (Number.isNaN(startsLocal.getTime())) {
  setApptSaving(false);
  setMsg("Bitte ein gültiges Datum/Uhrzeit eingeben.");
  return;
}
const startsISO = startsLocal.toISOString();


  // ✅ Dauer optional, default 30
  const duration = Number(apptDuration) || 30;

  const confirmToken = generateToken();
  const cancelToken = generateToken();
  const rescheduleToken = generateToken();

  const { data: apptRow, error } = await supabase
    .from("appointments")
    .insert({
      client_id: clientId,
      starts_at: startsISO,
      duration_min: duration,
      notes: apptNotes.trim() || null,
      status: "PENDING",
      confirm_token: confirmToken,
      cancel_token: cancelToken,
      reschedule_token: rescheduleToken,
    })
    .select("id")
    .single();

  setApptSaving(false);

  if (error) {
    setMsg(error.message);
    return;
  }

  let mailStatusMsg = "";
  let clientEmail = client?.email?.trim() || "";
  let clientName = client?.name ?? "Kunde";
  if (!clientEmail) {
    const { data: cData } = await supabase
      .from("clients")
      .select("name,email")
      .eq("id", clientId)
      .single();
    clientEmail = cData?.email?.trim() || "";
    clientName = cData?.name ?? clientName;
  }

  if (!clientEmail) {
    mailStatusMsg = "Termin erstellt, aber es ist keine E-Mail beim Kunden hinterlegt.";
  } else {
    const base = `${appUrl}/appointments/manage`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!supabaseUrl || !supabaseKey) {
      mailStatusMsg = "E-Mail konnte nicht gesendet werden: Supabase env fehlt.";
    } else {
      const res = await fetch(`${supabaseUrl}/functions/v1/appointment-mails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
        body: JSON.stringify({
          type: "confirmation",
          appointment_id: apptRow?.id,
          client_name: clientName,
          client_email: clientEmail,
          starts_at: startsISO,
          duration_min: duration,
          confirm_url: `${base}/${confirmToken}?action=confirm`,
          cancel_url: `${base}/${cancelToken}?action=cancel`,
          reschedule_url: `${base}/${rescheduleToken}?action=reschedule`,
        }),
      });
      const mailData = await res.json().catch(() => ({}));
      if (!res.ok || mailData?.ok === false) {
        const detail =
          typeof mailData?.error === "string"
            ? mailData.error
            : `HTTP ${res.status}`;
        mailStatusMsg = `E-Mail konnte nicht gesendet werden: ${detail}`;
      }
    }
  }

  setApptModalOpen(false);
  await loadAll();
  if (mailStatusMsg) setMsg(mailStatusMsg);
}


function fmtAppt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}


useEffect(() => {
  let alive = true;

  async function guard() {
    const { data } = await supabase.auth.getSession();
    if (!alive) return;

    if (!data.session) {
      router.replace("/login");
      return;
    }
  }

  guard();

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) router.replace("/login");
  });

  return () => {
    alive = false;
    sub.subscription.unsubscribe();
  };
}, [router]);

  const [apptMenuOpen, setApptMenuOpen] = useState(false);

  const params = useParams();
  const clientId = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState("");

  const [pdfChoice, setPdfChoice] = useState<string>("");

  const [nextAppt, setNextAppt] = useState<Appointment | null>(null);
const [apptModalOpen, setApptModalOpen] = useState(false);
const [apptSaving, setApptSaving] = useState(false);

const [apptDateDE, setApptDateDE] = useState(""); // TT.MM.JJJJ
const [apptTime, setApptTime] = useState("");     // HH:MM

const [apptDuration, setApptDuration] = useState("30");
const [apptNotes, setApptNotes] = useState("");


  // Modal state (Create/Edit Session)
  const [modalOpen, setModalOpen] = useState(false);
  const [sessionMode, setSessionMode] = useState<"create" | "edit">("create");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields (Session)
  const [sessionDateDE, setSessionDateDE] = useState(""); // TT.MM.JJJJ
  const [location, setLocation] = useState("");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [progressScore, setProgressScore] = useState<string>(""); // 0–10
  const [priceEUR, setPriceEUR] = useState<string>(""); // €
  

  // --------- NEU: Client Edit Modal (nur Kontaktdaten-Container) ---------
  const [clientEditOpen, setClientEditOpen] = useState(false);
  const [clientEditSaving, setClientEditSaving] = useState(false);
  const [healthInfoOpen, setHealthInfoOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentLocation, setConsentLocation] = useState("");
  const [consentDate, setConsentDate] = useState("");
  const [consentName, setConsentName] = useState("");
  const [consentSigData, setConsentSigData] = useState<string | null>(null);
  const [consentSigDirty, setConsentSigDirty] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const consentSigRef = useRef<HTMLCanvasElement | null>(null);
  const consentDrawingRef = useRef(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empulse-app.de";

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGoals, setEditGoals] = useState("");
  const [editNotes, setEditNotes] = useState("");
  // ----------------------------------------------------------------------

  useEffect(() => {
    if (!clientId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadAll() {
    setMsg("");

    const cRes = await supabase
      .from("clients")
      .select(
        "id,name,email,phone,goals,notes,health_flag,health_check_passed,health_check_flags,consent_name,consent_location,consent_signature,consent_signed_at"
      )
      .eq("id", clientId)
      .single();

    if (cRes.error) {
      setMsg(cRes.error.message);
      return;
    }
    setClient(cRes.data as Client);
    const consentSignedAt = cRes.data?.consent_signed_at ?? null;
    setConsentName(cRes.data?.consent_name ?? "");
    setConsentLocation(cRes.data?.consent_location ?? "");
    setConsentSigData(cRes.data?.consent_signature ?? null);
    setConsentSigDirty(false);
    setConsentDate(
      consentSignedAt ? new Date(consentSignedAt).toLocaleDateString("de-DE") : ""
    );

    const sRes = await supabase
      .from("sessions")
      .select(
        "id,session_date,location,focus,notes,progress_score,price_cents,paid_cents"
      )
      .eq("client_id", clientId)
      .order("session_date", { ascending: true });

    if (sRes.error) {
      setMsg(sRes.error.message);
      return;
    }
    setSessions((sRes.data as Session[]) ?? []);
    const aRes = await supabase
  .from("appointments")
  .select("id,starts_at,duration_min,notes")
  .eq("client_id", clientId)
  .gte("starts_at", new Date().toISOString())
  .order("starts_at", { ascending: true })
  .limit(1);

if (!aRes.error) {
  setNextAppt((aRes.data?.[0] as Appointment) ?? null);
}

  }

  const openTotalCents = useMemo(() => {
    return sessions.reduce((sum, s) => {
      const price = s.price_cents ?? 0;
      const paid = s.paid_cents ?? 0;
      return sum + Math.max(price - paid, 0);
    }, 0);
  }, [sessions]);

  const progressPoints = useMemo(() => {
  const scored = sessions
    .slice()
    .sort((a, b) => (a.session_date > b.session_date ? 1 : -1))
    .filter((s) => typeof s.progress_score === "number");

  return scored.map((s, idx) => ({
    id: s.id,
    xLabel: `S${idx + 1}`, // X-Achse: Session 1..n
    y: Number(s.progress_score),
  }));
}, [sessions]);

async function cancelNextAppointment() {
  if (!nextAppt) return;
  if (!confirm("Termin wirklich stornieren?")) return;

  setMsg("");
  const { error } = await supabase.from("appointments").delete().eq("id", nextAppt.id);

  if (error) {
    setMsg(error.message);
    return;
  }

  setApptMenuOpen(false);
  loadAll();
}


  function resetSessionForm() {
    setSessionDateDE("");
    setLocation("");
    setFocus("");
    setNotes("");
    setProgressScore("");
    setPriceEUR("");
   
  }

  function openCreateSession() {
    setSessionMode("create");
    setActiveSessionId(null);
    resetSessionForm();
    setModalOpen(true);
  }

  function openEditSession(s: Session) {
    setSessionMode("edit");
    setActiveSessionId(s.id);
    setSessionDateDE(isoToDEStrict(s.session_date));
    setLocation(s.location ?? "");
    setFocus(s.focus ?? "");
    setNotes(s.notes ?? "");
    setProgressScore(
      s.progress_score === null ? "" : String(s.progress_score)
    );
    setPriceEUR(((s.price_cents ?? 0) / 100).toString().replace(".", ","));
  
    setModalOpen(true);
  }

  async function deleteSession(id: string) {
    if (!confirm("Session wirklich löschen?")) return;
    setSaving(true);
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    setSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    loadAll();
  }
async function markSessionPaid(s: Session) {
  const price = s.price_cents ?? 0;
  if (price <= 0) return;

  setSaving(true);
  setMsg("");

  const { error } = await supabase
    .from("sessions")
    .update({ paid_cents: price })
    .eq("id", s.id);

  setSaving(false);

  if (error) {
    setMsg(error.message);
    return;
  }

  loadAll();
}

  async function saveSession() {
    setMsg("");

    const dateISO = deToISO(sessionDateDE);
    if (!dateISO) {
      setMsg("Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.");
      return;
    }

    const progress = progressScore.trim()
      ? clampScore(Number(progressScore))
      : null;
    if (progressScore.trim() && progress === null) {
      setMsg("Fortschritt muss eine Zahl von 0 bis 10 sein.");
      return;
    }

    const price_cents = eurToCents(priceEUR);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setMsg("Nicht eingeloggt.");
      return;
    }

    setSaving(true);

const existingPaid =
  sessionMode === "edit"
    ? (sessions.find((x) => x.id === activeSessionId)?.paid_cents ?? 0)
    : 0;

const payload = {
  user_id: user.id,
  client_id: clientId,
  session_date: dateISO,
  location: location.trim() || null,
  focus: focus.trim() || null,
  notes: notes.trim() || null,
  progress_score: progress,
  price_cents,
  paid_cents: existingPaid,
};


    let error: any = null;

    if (sessionMode === "create") {
      const res = await supabase.from("sessions").insert(payload);
      error = res.error;
    } else {
      if (!activeSessionId) {
        setSaving(false);
        setMsg("Keine Session ausgewählt.");
        return;
      }
      const res = await supabase
        .from("sessions")
        .update(payload)
        .eq("id", activeSessionId);
      error = res.error;
    }

    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setModalOpen(false);
    resetSessionForm();
    loadAll();
  }

  // ------------------ NEU: Client Edit Open/Save ------------------
  function openEditClientModal() {
    if (!client) return;
    setMsg("");
    setEditName(client.name ?? "");
    setEditEmail(client.email ?? "");
    setEditPhone(client.phone ?? "");
    setEditGoals(client.goals ?? "");
    setEditNotes(client.notes ?? "");
    setClientEditOpen(true);
  }

  function closeEditClientModal() {
    setClientEditOpen(false);
  }

  async function saveClientEdits() {
    if (!client) return;

    if (!editName.trim()) {
      setMsg("Bitte Name eingeben.");
      return;
    }

    setClientEditSaving(true);
    setMsg("");

    const { error } = await supabase
      .from("clients")
      .update({
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        goals: editGoals.trim() || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", clientId);

    setClientEditSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setClientEditOpen(false);
    loadAll();
  }
  // ---------------------------------------------------------------

  /* ---------- PDF: Kunden-Protokoll ---------- */
  function exportClientPDF() {
    if (!client) return;
    const logoUrl = `${window.location.origin}/logo.png`;

    const rows = sessions
      .slice()
      .sort((a, b) => (a.session_date > b.session_date ? -1 : 1))
      .map((s) => {
        const price = s.price_cents ?? 0;
        const paid = s.paid_cents ?? 0;
        const open = Math.max(price - paid, 0);

        return `
          <tr>
            <td>${escapeHtml(isoToDE(s.session_date))}</td>
            <td>${escapeHtml(s.location ?? "-")}</td>
            <td>${escapeHtml(s.focus ?? "-")}</td>
            <td>${escapeHtml(String(s.progress_score ?? "-"))}</td>
            <td>${escapeHtml(centsToEUR(price))}</td>
            <td>${escapeHtml(centsToEUR(paid))}</td>
            <td>${escapeHtml(centsToEUR(open))}</td>
            <td>${escapeHtml(s.notes ?? "-")}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Protokoll – ${escapeHtml(client.name)}</title>
        <style>
          body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px; color:#0B1C2D; }
          .header{ display:flex; align-items:center; gap:14px; margin-bottom:16px; }
          .logo{ height:34px; width:auto; object-fit:contain; }
          .header-line{ flex:1; height:1px; background: rgba(11,28,45,.12); }
          h1{ margin:0 0 6px; }
          .sub{ color: rgba(11,28,45,.7); margin:0 0 18px; }
          .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:18px; }
          .box{ border:1px solid rgba(11,28,45,.12); border-radius:12px; padding:12px; }
          .label{ font-size:12px; color: rgba(11,28,45,.65); margin-bottom:4px; }
          table{ width:100%; border-collapse: collapse; font-size:12px; }
          th,td{ border-bottom:1px solid rgba(11,28,45,.12); padding:8px 6px; vertical-align: top; }
          th{ text-align:left; font-size:12px; color: rgba(11,28,45,.75); }
          .small{ font-size:11px; color: rgba(11,28,45,.6); margin-top:10px; }
          @media print { .no-print{ display:none; } body{ padding:0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:12px;">
          <button onclick="window.print()">Drucken / Als PDF speichern</button>
        </div>

        <div class="header">
          <img class="logo" src="${logoUrl}" alt="empulse PRO+" />
          <div class="header-line"></div>
        </div>

        <h1>Patientenprotokoll</h1>
        <p class="sub">${escapeHtml(client.name)} – Export aus empulse-app</p>

        <div class="grid">
          <div class="box"><div class="label">E-Mail</div>${escapeHtml(client.email ?? "-")}</div>
          <div class="box"><div class="label">Telefon</div>${escapeHtml(client.phone ?? "-")}</div>
          <div class="box" style="grid-column:1/-1;"><div class="label">Ziele / Fokus</div>${escapeHtml(client.goals ?? "-")}</div>
          <div class="box" style="grid-column:1/-1;"><div class="label">Notizen</div>${escapeHtml(client.notes ?? "-")}</div>
        </div>

        <h2 style="margin: 0 0 10px;">Sessions</h2>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ort</th>
              <th>Fokus</th>
              <th>Fortschritt</th>
              <th>Preis</th>
              <th>Bezahlt</th>
              <th>Offen</th>
              <th>Protokoll</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="8">Keine Sessions erfasst.</td></tr>`}
          </tbody>
        </table>

        <div class="small">
          Hinweis: Fortschritt ist eine interne Skala (0–10) zur Verlaufserfassung.
        </div>

        <script>window.print();</script>
      </body>
    </html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blockiert. Bitte Popups für localhost erlauben.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ---------- PDF: Rechnung ---------- */
  function exportInvoicePDF() {
    if (!client) return;

    const logoUrl = `${window.location.origin}/logo.png`;
    const d = new Date();
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(d.getDate()).padStart(2, "0")}`;
    const invoiceNo = `INV-${yyyymmdd}-${clientId
      .slice(0, 4)
      .toUpperCase()}`;
    const invoiceDate = d.toLocaleDateString("de-DE");

    const items = sessions
      .slice()
      .sort((a, b) => (a.session_date > b.session_date ? 1 : -1))
      .filter((s) => (s.price_cents ?? 0) > 0);

    const totals = items.reduce(
      (acc, s) => {
        const price = s.price_cents ?? 0;
        const paid = s.paid_cents ?? 0;
        acc.sum += price;
        acc.paid += paid;
        acc.open += Math.max(price - paid, 0);
        return acc;
      },
      { sum: 0, paid: 0, open: 0 }
    );

    const rows = items
      .map((s, i) => {
        const price = s.price_cents ?? 0;
        const paid = s.paid_cents ?? 0;
        const open = Math.max(price - paid, 0);

        return `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(isoToDE(s.session_date))}</td>
            
            <td>${escapeHtml(s.location ?? "-")}</td>
            <td>${escapeHtml(s.focus ?? "Session")}</td>
            <td style="text-align:right;">${escapeHtml(centsToEUR(price))}</td>
            <td style="text-align:right;">${escapeHtml(centsToEUR(paid))}</td>
            <td style="text-align:right;">${escapeHtml(centsToEUR(open))}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Rechnung – ${escapeHtml(client.name)}</title>
        <style>
          body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px; color:#0B1C2D; }
          .top{ display:flex; align-items:center; gap:14px; margin-bottom:14px; }
          .logo{ height:34px; width:auto; object-fit:contain; }
          .line{ flex:1; height:1px; background: rgba(11,28,45,.12); }
          h1{ margin:0; }
          .meta{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin:14px 0 16px; }
          .box{ border:1px solid rgba(11,28,45,.12); border-radius:12px; padding:12px; }
          .label{ font-size:12px; color: rgba(11,28,45,.65); margin-bottom:4px; }
          table{ width:100%; border-collapse: collapse; font-size:12px; margin-top:10px; }
          th,td{ border-bottom:1px solid rgba(11,28,45,.12); padding:8px 6px; vertical-align: top; }
          th{ text-align:left; font-size:12px; color: rgba(11,28,45,.75); }
          .totals{ margin-top:14px; display:grid; grid-template-columns: 1fr 220px; gap:12px; }
          .right{ text-align:right; }
          .small{ font-size:11px; color: rgba(11,28,45,.6); margin-top:12px; }
          @media print { .no-print{ display:none; } body{ padding:0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:12px;">
          <button onclick="window.print()">Drucken / Als PDF speichern</button>
        </div>

        <div class="top">
          <img class="logo" src="${logoUrl}" alt="empulse PRO+" />
          <div class="line"></div>
        </div>

        <h1>Rechnung</h1>

        <div class="meta">
          <div class="box">
            <div class="label">Rechnungsnummer</div>
            <div><b>${escapeHtml(invoiceNo)}</b></div>
            <div class="label" style="margin-top:8px;">Rechnungsdatum</div>
            <div>${escapeHtml(invoiceDate)}</div>
          </div>

          <div class="box">
            <div class="label">Kunde</div>
            <div><b>${escapeHtml(client.name)}</b></div>
            <div class="label" style="margin-top:8px;">Kontakt</div>
            <div>${escapeHtml(client.email ?? "-")}</div>
            <div>${escapeHtml(client.phone ?? "-")}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Datum</th>
              <th>Ort</th>
              <th>Leistung</th>
              <th style="text-align:right;">Preis</th>
              <th style="text-align:right;">Bezahlt</th>
              <th style="text-align:right;">Offen</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="7">Keine abrechenbaren Sessions vorhanden.</td></tr>`}
          </tbody>
        </table>

        <div class="totals">
          <div></div>
          <div class="box right">
            <div class="label">Summe</div>
            <div><b>${escapeHtml(centsToEUR(totals.sum))}</b></div>
            <div class="label" style="margin-top:8px;">Bezahlt</div>
            <div><b>${escapeHtml(centsToEUR(totals.paid))}</b></div>
            <div class="label" style="margin-top:8px;">Offen</div>
            <div><b>${escapeHtml(centsToEUR(totals.open))}</b></div>
          </div>
        </div>

        <div class="small">
          Hinweis: Diese Rechnung basiert auf dokumentierten Sessions innerhalb der empulse-app.
        </div>

        <script>window.print();</script>
      </body>
    </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  const healthDetailText = useMemo(() => {
    if (!client) return "—";
    if (client.health_check_flags && client.health_check_flags.trim()) {
      return `⚠️ Gesundheitscheck – Auffälligkeiten:\n${client.health_check_flags}`;
    }
    if (client.health_check_passed === true) {
      return "Gesundheitscheck ✓ (keine Auffälligkeiten laut Selbstauskunft)";
    }
    if (client.health_check_passed === false) {
      return "⚠️ Gesundheitscheck – Auffälligkeiten vorhanden.";
    }
    return "—";
  }, [client]);

  useEffect(() => {
    if (!consentOpen) return;
    const canvas = consentSigRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0B1C2D";
  }, [consentOpen]);

  function startSig(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = consentSigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    consentDrawingRef.current = true;
  }

  function moveSig(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!consentDrawingRef.current) return;
    const canvas = consentSigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    setConsentSigDirty(true);
  }

  function endSig() {
    consentDrawingRef.current = false;
  }

  function clearSig() {
    const canvas = consentSigRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setConsentSigDirty(false);
    setConsentSigData(null);
  }

  async function saveConsent() {
    const canvas = consentSigRef.current;
    if (!canvas || !client) return;
    const signatureData = canvas.toDataURL("image/png");
    const signedAt = new Date().toISOString();
    setConsentSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        consent_signature: signatureData,
        consent_name: consentName || client.name,
        consent_location: consentLocation || null,
        consent_signed_at: signedAt,
      })
      .eq("id", client.id);
    setConsentSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setConsentSigData(signatureData);
    setConsentDate(new Date(signedAt).toLocaleDateString("de-DE"));
    setConsentSigDirty(false);
    setConsentOpen(false);
    await loadAll();
  }

  function downloadConsentPDF() {
    if (!client) return;
    const fileName = `Hinweisblatt & Einverständnis Erklärung von ${client.name}`;
    const signatureImg = consentSigData
      ? `<img src="${consentSigData}" alt="Unterschrift" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:8px;" />`
      : "<em>Keine Unterschrift vorhanden</em>";
    const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${fileName}</title>
  <style>
    :root{--ink:#0b1c2d;--muted:#5b6b7b;--line:#e7ebf0;--accent:#0b1c2d;}
    body{font-family:Arial, sans-serif; padding:36px; color:var(--ink); background:#fff;}
    h1{font-size:22px; margin:0;}
    h2{font-size:14px; margin:0 0 10px; color:var(--muted); font-weight:600; letter-spacing:.2px;}
    .wrap{border:1px solid var(--line); border-radius:14px; padding:20px;}
    .head{display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px;}
    .sub{font-size:12px; color:var(--muted);}
    .block{margin-bottom:10px; line-height:1.55;}
    .list{margin:0; padding-left:18px;}
    .list li{margin-bottom:8px;}
    .meta{margin:18px 0 10px; font-size:13px; color:var(--muted);}
    .sig{margin-top:10px; border:1px dashed var(--line); border-radius:10px; padding:10px;}
    .footer{margin-top:16px; font-size:11px; color:#8a96a3;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>Hinweisblatt & Einverständnis</h1>
        <div class="sub">Patient: ${client.name}</div>
      </div>
      <div class="sub">${consentDate || "—"}</div>
    </div>
    <h2>Zu beachten</h2>
    <ul class="list">
      <li>Alle metallischen Gegenstände sowie elektronische Autoschlüssel, Mobiltelefone, Scheck- und Kreditkarten, Schmuck etc. vom Körper sind vor der Anwendung zu entfernen. Die Anwendung sollte mit einem Mindestabstand von Abstand einem Meter erfolgen.</li>
      <li>Bei Beeinträchtigungen des Bewegungsapparates kann es mitunter nach der ersten Anwendung zu einer Verschlimmerung der Beschwerden kommen, die aber normalerweise nach zwei bis drei Folgeanwendungen nachlässt. Diese Reaktion des Körpers ist normal und ein Indiz dafür, dass der Körper auf die Anwendung reagiert. Bitte nehmen Sie unverzüglich mit uns Kontakt auf, sollten sich Ihre Schmerzen verstärken.</li>
      <li>Die Geräteeinstellungen dürfen VOR, WÄHREND und NACH der Anwendung nicht geändert werden.</li>
      <li>Hersteller und Händler sowie die Praxis übernehmen keinerlei Garantie für die Linderung und/oder Heilung von Beschwerden bzw. Krankheiten, sowie gilt ein Haftungsausschluss bei Unwirksamkeit und Missbrauch. Die Anwendung erfolgt in Eigenverantwortung.</li>
      <li>Mir ist bekannt, dass die Kosten für empulse pro® i.d.R. nicht von den Krankenkassen übernommen und von mir selbst getragen werden müssen.</li>
      <li>Ich bestätige, alle Fragen wahrheitsgemäß beantwortet und die Hinweise gelesen zu haben.</li>
    </ul>
    <div class="meta">Ort: ${consentLocation || "—"} | Datum: ${consentDate || "—"} | Name: ${consentName || client.name}</div>
    <div class="sig">${signatureImg}</div>
    <div class="footer">Dokument automatisch aus der empulse-app erstellt.</div>
  </div>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  function openConsentForm() {
    if (consentSigData) return;
    setConsentDate(new Date().toLocaleDateString("de-DE"));
    setConsentOpen(true);
  }

  return (
    <PageShell title={client ? client.name : "Kunde"} subtitle="Kundendetails & Verlauf">
      {/* Header-Zeile: Zurück links, Buttons rechts */}
      <div
        className="client-detail-head"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Zurück – NUR Pfeil */}
          <Link
            href="/clients"
            className="btn ghost"
            aria-label="Zurück"
            title="Zurück"
            style={{ padding: "9px 11px", textDecoration: "none" }}
          >
            ←
          </Link>

          {client?.health_flag && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#f59e0b" }}>⚠️</span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => setHealthInfoOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHealthInfoOpen(true);
                  }
                }}
                style={{
                  color: "#f59e0b",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
                title="Gesundheitshinweis anzeigen"
              >
                Gesundheitshinweis
              </span>
            </span>
          )}
        </div>

        {/* Buttons rechts – gleiche Höhe */}
        <div className="client-detail-actions" style={{ display: "flex", gap: 10 }}>
          <button className="btn ghost" onClick={loadAll}>
            Aktualisieren
          </button>

          <select
            className="btn ghost"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === "client") exportClientPDF();
              if (v === "invoice") exportInvoicePDF();
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              PDF erstellen…
            </option>
            <option value="client">Kunden-PDF</option>
            <option value="invoice">Rechnungs-PDF</option>
          </select>

          <button className="btn primary" onClick={openCreateSession}>
            + Session hinzufügen
          </button>
        </div>
      </div>

      {msg ? (
        <Surface className="mb">
          <div style={{ opacity: 0.85 }}>{msg}</div>
        </Surface>
      ) : null}

      {healthInfoOpen && (
        <div className="modal-overlay" onMouseDown={() => setHealthInfoOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>Gesundheitshinweis</h2>

              <button
                className="icon-btn"
                onClick={() => setHealthInfoOpen(false)}
                aria-label="Schließen"
                title="Schließen"
              >
                <X />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                {healthDetailText}
              </div>
            </div>
          </div>
        </div>
      )}

      {consentOpen && (
        <div className="modal-overlay" onMouseDown={() => setConsentOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>Hinweisblatt & Einverständnis</h2>

              <button
                className="icon-btn"
                onClick={() => setConsentOpen(false)}
                aria-label="Schließen"
                title="Schließen"
              >
                <X />
              </button>
            </div>

            <div className="modal-body" style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  border: "1px solid rgba(11,28,45,.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(11,28,45,.03)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Zu beachten:</div>
                <div style={{ lineHeight: 1.55, display: "grid", gap: 8 }}>
                  <div>
                    Alle metallischen Gegenstände sowie elektronische Autoschlüssel, Mobiltelefone,
                    Scheck- und Kreditkarten, Schmuck etc. vom Körper sind vor der Anwendung zu entfernen.
                    Die Anwendung sollte mit einem Mindestabstand von Abstand einem Meter erfolgen.
                  </div>
                  <div>
                    Bei Beeinträchtigungen des Bewegungsapparates kann es mitunter nach der ersten Anwendung
                    zu einer Verschlimmerung der Beschwerden kommen, die aber normalerweise nach zwei bis drei
                    Folgeanwendungen nachlässt. Diese Reaktion des Körpers ist normal und ein Indiz dafür,
                    dass der Körper auf die Anwendung reagiert. Bitte nehmen Sie unverzüglich mit uns Kontakt auf,
                    sollten sich Ihre Schmerzen verstärken.
                  </div>
                  <div>
                    Die Geräteeinstellungen dürfen VOR, WÄHREND und NACH der Anwendung nicht geändert werden.
                  </div>
                  <div>
                    Hersteller und Händler sowie die Praxis übernehmen keinerlei Garantie für die Linderung und/oder
                    Heilung von Beschwerden bzw. Krankheiten, sowie gilt ein Haftungsausschluss bei Unwirksamkeit
                    und Missbrauch. Die Anwendung erfolgt in Eigenverantwortung.
                  </div>
                  <div>
                    Mir ist bekannt, dass die Kosten für empulse pro® i.d.R. nicht von den Krankenkassen übernommen
                    und von mir selbst getragen werden müssen.
                  </div>
                  <div>
                    Ich bestätige, alle Fragen wahrheitsgemäß beantwortet und die Hinweise gelesen zu haben.
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <div>
                  <label className="label">Ort</label>
                  <input
                    className="input"
                    value={consentLocation}
                    onChange={(e) => setConsentLocation(e.target.value)}
                    placeholder="Ort"
                  />
                </div>
                <div>
                  <label className="label">Datum</label>
                  <input
                    className="input"
                    value={consentDate}
                    onChange={(e) => setConsentDate(e.target.value)}
                    placeholder="TT.MM.JJJJ"
                  />
                </div>
              </div>

              <div>
                <label className="label">Name (Patient)</label>
                <input
                  className="input"
                  value={consentName}
                  onChange={(e) => setConsentName(e.target.value)}
                  placeholder="Vor- und Nachname"
                />
              </div>

              <div>
                <div className="label" style={{ marginBottom: 6 }}>
                  Unterschrift des Patienten
                </div>
                <div
                  style={{
                    border: "1px solid rgba(11,28,45,.16)",
                    borderRadius: 12,
                    padding: 8,
                    background: "#fff",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  }}
                >
                  <canvas
                    ref={consentSigRef}
                    style={{ width: "100%", height: 160, display: "block" }}
                    onPointerDown={startSig}
                    onPointerMove={moveSig}
                    onPointerUp={endSig}
                    onPointerLeave={endSig}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <button
                  className="btn primary save-btn"
                  onClick={saveConsent}
                  disabled={!consentSigDirty || consentSaving}
                  type="button"
                >
                  Bestätigen & speichern
                </button>
                <button
                  className="icon-btn"
                  onClick={clearSig}
                  type="button"
                  aria-label="Unterschrift zurücksetzen"
                  title="Unterschrift zurücksetzen"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Surface className="mb">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 800 }}>Hinweisblatt & Einverständnis</div>
        </div>
        {consentSigData ? (
          <div style={{ marginTop: 8 }}>
            <button className="btn-appointment" onClick={downloadConsentPDF}>
              PDF herunterladen
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <button className="btn-appointment" onClick={openConsentForm}>
              Hinweisblatt & Einverständnis hinzufügen
            </button>
          </div>
        )}
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
          {consentSigData ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Unterschrift erfasst. <CheckCircle2 size={14} color="#16a34a" />
            </span>
          ) : (
            "Noch keine Unterschrift erfasst."
          )}
        </div>
      </Surface>

      <div className="detail-stack"></div>

     <Surface className="mb">
  <div className="client-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
    {/* LINKS: Kontaktdaten – eigener Kasten */}
    <div
      className="client-detail-card"
      style={{
        border: "1px solid rgba(11,28,45,.10)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div>
          <div className="label">E-Mail</div>
          <div style={{ marginTop: 4 }}>{client?.email || "—"}</div>
        </div>

        <div>
          <div className="label">Telefon</div>
          <div style={{ marginTop: 4 }}>{client?.phone || "—"}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="icon-btn"
            title="Kunde bearbeiten"
            aria-label="Kunde bearbeiten"
            onClick={openEditClientModal}
          >
            <Pencil size={18} />
          </button>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <div className="label">Ziele / Fokus</div>
          <div style={{ marginTop: 4 }}>{client?.goals || "—"}</div>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <div className="label">Notizen</div>
          <div style={{ marginTop: 4 }}>{client?.notes || "—"}</div>
        </div>
      </div>
    </div>

    {/* RECHTS: Termin – eigener Kasten */}
    <div
      className="client-detail-card"
      style={{
        border: "1px solid rgba(11,28,45,.10)",
        borderRadius: 14,
        padding: 14,
        display: "grid",
        gap: 10,
        alignContent: "start",
      }}
    >
      <div style={{ fontWeight: 800 }}>Termin</div>

      <div>
        <div className="label">Nächster Termin</div>
        <div style={{ marginTop: 4, position: "relative" }}>
          {nextAppt ? (
            <>
              <span
                style={{ cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                onClick={() => setApptMenuOpen((v) => !v)}
                title="Klicken für Optionen"
              >
                {fmtAppt(nextAppt.starts_at)}
              </span>

              {apptMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 26,
                    left: 0,
                    background: "white",
                    border: "1px solid rgba(11,28,45,.12)",
                    borderRadius: 10,
                    padding: 10,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                    zIndex: 20,
                    minWidth: 240,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Notiz</div>

                  <div
                    style={{
                      opacity: 0.85,
                      fontSize: 13,
                      lineHeight: 1.35,
                      marginBottom: 10,
                    }}
                  >
                    {nextAppt?.notes?.trim() ? nextAppt.notes : "—"}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn-danger-action"
                      onClick={cancelNextAppointment}
                    >
                      <Trash2 size={14} />
                      Termin löschen
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            "—"
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 6 }}>
          <button onClick={openApptModal} className="btn-appointment">
            + Termin vereinbaren
          </button>
        </div>

        <div style={{ opacity: 0.65, fontSize: 12 }}>
          Tipp: Termine werden später auch im Dashboard als „Nächste Termine“ angezeigt.
        </div>
      </div>
    </div>
  </div>
</Surface>

      <Surface className="mb">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Fortschritt (0–10)</div>

        <LineChartSimple
          points={progressPoints}
          onPointClick={(id) => {
            const s = sessions.find((x) => x.id === id);
            if (!s) return;
            openEditSession(s);
          }}
        />

        <div style={{ marginTop: 8, opacity: 0.65, fontSize: 12 }}>
          Tipp: Klick auf einen Punkt → Session bearbeiten.
        </div>
      </Surface>

      <Surface>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Patientenprotokolle (Sessions)</div>

        {sessions.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Noch keine Sessions erfasst.</div>
        ) : (
          <div
            className="session-list"
            style={{
              display: "grid",
              gap: 10,
              maxHeight: 4 * 110, // ca. Höhe von 4 Session-Karten
              overflowY: "auto",
              paddingRight: 6, // Platz für Scrollbar
            }}
          >

            {sessions.slice().reverse().map((s) => {
              const price = s.price_cents ?? 0;
              const paid = s.paid_cents ?? 0;
              const { key, open } = getPaymentStatus(price, paid);

              return (
                <div
                  className="session-card"
                  key={s.id}
                  style={{
                    border: "1px solid rgba(11,28,45,.10)",
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{isoToDE(s.session_date)}</div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
  style={{ cursor: key === "OPEN" ? "pointer" : "default" }}
  title={key === "OPEN" ? "Klick = als bezahlt markieren" : undefined}
  onClick={() => {
    if (key === "OPEN") markSessionPaid(s);
  }}
>
  <StatusBadge status={key} />
</span>

                      <div style={{ opacity: 0.7 }}>
                        {s.location ? `Ort: ${s.location}` : "Ort: —"}
                      </div>

                      <button
                        className="icon-btn"
                        title="Session bearbeiten"
                        aria-label="Session bearbeiten"
                        onClick={() => openEditSession(s)}
                        disabled={saving}
                      >
                        <Pencil />
                      </button>

                      <button
                        className="icon-btn danger"
                        title="Session löschen"
                        aria-label="Session löschen"
                        onClick={() => deleteSession(s.id)}
                        disabled={saving}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>

                  {s.focus ? (
                    <div style={{ marginTop: 8 }}>
                      <span className="label">Fokus/Beschwerden:</span> {s.focus}
                    </div>
                  ) : null}

                  {s.notes ? (
                    <div style={{ marginTop: 8, opacity: 0.85 }}>{s.notes}</div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 14,
                      flexWrap: "wrap",
                      opacity: 0.9,
                    }}
                  >
                    <div>
                      Fortschritt: <b>{s.progress_score ?? "—"}</b>
                    </div>
                    <div>
                      Preis: <b>{centsToEUR(price)}</b>
                    </div>
                    <div>
                      Bezahlt: <b>{centsToEUR(paid)}</b>
                    </div>
                    <div>
                      Offen: <b>{centsToEUR(open)}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      {/* Modal: Session hinzufügen/bearbeiten */}
      {modalOpen && (
        <div className="modal-overlay" onMouseDown={() => setModalOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>
                {sessionMode === "create" ? "Session hinzufügen" : "Session bearbeiten"}
              </h2>

              <button
                className="icon-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Schließen"
                title="Schließen"
              >
                <X />
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <label className="label">Datum *</label>
              <input
                className="input"
                placeholder="TT.MM.JJJJ"
                value={sessionDateDE}
                onChange={(e) => setSessionDateDE(formatDateInputDE(e.target.value))}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">Ort (wo behandelt)</label>
                  <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div>
                  <label className="label">Fortschritt (0–10)</label>
                  <input
                    className="input"
                    placeholder="z.B. 7"
                    value={progressScore}
                    onChange={(e) => setProgressScore(e.target.value)}
                  />
                </div>
              </div>

              <label className="label">Fokus / Beschwerden (neutral)</label>
              <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} />

              <label className="label">Notizen / Protokoll</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div>
  <label className="label">Preis (€)</label>
  <input
    className="input"
    placeholder="z.B. 60,00"
    value={priceEUR}
    onChange={(e) => setPriceEUR(e.target.value)}
  />
</div>

<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
  <button
    className="btn primary save-btn"
    onClick={saveSession}
    disabled={saving || !sessionDateDE.trim()}
  >
    Änderungen speichern
  </button>
</div>


              <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>
                Auto-Status: OPEN / PARTIAL / PAID wird aus Preis – Bezahlt berechnet.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------- NEU: Modal Kunde bearbeiten (Kontaktdaten) --------- */}
      {clientEditOpen && (
        <div className="modal-overlay" onMouseDown={closeEditClientModal}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>Kunde bearbeiten</h2>

              <button
                className="icon-btn"
                onClick={closeEditClientModal}
                aria-label="Schließen"
                title="Schließen"
              >
                <X />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <label className="label">Name *</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="label">E-Mail</label>
                    <input
                      className="input"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Telefon</label>
                    <input
                      className="input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>

                <label className="label">Ziele / Fokus</label>
                <textarea
                  className="textarea"
                  value={editGoals}
                  onChange={(e) => setEditGoals(e.target.value)}
                />

                <label className="label">Notizen</label>
                <textarea
                  className="textarea"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
  <button
    className="btn primary save-btn"
    onClick={saveClientEdits}
    disabled={clientEditSaving || !editName.trim()}
  >
    Änderungen speichern
  </button>
</div>

              </div>
            </div>
          </div>
        </div>
      )}
      {/* -------------------------------------------------------------- */}
      {apptModalOpen && (
  <div className="modal-overlay" onMouseDown={() => setApptModalOpen(false)}>
    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h2 style={{ margin: 0 }}>Termin vereinbaren</h2>

        <button
          className="icon-btn"
          onClick={() => setApptModalOpen(false)}
          aria-label="Schließen"
          title="Schließen"
        >
          <X />
        </button>
      </div>

      <div className="modal-body">
       <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
  <div>
    <label className="label">Datum *</label>
    <input
      className="input"
      placeholder="TT.MM.JJJJ"
      value={apptDateDE}
      onChange={(e) => setApptDateDE(formatDateInputDE(e.target.value))}
    />
  </div>

  <div>
    <label className="label">Uhrzeit</label>
    <input
      className="input"
      placeholder="HH:MM"
      value={apptTime}
      onChange={(e) => setApptTime(formatTimeInputHHMM(e.target.value))}
    />
  </div>

  {/* ✅ Notiz volle Breite */}
  <div style={{ gridColumn: "1 / -1" }}>
    <label className="label">Notiz</label>
    <textarea
      className="textarea"
      value={apptNotes}
      onChange={(e) => setApptNotes(e.target.value)}
    />
  </div>

  {/* ✅ Button volle Breite / rechts */}
  <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
    <button className="btn primary save-btn" onClick={saveAppointment}>
      Termin speichern
    </button>
  </div>
</div>

      </div>
    </div>
  </div>
)}

    </PageShell>
  );
}
