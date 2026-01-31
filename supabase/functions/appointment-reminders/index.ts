// Supabase Edge Function: appointment-reminders
// Sends 24h reminders for upcoming appointments.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async () => {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase env missing" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    const { data: appts, error } = await supabase
      .from("appointments")
      .select(
        "id,starts_at,duration_min,status,confirm_token,cancel_token,reschedule_token,client:clients(name,email)"
      )
      .gte("starts_at", in23h.toISOString())
      .lte("starts_at", in24h.toISOString())
      .is("reminder_sent_at", null)
      .neq("status", "CANCELLED");

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!appts?.length) {
      return jsonResponse({ ok: true, sent: 0 });
    }

    for (const appt of appts) {
      const base = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.health-solutions-360.com";
      await supabase.functions.invoke("appointment-mails", {
        body: {
          type: "reminder",
          client_name: appt.client?.name ?? "Kunde",
          client_email: appt.client?.email ?? "",
          starts_at: appt.starts_at,
          duration_min: appt.duration_min,
          confirm_url: `${base}/appointments/manage/${appt.confirm_token}?action=confirm`,
          cancel_url: `${base}/appointments/manage/${appt.cancel_token}?action=cancel`,
          reschedule_url: `${base}/appointments/manage/${appt.reschedule_token}?action=reschedule`,
        },
      });

      await supabase
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", appt.id);
    }

    return jsonResponse({ ok: true, sent: appts.length });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
