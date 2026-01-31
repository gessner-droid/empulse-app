// Supabase Edge Function: appointment-actions
// Public token-based appointment management (confirm/cancel/reschedule/get).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase env missing" }, 500);
    }

    const { action, token, starts_at } = await req.json();
    if (!token) return jsonResponse({ error: "Missing token" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: appt, error } = await supabase
      .from("appointments")
      .select(
        "id,starts_at,duration_min,status,client:clients(name,email),confirm_token,cancel_token,reschedule_token"
      )
      .or(
        `confirm_token.eq.${token},cancel_token.eq.${token},reschedule_token.eq.${token}`
      )
      .single();

    if (error || !appt) {
      return jsonResponse({ error: "Appointment not found" }, 404);
    }

    if (action === "get") {
      return jsonResponse({
        appointment: {
          id: appt.id,
          starts_at: appt.starts_at,
          duration_min: appt.duration_min,
          status: appt.status ?? null,
          client_name: appt.client?.name ?? "Kunde",
          client_email: appt.client?.email ?? "",
        },
      });
    }

    const now = new Date().toISOString();
    let updatePayload: Record<string, unknown> = {};

    if (action === "confirm") {
      updatePayload = { status: "CONFIRMED", confirmed_at: now };
    } else if (action === "cancel") {
      updatePayload = { status: "CANCELLED", cancelled_at: now };
    } else if (action === "reschedule") {
      if (!starts_at) return jsonResponse({ error: "Missing starts_at" }, 400);
      updatePayload = { status: "RESCHEDULED", rescheduled_at: now, starts_at };
    } else {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    const { data: updated, error: updateErr } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", appt.id)
      .select("id,starts_at,duration_min,status")
      .single();

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 500);
    }

    return jsonResponse({
      appointment: {
        id: updated.id,
        starts_at: updated.starts_at,
        duration_min: updated.duration_min,
        status: updated.status ?? null,
        client_name: appt.client?.name ?? "Kunde",
        client_email: appt.client?.email ?? "",
      },
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
