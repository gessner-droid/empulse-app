"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../ui/PageShell";
import Surface from "../ui/Surface";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

type YesNo = "yes" | "no" | null;

type HealthAnswers = {
  implants: YesNo;
  pregnant: YesNo;
  epilepsy: YesNo;
  transplant: YesNo;
  heart: YesNo;
};

type Client = {
  id: string;
  user_id: string;
  name: string;
  client_code: string | null;
  email: string | null;
  phone: string | null;
  birthdate: string | null; // ISO YYYY-MM-DD
  gender: string | null;
  start_date: string | null; // ISO YYYY-MM-DD
  goals: string | null;
  notes: string | null;
  consent: boolean | null;
  consent_at: string | null;
  created_at: string | null;
  health_flag: boolean | null;

  // gespeicherter Gesundheitscheck
  health_check_passed: boolean | null;
  health_check_flags: string | null;
  health_check_answers: HealthAnswers | null;
};

type ClientForm = {
  name: string;
  client_code: string;
  email: string;
  phone: string;
  birthdate: string; // DE TT.MM.JJJJ
  gender: string;
  start_date: string; // DE TT.MM.JJJJ
  goals: string;
  notes: string;
  consent: boolean;
};

const emptyForm: ClientForm = {
  name: "",
  client_code: "",
  email: "",
  phone: "",
  birthdate: "",
  gender: "",
  start_date: "",
  goals: "",
  notes: "",
  consent: false,
};

const emptyHealth: HealthAnswers = {
  implants: null,
  pregnant: null,
  epilepsy: null,
  transplant: null,
  heart: null,
};

/* ---------------- Date helpers (DE UI <-> ISO DB) ---------------- */

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

  let [dd, mm, yyyy] = parts.map((x) => x.trim());
  if (yyyy.length !== 4) return null;

  dd = dd.padStart(2, "0");
  mm = mm.padStart(2, "0");

  if (dd.length !== 2 || mm.length !== 2) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDE(iso?: string | null) {
  if (!iso) return "";
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return "";
  return `${dd}.${mm}.${yyyy}`;
}

/* ---------------- Health row ---------------- */

function HealthRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.3 }}>{label}</div>

      <div style={{ display: "flex", gap: 10, opacity: disabled ? 0.6 : 1 }}>
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="radio"
            checked={value === "yes"}
            onChange={() => onChange("yes")}
            disabled={disabled}
          />
          Ja
        </label>

        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="radio"
            checked={value === "no"}
            onChange={() => onChange("no")}
            disabled={disabled}
          />
          Nein
        </label>
      </div>
   </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();

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

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Modal (Create/Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);

  const [healthUnlockOpen, setHealthUnlockOpen] = useState(false);
const [healthUnlockText, setHealthUnlockText] = useState("");

  const [health, setHealth] = useState<HealthAnswers>(emptyHealth);

  // ✅ neu: Health-Edit Lock
  const [healthEditUnlocked, setHealthEditUnlocked] = useState(false);

  const activeClient = useMemo(() => {
    if (!activeId) return null;
    return clients.find((c) => c.id === activeId) ?? null;
  }, [clients, activeId]);

  const healthComplete = Object.values(health).every((v) => v === "yes" || v === "no");

  const healthFlags = useMemo(() => {
    const flags: string[] = [];
    if (health.implants === "yes") flags.push("Herzschrittmacher / elektrische oder metallische Implantate: JA");
    if (health.pregnant === "yes") flags.push("Schwangerschaft: JA");
    if (health.epilepsy === "yes") flags.push("Epilepsie: JA");
    if (health.transplant === "yes") flags.push("Organtransplantation: JA");
    if (health.heart === "yes") flags.push("Herzerkrankung / Herzrhythmus-Störung: JA");
    return flags;
  }, [health]);

  const healthPassed = healthComplete && healthFlags.length === 0;

  function isFormValid() {
    return form.name.trim().length > 0;
  }

  useEffect(() => {
    loadClients();
  }, []);

  // Tastatur UX: ESC schließt, Enter speichert (außer Textarea)
  useEffect(() => {
    if (!modalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "TEXTAREA") return;
        if (!isFormValid()) return;

        // Create: Gesundheitsfragen müssen vollständig sein
        if (mode === "create" && !healthComplete) return;

        e.preventDefault();
        saveClient();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, form, mode, healthComplete]);

  async function loadClients() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("clients")
      .select(
        "id,user_id,name,client_code,email,phone,birthdate,gender,start_date,goals,notes,consent,health_flag,consent_at,created_at,health_check_passed,health_check_flags,health_check_answers"
      )
      .order("created_at", { ascending: false });

    if (error) setMsg(error.message);
    setClients((data as Client[]) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((c) =>
      `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.client_code ?? ""} ${c.notes ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [clients, search]);

  function openCreate() {
    setMsg("");
    setMode("create");
    setActiveId(null);
    setForm(emptyForm);
    setModalOpen(true);

    setHealth(emptyHealth);

    setHealthEditUnlocked(true); // ✅ bei create darf man ausfüllen
  }

  function openEdit(c: Client) {
    setMsg("");
    setMode("edit");
    setActiveId(c.id);

    setForm({
      name: c.name ?? "",
      client_code: c.client_code ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      birthdate: isoToDE(c.birthdate),
      gender: c.gender ?? "",
      start_date: isoToDE(c.start_date),
      goals: c.goals ?? "",
      notes: c.notes ?? "",
      consent: !!c.consent,
    });

    // ✅ edit: check sichtbar, aber gesperrt
    setHealthEditUnlocked(false);
    setHealth((c.health_check_answers as HealthAnswers) ?? emptyHealth);

    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function saveClient() {
    if (!form.name.trim()) {
      setMsg("Bitte Name eingeben.");
      return;
    }

    setLoading(true);
    setMsg("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setMsg("Nicht eingeloggt.");
      setLoading(false);
      return;
    }

    const prev = mode === "edit" ? activeClient : null;
    const shouldUpdateHealth = mode === "create" || healthEditUnlocked;

    // Wenn man den Check im Edit entsperrt, müssen alle Fragen beantwortet werden
    if (shouldUpdateHealth && !healthComplete) {
      setMsg("Bitte alle Gesundheitsfragen mit Ja/Nein beantworten.");
      setLoading(false);
      return;
    }

    const hasHealthIssue =
      health.implants === "yes" ||
      health.pregnant === "yes" ||
      health.epilepsy === "yes" ||
      health.transplant === "yes" ||
      health.heart === "yes";

    const payload: any = {
      name: form.name.trim(),
      client_code: form.client_code.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      birthdate: deToISO(form.birthdate),
      gender: form.gender.trim() || null,
      start_date: deToISO(form.start_date),
      goals: form.goals.trim() || null,
      notes: form.notes.trim() || null,
      consent: form.consent,
      consent_at: form.consent ? new Date().toISOString() : null,

      // ✅ Gesundheitsfelder nur überschreiben, wenn create oder unlocked
      health_flag: shouldUpdateHealth ? hasHealthIssue : (prev?.health_flag ?? false),
      health_check_passed: shouldUpdateHealth ? healthPassed : (prev?.health_check_passed ?? null),
      health_check_flags: shouldUpdateHealth ? (healthPassed ? null : healthFlags.join("; ")) : (prev?.health_check_flags ?? null),
      health_check_answers: shouldUpdateHealth ? health : (prev?.health_check_answers ?? null),
    };

    let error: any = null;

    if (mode === "create") {
      const res = await supabase.from("clients").insert({
        ...payload,
        user_id: user.id,
      });
      error = res.error;
    } else {
      if (!activeId) {
        setMsg("Kein Kunde ausgewählt.");
        setLoading(false);
        return;
      }
      const res = await supabase.from("clients").update(payload).eq("id", activeId);
      error = res.error;
    }

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    setModalOpen(false);
    setLoading(false);
    await loadClients();
  }

  async function deleteClient(id: string) {
    if (!confirm("Kunde wirklich löschen?")) return;

    setLoading(true);
    setMsg("");

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) setMsg(error.message);
    await loadClients();
    setLoading(false);
}
  // Anzeige für gespeicherten Gesundheitscheck (Auffälligkeiten als Liste)
  const storedHealth = useMemo(() => {
    if (!activeClient) return { kind: "text" as const, text: "—", items: [] as string[] };

    const flagsRaw = activeClient.health_check_flags?.trim();
    if (flagsRaw) {
      const items = flagsRaw
        .split(/[;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      return { kind: "flags" as const, text: "", items };
    }

    if (activeClient.health_check_passed === true) {
      return {
        kind: "text" as const,
        text: "Gesundheitscheck ✓ (keine Auffälligkeiten laut Selbstauskunft)",
        items: [],
      };
    }
    if (activeClient.health_check_passed === false) {
      return {
        kind: "text" as const,
        text: "⚠️ Gesundheitscheck – Auffälligkeiten vorhanden.",
        items: [],
      };
    }
    return { kind: "text" as const, text: "—", items: [] as string[] };
  }, [activeClient]);

  return (
    <PageShell
      title="Kunden"
      subtitle="Anlegen, suchen, bearbeiten – im empulse Style"
      actions={
        <>
          <button className="btn ghost" onClick={loadClients} disabled={loading}>
            Aktualisieren
          </button>
          <button className="btn primary" onClick={openCreate}>
            + Kunde erstellen
          </button>
        </>
      }
    >
      {msg && (
        <Surface className="mb">
          <div style={{ opacity: 0.8 }}>{msg}</div>
        </Surface>
      )}

      {/* Suche */}
      <Surface className="clients-search">
        <input
          className="search-input"
          placeholder="Suche nach Name, Code, Mail oder Telefon …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Surface>

      {/* Liste */}
      <div className="client-list">
        {filtered.map((c) => (
          <Surface key={c.id}>
            <div className="client-row">
              {/* Klickbarer Bereich */}
              <Link
                href={`/clients/${c.id}`}
                className="client-main-link"
                style={{ textDecoration: "none", color: "inherit", flex: 1 }}
              >
                <div className="client-main">
                  <div className="client-name">{c.name}</div>

                  <div className="client-meta">
                    {c.email && (
                      <span>
                        <Mail size={16} /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span>
                        <Phone size={16} /> {c.phone}
                      </span>
                    )}
                    {c.start_date && (
                      <span>
                        <Calendar size={16} /> Start: {isoToDE(c.start_date)}
                      </span>
                    )}

                    <span className={c.consent ? "ok" : ""}>
                      <CheckCircle2 size={16} color={c.consent ? "#16a34a" : "#f97316"} />
                      {c.consent ? "Einwilligung" : "Keine Einwilligung"}
                    </span>

                    {c.health_flag && (
                      <span style={{ color: "#b45309", fontWeight: 600 }}>
                        ⚠️ Gesundheitshinweis
                      </span>
                    )}
                  </div>
                </div>
              </Link>

              {/* rechts: nur Icons */}
              <div className="client-actions">
                <button
                  className="icon-btn"
                  title="Bearbeiten"
                  aria-label="Bearbeiten"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(c);
                  }}
                  disabled={loading}
                >
                  <Pencil />
                </button>

                <button
                  className="icon-btn danger"
                  title="Löschen"
                  aria-label="Löschen"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteClient(c.id);
                  }}
                  disabled={loading}
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          </Surface>
        ))}

        {!loading && filtered.length === 0 && (
          <Surface>
            <div style={{ opacity: 0.7 }}>Keine Kunden gefunden</div>
          </Surface>
        )}
      </div>

      {/* Modal Create/Edit – gleiches Formular */}
      {modalOpen && (
        <div className="modal-overlay" onMouseDown={closeModal}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>
                {mode === "create" ? "Kunde erstellen" : "Kunde bearbeiten"}
              </h2>

              <button className="icon-btn" onClick={closeModal} aria-label="Schließen" title="Schließen">
                <X />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {/* Name */}
                <label className="label">Name *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />

                {/* Kundencode / Start */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="label">Kundencode / interne ID</label>
                    <input
                      className="input"
                      value={form.client_code}
                      onChange={(e) => setForm({ ...form, client_code: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Startdatum</label>
                    <input
                      className="input"
                      placeholder="TT.MM.JJJJ"
                      value={form.start_date}
                      onChange={(e) =>
                        setForm({ ...form, start_date: formatDateInputDE(e.target.value) })
                      }
                    />
                  </div>
                </div>

                {/* Email / Telefon */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="label">E-Mail</label>
                    <input
                      className="input"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Telefon</label>
                    <input
                      className="input"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Geburtsdatum / Geschlecht */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="label">Geburtsdatum</label>
                    <input
                      className="input"
                      placeholder="TT.MM.JJJJ"
                      value={form.birthdate}
                      onChange={(e) =>
                        setForm({ ...form, birthdate: formatDateInputDE(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Geschlecht (optional)</label>
                    <select
                      className="select"
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="">—</option>
                      <option value="w">weiblich</option>
                      <option value="m">männlich</option>
                      <option value="d">divers</option>
                    </select>
                  </div>
                </div>

                {/* Ziele / Fokus */}
                <label className="label">Ziele / Fokus (optional)</label>
                <textarea
                  className="textarea"
                  value={form.goals}
                  onChange={(e) => setForm({ ...form, goals: e.target.value })}
                />

                {mode === "edit" && (
                  <>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      Gesundheitscheck (gespeichert)
                    </div>

                    <div style={{ opacity: 0.85, fontSize: 13, lineHeight: 1.35 }}>
                      {storedHealth.kind === "flags" ? (
                        <>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>
                            ⚠️ Gesundheitscheck – Auffälligkeiten:
                          </div>
                          <ul style={{ margin: "0 0 0 16px", padding: 0 }}>
                            {storedHealth.items.map((item, idx) => (
                              <li key={`${item}-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        storedHealth.text
                      )}
                    </div>

                    {healthEditUnlocked && (
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>
                          Gesundheitsfragen sind jetzt editierbar.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {healthUnlockOpen && (
                  <div className="modal-overlay" onMouseDown={() => setHealthUnlockOpen(false)}>
                    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="modal-head">
                        <h2 style={{ margin: 0 }}>Gesundheitsfragen freischalten</h2>

                        <button
                          className="icon-btn"
                          onClick={() => setHealthUnlockOpen(false)}
                          aria-label="Schließen"
                          title="Schließen"
                        >
                          <X />
                        </button>
                      </div>

                      <div className="modal-body">
                        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                          <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.35 }}>
                            Um die Gesundheitsfragen bearbeiten zu können, tippe bitte{" "}
                            <b>BEARBEITEN</b> (Großbuchstaben).
                          </div>

                          <input
                            className="input"
                            placeholder="BEARBEITEN"
                            value={healthUnlockText}
                            onChange={(e) => setHealthUnlockText(e.target.value)}
                          />

                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                            <button
                              className="btn primary save-btn"
                              disabled={healthUnlockText.trim() !== "BEARBEITEN"}
                              onClick={() => {
                                setHealthEditUnlocked(true);
                                setHealthUnlockOpen(false);
                                setHealthUnlockText("");
                              }}
                            >
                              Freischalten
                            </button>
                          </div>

                          <div style={{ fontSize: 12, opacity: 0.65 }}>
                            Hinweis: Änderungen an Gesundheitsfragen sollten nur vorgenommen werden, wenn der Check erneut durchgeführt wurde.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Optional: kurzer Status wenn freigeschaltet */}
                {(mode === "create" || (mode === "edit" && healthEditUnlocked)) && (
                  <details
                    open
                    style={{
                      border: "1px solid rgba(11,28,45,.10)",
                      borderRadius: 14,
                      padding: 12,
                      marginTop: 6,
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                      Wichtige Gesundheitsfragen (Pflicht)
                    </summary>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <HealthRow
                        label="Tragen Sie einen Herzschrittmacher oder sonstige elektrische oder metallische Implantate?"
                        value={health.implants}
                        onChange={(v) => setHealth({ ...health, implants: v })}
                      />
                      <HealthRow
                        label="Sind Sie derzeit schwanger?"
                        value={health.pregnant}
                        onChange={(v) => setHealth({ ...health, pregnant: v })}
                      />
                      <HealthRow
                        label="Leiden Sie unter Epilepsie?"
                        value={health.epilepsy}
                        onChange={(v) => setHealth({ ...health, epilepsy: v })}
                      />
                      <HealthRow
                        label="Wurde bei Ihnen eine Organtransplantation durchgeführt?"
                        value={health.transplant}
                        onChange={(v) => setHealth({ ...health, transplant: v })}
                      />
                      <HealthRow
                        label="Wurde bei Ihnen eine Herzerkrankung diagnostiziert (z. B. Herzinsuffizienz, schwere Herzrhythmus-Störung etc.)?"
                        value={health.heart}
                        onChange={(v) => setHealth({ ...health, heart: v })}
                      />

                      {healthComplete && (
                        <div
                          style={{
                            paddingTop: 8,
                            fontWeight: 700,
                            color: healthPassed ? "#16a34a" : "#dc2626",
                          }}
                        >
                          {healthPassed
                            ? "Gesundheitscheck ✓"
                            : "⚠️ Gesundheitscheck: Bitte Hinweis unten beachten."}
                        </div>
                      )}

                      {!healthComplete && (
                        <div style={{ paddingTop: 8, fontWeight: 600, opacity: 0.7 }}>
                          Bitte alle Fragen mit Ja/Nein beantworten.
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {mode === "edit" && !healthEditUnlocked && (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    <span
                      style={{ cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                      onClick={() => setHealthUnlockOpen(true)}
                      title="Gesundheitsfragen bearbeiten"
                    >
                      Hier bearbeite…
                    </span>
                  </div>
                )}

                {/* Notizen */}
                <label className="label">Notizen / Besonderheiten (optional)</label>
                <textarea
                  className="textarea"
                  value={form.notes}
                  onChange={(e) => {
                    setForm({ ...form, notes: e.target.value });
                  }}
                />

                {/* DSGVO */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  <input
                    id="consent"
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                  />
                  <label htmlFor="consent" style={{ color: "rgba(11,28,45,.75)" }}>
                    Einwilligung zur Datenspeicherung liegt vor (DSGVO)
                  </label>
                </div>

                {/* Save */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button
                    className="btn primary save-btn"
                    onClick={saveClient}
                    disabled={
                      loading ||
                      !form.name.trim() ||
                      (mode === "create" && !healthComplete) ||
                      (mode === "edit" && healthEditUnlocked && !healthComplete)
                    }
                  >
                    Änderungen speichern
                  </button>
                </div>

                {mode === "edit" && !healthEditUnlocked && (
                  <div style={{ marginTop: 6, opacity: 0.65, fontSize: 12 }}>
                    Hinweis: Gesundheitsfragen sind gesperrt und werden beim Speichern nicht verändert.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
