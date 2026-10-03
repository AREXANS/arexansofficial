import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return new Response(JSON.stringify({ error: "Nomor WA dan PIN wajib diisi" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;

    const { data: user } = await supabase
      .from('xcoins_balances')
      .select('*')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (!user) {
      return new Response(JSON.stringify({ error: "Akun tidak ditemukan", notFound: true }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!user.is_active) {
      return new Response(JSON.stringify({ error: "Akun dinonaktifkan" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const pinHash = await hashPin(pin);
    if (pinHash !== user.pin_hash) {
      return new Response(JSON.stringify({ error: "PIN salah" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user: { id: user.id, phone: user.phone, display_name: user.display_name, balance: user.balance }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
