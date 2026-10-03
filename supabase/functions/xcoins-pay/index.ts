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
    // Capture IP address
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("x-real-ip") 
      || req.headers.get("cf-connecting-ip") 
      || "unknown";

    const { userId, pin, amount, packageName, packageDuration, licenseKey, deviceId } = await req.json();

    if (!userId || !pin || !amount || !packageName || !packageDuration || !licenseKey) {
      return new Response(JSON.stringify({ error: "Data tidak lengkap" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify user & PIN
    const { data: user } = await supabase.from('xcoins_balances').select('*').eq('id', userId).single();
    if (!user) {
      return new Response(JSON.stringify({ error: "User tidak ditemukan" }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const pinHash = await hashPin(pin);
    if (pinHash !== user.pin_hash) {
      return new Response(JSON.stringify({ error: "PIN salah" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (user.balance < amount) {
      return new Response(JSON.stringify({ error: `Saldo tidak cukup. Saldo: ${user.balance} XCoins, Harga: ${amount} XCoins` }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Deduct balance
    const newBalance = user.balance - amount;
    await supabase.from('xcoins_balances').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', userId);

    const transactionId = `XPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Record XCoins transaction
    await supabase.from('xcoins_transactions').insert({
      user_id: userId,
      type: 'purchase',
      amount: -amount,
      balance_after: newBalance,
      description: `Beli ${packageName} ${packageDuration} hari - ${licenseKey}`,
      reference_id: transactionId
    });

    // Create payment transaction (auto-paid)
    await supabase.from("transactions").insert({
      transaction_id: transactionId,
      customer_name: "Keysistem",
      package_name: packageName,
      package_duration: packageDuration,
      original_amount: amount,
      total_amount: amount,
      status: "claimed",
      license_key: licenseKey,
      paid_at: new Date().toISOString(),
      customer_whatsapp: user.phone,
      device_id: deviceId || null,
      ip_address: clientIp,
    });

    // === CREATE LICENSE KEY in app_settings ===
    await createLicenseKey(supabase, licenseKey, packageName, packageDuration);

    // Discord notification
    try {
      const { data: discordSetting } = await supabase
        .from("app_settings").select("value").eq("key", "discord_webhook_url").maybeSingle();
      if (discordSetting?.value) {
        const embed = {
          title: "💰 Pembayaran XCoins Berhasil!",
          color: 0x00ff00,
          fields: [
            { name: "Transaction ID", value: transactionId, inline: true },
            { name: "Customer", value: user.display_name || user.phone, inline: true },
            { name: "Package", value: `${packageName} (${packageDuration} hari)`, inline: true },
            { name: "Amount", value: `${amount} XCoins`, inline: true },
            { name: "License Key", value: licenseKey, inline: false },
          ],
          timestamp: new Date().toISOString(),
        };
        await fetch(discordSetting.value, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        });
      }
    } catch (e) {
      console.error("Discord error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      transactionId,
      newBalance,
      paid: true
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function createLicenseKey(supabase: any, key: string, packageName: string, packageDuration: number) {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "license_keys")
      .maybeSingle();

    let keys = [];
    if (data) {
      try { keys = JSON.parse(data.value || "[]"); } catch { keys = []; }
    }

    const existingIdx = keys.findIndex((k: any) => k.key === key);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (Number(packageDuration) || 30));

    if (existingIdx >= 0) {
      // Extend existing key
      const existing = keys[existingIdx];
      const currentExpiry = new Date(existing.expired);
      const now = new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setDate(baseDate.getDate() + (Number(packageDuration) || 30));
      keys[existingIdx].expired = baseDate.toISOString();
      keys[existingIdx].role = packageName || existing.role;
      console.log(`Extended key ${key} to ${baseDate.toISOString()}`);
    } else {
      keys.push({
        key,
        expired: expiryDate.toISOString(),
        created: new Date().toISOString(),
        role: packageName || "NORMAL",
        maxHwid: 1,
        frozenUntil: null,
        frozenRemainingMs: null,
        hwids: [],
        robloxUsers: []
      });
      console.log(`Created new key ${key}, expires ${expiryDate.toISOString()}`);
    }

    await supabase
      .from("app_settings")
      .upsert({
        key: "license_keys",
        value: JSON.stringify(keys),
        updated_at: new Date().toISOString(),
        description: "License keys database"
      }, { onConflict: "key" });

    console.log("License key saved successfully via XCoins");
  } catch (error) {
    console.error("Create key error:", error);
  }
}