// Supabase Edge Function: appointment-mails
// Sends confirmation and reminder emails via Resend.

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
      <div style="margin-top:16px;">
        <a href="${confirm_url}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0b1c2d;color:#fff;text-decoration:none;font-weight:600;">Termin bestätigen</a>
        <a href="${reschedule_url}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #d5dbe3;color:#0b1c2d;text-decoration:none;font-weight:600;margin-left:8px;">Verschieben</a>
        <a href="${cancel_url}" style="display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #f2c2c2;color:#b91c1c;text-decoration:none;font-weight:600;margin-left:8px;">Absagen</a>
      </div>`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0b1c2d;">
        <h2 style="margin:0 0 8px;">Hallo ${client_name || "Kunde"},</h2>
        <p>Ihr Termin ist am <b>${start}</b>.</p>
        ${durationText ? `<p>${durationText}</p>` : ""}
        ${
          type === "reminder"
            ? "<p>Dies ist Ihre 24h-Erinnerung.</p>"
            : "<p>Bitte bestätigen Sie den Termin oder verschieben/absagen Sie ihn.</p>"
        }
        ${actionHtml}
        <p style="margin-top:18px;font-size:12px;color:#6b7280;">Diese E-Mail wurde automatisch von der Praxis gesendet.</p>
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
