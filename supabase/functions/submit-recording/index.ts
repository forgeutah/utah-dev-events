import { serve } from "https://deno.land/std@0.171.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Keep in sync with src/utils/recordingUrl.ts ALLOWED_RECORDING_HOSTS.
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
  "loom.com",
  "www.loom.com",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { event_id?: string; recording_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventId = body.event_id;
  const recordingUrl = body.recording_url;

  if (!eventId || !UUID_RE.test(eventId)) {
    return json({ error: "Invalid event_id" }, 400);
  }
  if (!recordingUrl || typeof recordingUrl !== "string") {
    return json({ error: "Missing recording_url" }, 400);
  }
  if (recordingUrl.length > 2000) {
    return json({ error: "URL too long" }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(recordingUrl);
  } catch {
    return json({ error: "Invalid URL" }, 400);
  }
  if (parsed.protocol !== "https:") {
    return json({ error: "URL must use https" }, 400);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return json({ error: "Host not allowed" }, 400);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://gocvjqljtcxtcrwvfwez.supabase.co";
  if (!serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: event, error: fetchErr } = await admin
    .from("events")
    .select("id, link, status, event_date, recording_status")
    .eq("id", eventId)
    .eq("status", "approved")
    .maybeSingle();

  if (fetchErr) {
    return json({ error: "Lookup failed" }, 500);
  }
  if (!event) {
    return json({ error: "Event not found" }, 404);
  }
  if (event.recording_status === "approved") {
    return json({ error: "Recording already approved" }, 409);
  }
  if (event.link && event.link === recordingUrl) {
    return json({ error: "That's the event page, not a recording" }, 400);
  }

  const { error: updateErr } = await admin
    .from("events")
    .update({ recording_url: recordingUrl, recording_status: "pending" })
    .eq("id", eventId)
    .neq("recording_status", "approved");

  if (updateErr) {
    return json({ error: "Update failed" }, 500);
  }

  return json({ ok: true }, 200);
});
