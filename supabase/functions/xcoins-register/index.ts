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
    const { phone, otp, pin } = await req.json();

    if (!phone || !otp || !pin) {
      return new Response(JSON.stringify({ error: "Data tidak lengkap" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN harus 6 digit angka" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify OTP
    const { data: otpData } = await supabase
      .from('xcoins_otp')
      .select('*')
      .eq('phone', phone)
      .eq('otp_code', otp)
      .eq('is_used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpData) {
      return new Response(JSON.stringify({ error: "OTP tidak valid atau sudah kadaluarsa" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from('xcoins_otp').update({ is_used: true }).eq('id', otpData.id);

    const pinHash = await hashPin(pin);
    const { data: user, error: userError } = await supabase
      .from('xcoins_balances')
      .insert({
        phone,
        pin_hash: pinHash,
        display_name: phone.slice(-4),
        balance: 0
      })
      .select()
      .single();

    if (userError) {
      return new Response(JSON.stringify({ error: "Gagal membuat akun: " + userError.message }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
