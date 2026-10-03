import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Returns the full heartbeat URL (with token) to be used by the admin device
// (PWA service worker / Tasker / cron). Guarded by the admin_key stored in
// app_settings — the same password used to log into /developer.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adminKey } = await req.json().catch(() => ({}));
    if (!adminKey) {
      return new Response(JSON.stringify({ error: "adminKey required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await supabase.from("app_settings").select("value").eq("key", "admin_key").maybeSingle();

    if (!data || String(data.value) !== String(adminKey)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("DEV_HEARTBEAT_TOKEN") || "";
    const base = Deno.env.get("SUPABASE_URL") || "";
    const url = `${base}/functions/v1/dev-heartbeat?token=${encodeURIComponent(token)}`;

    return new Response(JSON.stringify({ ok: true, url, token }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
