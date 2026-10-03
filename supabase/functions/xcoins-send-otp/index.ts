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
    const { phone } = await req.json();

    if (!phone || phone.length < 10) {
      return new Response(JSON.stringify({ error: "Nomor WhatsApp tidak valid" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('xcoins_balances')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingUser) {
      // User exists → frontend should show PIN input
      return new Response(JSON.stringify({ success: true, exists: true, phone: cleanPhone }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // New user → send OTP
    const { data: tokenSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'fonnte_token')
      .maybeSingle();

    if (!tokenSetting?.value) {
      return new Response(JSON.stringify({ error: "Fonnte token belum dikonfigurasi" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await supabase.from('xcoins_otp').insert({
      phone: cleanPhone,
      otp_code: otp,
      expires_at: expiresAt.toISOString()
    });

    const otpMessage = `💠 *XCoins Verification*\n\nKode OTP Anda: *${otp}*\n\nKode ini berlaku 5 menit.\n\nJangan bagikan kode ini kepada siapapun.\n\n> _Sent via tools.arexans.my.id_`;

    const formData = new FormData();
    formData.append('target', cleanPhone);
    formData.append('message', otpMessage);

    const fonntRes = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': tokenSetting.value },
      body: formData
    });

    const fonntData = await fonntRes.json();
    console.log("Fonnte response:", JSON.stringify(fonntData));

    if (!fonntData.status) {
      return new Response(JSON.stringify({ error: "Gagal mengirim OTP: " + (fonntData.reason || "Unknown") }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, exists: false, phone: cleanPhone }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
