import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    const { data: blocked } = await supabase
      .from("blocked_ips")
      .select("id, reason")
      .eq("ip_address", clientIp)
      .maybeSingle();

    return new Response(JSON.stringify({
      ip: clientIp,
      blocked: !!blocked,
      reason: blocked?.reason || null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ ip: "unknown", blocked: false }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
