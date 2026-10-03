import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStorageStats } from "../_shared/storage-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stats = await getStorageStats(supabase, true);
    return new Response(JSON.stringify({ success: true, ...stats }), { headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("storage-stats error", error);
    return new Response(JSON.stringify({ success: false, error: "Gagal membaca status penyimpanan" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
