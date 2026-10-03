import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settingData } = await supabase
      .from("app_settings").select("value").eq("key", "license_keys").single();

    const { data: manualData } = await supabase
      .from("app_settings").select("value").eq("key", "manual_whitelist").single();

    const now = new Date();
    const whitelistedUsers: { username: string; role: string; key: string; expiredAt: string; source: string }[] = [];
    const usernameSet = new Set<string>();

    if (manualData?.value) {
      try {
        const manualUsers = JSON.parse(manualData.value);
        if (Array.isArray(manualUsers)) {
          for (const user of manualUsers) {
            if (user.username && !usernameSet.has(user.username.toLowerCase())) {
              usernameSet.add(user.username.toLowerCase());
              whitelistedUsers.push({ username: user.username, role: "Manual", key: "manual", expiredAt: "never", source: "manual" });
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (settingData?.value) {
      try {
        const keys = JSON.parse(settingData.value);
        for (const keyData of keys) {
          const expiredDate = new Date(keyData.expired);
          if (expiredDate < now) continue;
          if (keyData.frozenUntil) continue;
          if (keyData.robloxUsers && Array.isArray(keyData.robloxUsers)) {
            for (const user of keyData.robloxUsers) {
              if (user.username && !usernameSet.has(user.username.toLowerCase())) {
                usernameSet.add(user.username.toLowerCase());
                whitelistedUsers.push({ username: user.username, role: keyData.role, key: keyData.key.slice(0, 8) + "...", expiredAt: keyData.expired, source: "key" });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (format === "lua") {
      const luaTable = whitelistedUsers.map(u => `"${u.username}"`).join(", ");
      return new Response(`-- Whitelist: ${whitelistedUsers.length} users\nreturn {${luaTable}}`, {
        status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    if (format === "raw") {
      return new Response(whitelistedUsers.map(u => u.username).join("\n"), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: whitelistedUsers.length, users: whitelistedUsers, usernames: whitelistedUsers.map(u => u.username), generatedAt: now.toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});