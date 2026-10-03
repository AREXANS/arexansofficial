import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { code, licenseKey } = await req.json();

    if (!code || !licenseKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Kode dan license key wajib diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the duration code
    const { data: codeData, error: codeError } = await supabase
      .from("duration_codes")
      .select("*")
      .eq("code", code.trim())
      .eq("is_active", true)
      .maybeSingle();

    if (codeError || !codeData) {
      return new Response(
        JSON.stringify({ success: false, error: "Kode tidak ditemukan atau tidak aktif" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if code has expired
    const now = new Date();
    if (new Date(codeData.expires_at) < now) {
      return new Response(
        JSON.stringify({ success: false, error: "Kode sudah kedaluwarsa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this license key already used this code
    const usedBy: { key: string; claimedAt: string }[] = codeData.used_by || [];
    const alreadyUsed = usedBy.some((u) => u.key === licenseKey);
    if (alreadyUsed) {
      return new Response(
        JSON.stringify({ success: false, error: "Kode ini sudah pernah digunakan untuk key Anda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the license key in app_settings
    const { data: keysData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "license_keys")
      .maybeSingle();

    if (!keysData) {
      return new Response(
        JSON.stringify({ success: false, error: "Database key tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let keys: any[] = [];
    try { keys = JSON.parse(keysData.value || "[]"); } catch { keys = []; }

    const keyIndex = keys.findIndex((k: any) => k.key === licenseKey);
    if (keyIndex === -1) {
      return new Response(
        JSON.stringify({ success: false, error: "License key tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extend the key's expiry
    const keyData = keys[keyIndex];
    const currentExpiry = new Date(keyData.expired);
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseDate.getTime() + codeData.duration_days * 24 * 60 * 60 * 1000);
    
    keys[keyIndex] = { ...keyData, expired: newExpiry.toISOString() };

    // Update the keys
    await supabase
      .from("app_settings")
      .update({ value: JSON.stringify(keys), updated_at: now.toISOString() })
      .eq("key", "license_keys");

    // Record usage
    usedBy.push({ key: licenseKey, claimedAt: now.toISOString() });
    await supabase
      .from("duration_codes")
      .update({ used_by: usedBy, updated_at: now.toISOString() })
      .eq("id", codeData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Berhasil! Durasi +${codeData.duration_days} hari ditambahkan`,
        durationAdded: codeData.duration_days,
        newExpiry: newExpiry.toISOString(),
        newExpiryDisplay: newExpiry.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
