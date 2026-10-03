import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-heartbeat-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Constant-time string compare
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const expected = Deno.env.get("DEV_HEARTBEAT_TOKEN") || "";
    const provided =
      req.headers.get("x-heartbeat-token") ||
      url.searchParams.get("token") ||
      "";

    if (!expected || !provided || !safeEq(provided, expected)) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.from("app_settings").upsert(
      {
        key: "developer_last_seen",
        value: String(Date.now()),
        description: "Developer device heartbeat (ms epoch)",
      },
      { onConflict: "key" },
    );

    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
