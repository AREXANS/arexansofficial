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

    const { transactionId, deviceId, forceRecreate } = await req.json();

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Transaction ID required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: transaction, error: txError } = await supabase
      .from("transactions").select("*").eq("transaction_id", transactionId).maybeSingle();

    if (txError || !transaction) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const allowedStatuses = ['claimable', 'claimed', 'paid'];
    if (!forceRecreate && !['claimable', 'paid'].includes(transaction.status)) {
      return new Response(JSON.stringify({ error: "Transaction is not claimable", status: transaction.status }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (forceRecreate && !allowedStatuses.includes(transaction.status)) {
      return new Response(JSON.stringify({ error: "Transaction status invalid for key recreation" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const licenseKey = transaction.license_key;
    if (!licenseKey) {
      return new Response(JSON.stringify({ error: "No license key found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: keysData } = await supabase.from("app_settings").select("value").eq("key", "license_keys").maybeSingle();
    let keys: any[] = [];
    if (keysData) { try { keys = JSON.parse(keysData.value || "[]"); } catch { keys = []; } }

    const existingKeyIndex = keys.findIndex((k: any) => k.key === licenseKey);
    const isLifetime = transaction.package_name === "LIFETIME";
    let newExpiry: Date;

    if (isLifetime) {
      // LIFETIME: permanent expiry, role = ADMIN
      newExpiry = new Date("2099-12-31T23:59:59.000Z");
      if (existingKeyIndex >= 0) {
        keys[existingKeyIndex] = { ...keys[existingKeyIndex], expired: newExpiry.toISOString(), role: "ADMIN" };
      } else {
        keys.push({ key: licenseKey, expired: newExpiry.toISOString(), created: now.toISOString(), role: "ADMIN", maxHwid: 1, frozenUntil: null, frozenRemainingMs: null, hwids: [], robloxUsers: [] });
      }
      await supabase.from("app_settings").update({ value: JSON.stringify(keys), updated_at: now.toISOString() }).eq("key", "license_keys");
    } else if (transaction.status === "paid" && existingKeyIndex >= 0 && !forceRecreate) {
      // Key already exists and was already extended by payment flow - don't extend again
      newExpiry = new Date(keys[existingKeyIndex].expired);
      console.log(`Key ${licenseKey} already extended by payment flow, skipping double extension`);
    } else if (existingKeyIndex >= 0 && forceRecreate) {
      newExpiry = new Date(now.getTime() + (transaction.package_duration * 24 * 60 * 60 * 1000));
      keys[existingKeyIndex] = { ...keys[existingKeyIndex], expired: newExpiry.toISOString(), role: transaction.package_name };
      await supabase.from("app_settings").update({ value: JSON.stringify(keys), updated_at: now.toISOString() }).eq("key", "license_keys");
    } else if (existingKeyIndex >= 0) {
      // Status is 'claimable' - key exists but wasn't extended yet
      const existingKey = keys[existingKeyIndex];
      const currentExpiry = new Date(existingKey.expired);
      newExpiry = currentExpiry < now
        ? new Date(now.getTime() + (transaction.package_duration * 24 * 60 * 60 * 1000))
        : new Date(currentExpiry.getTime() + (transaction.package_duration * 24 * 60 * 60 * 1000));
      keys[existingKeyIndex] = { ...existingKey, expired: newExpiry.toISOString(), role: transaction.package_name };
      await supabase.from("app_settings").update({ value: JSON.stringify(keys), updated_at: now.toISOString() }).eq("key", "license_keys");
    } else {
      // Key doesn't exist - create it
      newExpiry = new Date(now.getTime() + (transaction.package_duration * 24 * 60 * 60 * 1000));
      keys.push({ key: licenseKey, expired: newExpiry.toISOString(), created: now.toISOString(), role: transaction.package_name, maxHwid: 1, frozenUntil: null, frozenRemainingMs: null, hwids: [], robloxUsers: [] });
      await supabase.from("app_settings").update({ value: JSON.stringify(keys), updated_at: now.toISOString() }).eq("key", "license_keys");
    }

    await supabase.from("transactions").update({ status: "claimed", paid_at: transaction.paid_at || now.toISOString() }).eq("transaction_id", transactionId);

    return new Response(
      JSON.stringify({ success: true, key: licenseKey, package: transaction.package_name, days: transaction.package_duration, expired: newExpiry.toISOString(), expiredDisplay: newExpiry.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }), recreated: !!forceRecreate }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
