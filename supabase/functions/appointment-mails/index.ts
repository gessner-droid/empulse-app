// Supabase Edge Function: appointment-mails
// Sends confirmation and reminder emails via Resend.

export const config = { auth: false };

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ?? "fysky2006@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 200);
    if (!RESEND_API_KEY) return jsonResponse({ error: "RESEND_API_KEY missing" }, 500);

    const raw = await req.text();
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return jsonResponse({ ok: false, error: "Invalid JSON body", detail: String(e) }, 200);
    }
    const {
      type,
      client_name,
      client_email,
      starts_at,
      duration_min,
      confirm_url,
      cancel_url,
      reschedule_url,
    } = payload ?? {};

    if (!client_email || !starts_at) {
      return jsonResponse({ ok: false, error: "Missing fields" }, 200);
    }

    const start = new Date(starts_at).toLocaleString("de-DE", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const durationText = duration_min ? `Dauer: ${duration_min} Min.` : "";

    const subject =
      type === "reminder"
        ? "Termin-Erinnerung"
        : "Terminbestätigung – bitte bestätigen";

    const actionHtml =
      type === "reminder"
        ? ""
        : `
      <div style="margin-top:18px;">
        <a href="${confirm_url}" style="display:inline-block;min-width:180px;text-align:center;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#0b1c2d,#123a5f);color:#fff;text-decoration:none;font-weight:700;margin:4px 6px 4px 0;">Termin bestätigen</a>
        <a href="${reschedule_url}" style="display:inline-block;min-width:180px;text-align:center;padding:12px 16px;border-radius:10px;border:1px solid #a9c7e6;color:#0b4f88;text-decoration:none;font-weight:700;margin:4px 6px 4px 0;background:#f3f8ff;">Verschieben</a>
        <a href="${cancel_url}" style="display:inline-block;min-width:180px;text-align:center;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#ff4d4f,#c81e1e);color:#fff;text-decoration:none;font-weight:700;margin:4px 0;">Absagen</a>
      </div>`;

    const html = `
      <div style="background:#f5f7fb;padding:32px 12px;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7ecf4;box-shadow:0 10px 34px rgba(11,28,45,0.12);font-family:Arial,sans-serif;line-height:1.6;color:#0b1c2d;">
          <div style="padding:18px 24px;background:linear-gradient(135deg,#0b1c2d,#123a5f);color:#ffffff;">
            <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:700;">Empulse</div>
            <div style="margin-top:6px;font-size:22px;font-weight:700;">
              ${type === "reminder" ? "Termin-Erinnerung" : "Terminbestätigung"}
            </div>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 8px;font-size:16px;">Hallo ${client_name || "Kunde"},</p>
            <p style="margin:0 0 12px;color:#334155;">
              ${type === "reminder" ? "Dies ist Ihre 24h-Erinnerung." : "Bitte bestätigen oder ändern Sie Ihren Termin."}
            </p>

            <div style="background:#f6f9fd;border:1px solid #e6edf6;border-radius:12px;padding:14px 16px;margin:14px 0;">
              <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b7d;">Termin</div>
              <div style="margin-top:4px;font-size:16px;font-weight:700;">${start}</div>
              ${durationText ? `<div style="margin-top:6px;color:#4b5563;font-size:13px;">${durationText}</div>` : ""}
            </div>

            ${actionHtml}
          </div>
          <div style="padding:14px 24px;background:#f7f9fc;border-top:1px solid #edf2f7;font-size:12px;color:#6b7280;">
            Diese E-Mail wurde automatisch von der Praxis gesendet.
          </div>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: client_email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Resend error:", text);
      return jsonResponse({ ok: false, error: text }, 200);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 200);
  }
});
