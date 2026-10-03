import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface KeyData {
  key: string;
  expired: string;
  role: string;
  maxHwid: number;
  frozenUntil: string | null;
  frozenRemainingMs?: number;
  hwids: string[];
  robloxUsers: { hwid: string; username: string; registeredAt: string; }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { key, hwid, robloxUsername, productId, productRawId } = await req.json();

    if (!key) {
      return new Response(
        JSON.stringify({ success: false, error: "Key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanKey = String(key).trim().toUpperCase();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();

    // 1. IF PRODUCT ID IS PROVIDED, CHECK TOKO SCRIPT KEYS FIRST
    if (productId || cleanKey.startsWith("TS-")) {
      const { data: tokoSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "toko_scripts_keys_data")
        .maybeSingle();

      let tokoKeys: any[] = [];
      if (tokoSetting?.value) {
        try { tokoKeys = JSON.parse(tokoSetting.value); } catch {}
      }

      const foundTokoKey = tokoKeys.find((k: any) => (k.key || "").toUpperCase() === cleanKey);

      if (foundTokoKey) {
        // STRICT CHECK: 1 Key = 1 Product Purchased
        if (productId) {
          const target = String(productId).trim().toLowerCase();
          const targetRaw = productRawId ? String(productRawId).trim().toLowerCase() : "";
          const keyProd = String(foundTokoKey.productId || "").trim().toLowerCase();
          const keyRaw = String(foundTokoKey.productRawId || "").trim().toLowerCase();

          const isMatch = (
            keyProd === target ||
            (targetRaw && keyProd === targetRaw) ||
            (keyRaw && (keyRaw === target || keyRaw === targetRaw))
          );

          if (!isMatch) {
            return new Response(
              JSON.stringify({
                success: false,
                valid: false,
                error: `Akses Ditolak: Key "${cleanKey}" HANYA BERLAKU untuk produk "${foundTokoKey.productTitle}". Tidak dapat dipakai di script ini!`,
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Check if frozen
        if (foundTokoKey.frozenUntil) {
          return new Response(
            JSON.stringify({
              success: false,
              valid: false,
              error: `Key sedang dibekukan sementara karena script sedang dalam perbaikan (maintenance). Sisa durasi aman.`,
              frozen: true,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check expired
        if (!foundTokoKey.isLifetime && new Date(foundTokoKey.expired) < now) {
          return new Response(
            JSON.stringify({
              success: false,
              valid: false,
              error: `Key untuk "${foundTokoKey.productTitle}" telah kadaluarsa (expired). Silakan perpanjang di web.`,
              expired: true,
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check HWID quota
        const maxHwid = foundTokoKey.maxHwid || 1;
        const currentHwids: string[] = foundTokoKey.hwids || [];
        if (hwid && !currentHwids.includes(hwid)) {
          if (currentHwids.length >= maxHwid) {
            return new Response(
              JSON.stringify({
                success: false,
                valid: false,
                hwid_limit_reached: true,
                error: `Batas perangkat tercapai (${currentHwids.length}/${maxHwid} HWID). Beli slot HWID tambahan di web.`,
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Register HWID
          currentHwids.push(hwid);
          foundTokoKey.hwids = currentHwids;
          foundTokoKey.robloxUsers = foundTokoKey.robloxUsers || [];
          foundTokoKey.robloxUsers.push({
            hwid,
            username: robloxUsername || "Roblox Player",
            registeredAt: now.toISOString(),
          });

          await supabase
            .from("app_settings")
            .update({ value: JSON.stringify(tokoKeys), updated_at: now.toISOString() })
            .eq("key", "toko_scripts_keys_data");
        }

        return new Response(
          JSON.stringify({
            success: true,
            valid: true,
            key: foundTokoKey.key,
            role: foundTokoKey.role || "Member",
            productTitle: foundTokoKey.productTitle,
            expired: foundTokoKey.expired,
            hwids: foundTokoKey.hwids,
            maxHwid: foundTokoKey.maxHwid,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if it's an ArexansTools key
      if (productId) {
        const { data: axsSetting } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "license_keys")
          .maybeSingle();

        if (axsSetting?.value) {
          try {
            const axsKeys: any[] = JSON.parse(axsSetting.value);
            if (axsKeys.some((k: any) => (k.key || "").toUpperCase() === cleanKey)) {
              return new Response(
                JSON.stringify({
                  success: false,
                  valid: false,
                  error: "Akses Ditolak: Key Arexans Tools TIDAK DAPAT digunakan pada Toko Script! Setiap produk script memerlukan key tersendiri.",
                }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } catch {}
        }
      }
    }

    // 2. CHECK AREXANS TOOLS KEYS (license_keys)
    const { data: settingData, error: settingError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "license_keys")
      .maybeSingle();

    if (settingError || !settingData) {
      return new Response(
        JSON.stringify({ success: false, error: "Key database not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let keys: KeyData[] = [];
    try { keys = JSON.parse(settingData.value); } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid key database format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyIndex = keys.findIndex((k) => k.key === key);
    if (keyIndex === -1) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyData = keys[keyIndex];
    const now = new Date();

    // Check if key is frozen
    if (keyData.frozenUntil) {
      const frozenUntilDate = new Date(keyData.frozenUntil);
      const frozenDiffMs = frozenUntilDate.getTime() - now.getTime();
      
      return new Response(
        JSON.stringify({ 
          success: false, valid: false, error: "Key is frozen", frozen: true,
          key: keyData.key, role: keyData.role, expired: keyData.expired,
          frozenUntil: keyData.frozenUntil,
          frozenRemainingMs: keyData.frozenRemainingMs || frozenDiffMs,
          hwidCount: keyData.hwids?.length || 0, maxHwid: keyData.maxHwid || 1
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    const expiredDate = new Date(keyData.expired);
    if (expiredDate < now) {
      const expiredAgoMs = now.getTime() - expiredDate.getTime();
      const expiredAgoDays = Math.floor(expiredAgoMs / (1000 * 60 * 60 * 24));
      
      return new Response(
        JSON.stringify({ 
          success: false, valid: false, error: "Key has expired", expired: true,
          key: keyData.key, role: keyData.role, expiredAt: keyData.expired,
          expiredAgoMs, expiredAgoText: expiredAgoDays > 0 ? `${expiredAgoDays} days ago` : "Recently",
          hwidCount: keyData.hwids?.length || 0, maxHwid: keyData.maxHwid || 1, frozen: false
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle HWID registration
    let hwidStatus = "not_checked";
    if (hwid) {
      const existingHwids = keyData.hwids || [];
      const maxHwid = keyData.maxHwid || 1;

      if (existingHwids.includes(hwid)) {
        hwidStatus = "registered";
      } else if (existingHwids.length >= maxHwid) {
        return new Response(
          JSON.stringify({ success: false, error: `Maximum devices reached (${maxHwid})`, hwid_limit_reached: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        keyData.hwids = [...existingHwids, hwid];
        if (robloxUsername) {
          keyData.robloxUsers = keyData.robloxUsers || [];
          const existingUser = keyData.robloxUsers.find((u) => u.hwid === hwid);
          if (!existingUser) {
            keyData.robloxUsers.push({ hwid, username: robloxUsername, registeredAt: now.toISOString() });
          }
        }
        hwidStatus = "newly_registered";
        keys[keyIndex] = keyData;
        await supabase
          .from("app_settings")
          .update({ value: JSON.stringify(keys), updated_at: now.toISOString() })
          .eq("key", "license_keys");
      }
    }

    const scriptUrl = `${supabaseUrl}/functions/v1/get-script?name=main`;
    const diffMs = expiredDate.getTime() - now.getTime();
    const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secondsRemaining = Math.floor((diffMs % (1000 * 60)) / 1000);

    return new Response(
      JSON.stringify({
        success: true, valid: true, message: "Key validated successfully",
        key: keyData.key, role: keyData.role, expired: keyData.expired,
        expiredTimestamp: expiredDate.getTime(),
        daysRemaining, hoursRemaining, minutesRemaining, secondsRemaining,
        timeRemainingMs: diffMs,
        timeRemainingText: `${daysRemaining}d ${hoursRemaining}h ${minutesRemaining}m ${secondsRemaining}s`,
        hwid_status: hwidStatus, hwid: hwid || null,
        hwidCount: keyData.hwids?.length || 0, maxHwid: keyData.maxHwid || 1,
        registeredHwids: keyData.hwids || [],
        frozen: false, frozenUntil: null, frozenRemainingMs: null,
        robloxUsers: keyData.robloxUsers || [],
        scriptUrl
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});