import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isBot, botResponse } from "../_shared/antisteal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const noCacheHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Accept, User-Agent, Sec-Fetch-Mode, Sec-Fetch-Dest, Sec-CH-UA, Upgrade-Insecure-Requests, X-Requested-With",
};

function isExecutorRequest(req: Request): boolean {
  const userAgent = (req.headers.get("user-agent") || "").toLowerCase();
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchDest = req.headers.get("sec-fetch-dest");
  const xRequestedWith = (req.headers.get("x-requested-with") || "").toLowerCase();

  const executorUaPattern = /(roblox|wininet|synapse|fluxus|krnl|script-ware|delta|lua|executor|httpclient|curl|okhttp)/;
  const looksLikeApiClient = !secFetchMode && !secFetchDest && !accept.includes("text/html");

  return executorUaPattern.test(userAgent) || xRequestedWith === "roblox" || looksLikeApiClient;
}

function isBrowser(req: Request): boolean {
  if (isExecutorRequest(req)) return false;

  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchDest = req.headers.get("sec-fetch-dest");
  const secChUa = req.headers.get("sec-ch-ua");
  const upgrade = req.headers.get("upgrade-insecure-requests");
  const accept = (req.headers.get("accept") || "").toLowerCase();

  const isNavigation = secFetchMode === "navigate" || secFetchDest === "document";
  const hasBrowserHints = Boolean(secFetchMode || secFetchDest || secChUa || upgrade);
  const acceptsHtml = accept.includes("text/html");

  return isNavigation || hasBrowserHints || acceptsHtml;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, ...noCacheHeaders } });
  }

  try {
    const url = new URL(req.url);
    const scriptName = url.searchParams.get("name");
    const rawParam = (url.searchParams.get("raw") || "").toLowerCase();
    const forceRaw = rawParam === "1" || rawParam === "true";
    const payloadParam = (url.searchParams.get("payload") || "").toLowerCase();
    const wantPayload = payloadParam === "1" || payloadParam === "true";
    const slotParam = (url.searchParams.get("slot") || "primary").toLowerCase();
    const useBackup = slotParam === "backup";

    if (!scriptName) {
      return new Response("-- Access Denied: Invalid request", {
        status: 403,
        headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (!forceRaw && !wantPayload && isBrowser(req)) {
      const deniedUrl = `https://tools.arexans.my.id/access-denied?name=${encodeURIComponent(scriptName)}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          ...noCacheHeaders,
          Location: deniedUrl,
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (isBot(req)) {
      const br = await botResponse(supabase, { ...corsHeaders, ...noCacheHeaders });
      if (br) return br;
    }

    let script: any = null;
    const { data: dbScript } = await supabase
      .from("lua_scripts")
      .select("content, backup_content, raw_content, is_active")
      .eq("name", scriptName)
      .eq("is_active", true)
      .maybeSingle();

    if (dbScript) {
      script = dbScript;
    } else {
      // Check in toko_scripts_catalog
      const { data: catalogData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "toko_scripts_catalog")
        .maybeSingle();

      if (catalogData?.value) {
        try {
          const catalog = JSON.parse(catalogData.value);
          const found = catalog.find((p: any) => p.id === scriptName || (p.rawId && p.rawId.toLowerCase() === scriptName.toLowerCase()));
          if (found && found.luaScript) {
            // Check maintenance
            if (found.isMaintenance) {
              const notice = found.maintenanceNotice || "Script sedang dalam perbaikan (maintenance). Sisa durasi key dibekukan sementara agar tidak rugi.";
              const maintLua = `warn("[Axstools] SCRIPT MAINTENANCE: ${notice}")
pcall(function()
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Axstools Maintenance",
        Text = "${notice.replaceAll('"', "'")}",
        Duration = 10
    })
end)`;
              return new Response(maintLua, {
                status: 200,
                headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
              });
            }

            const rawScript = found.luaScript;
            const title = found.title || "Toko Script";
            const apiBase = `${supabaseUrl}/functions/v1`;

            const queryKey = (url.searchParams.get("key") || "").trim();
            const wrappedScript = `-- [[ AXSTOOLS PROTECTED RUNTIME ]]
-- Title: ${title} (ID: ${scriptName})
-- Key System & HWID Protection Layer (Default 1 HWID Slot)

local KEY = _G.Axstools
if (not KEY or KEY == "" or KEY == "keysystem") and "${queryKey}" ~= "" then
    KEY = "${queryKey}"
end

if not KEY or KEY == "" or KEY == "keysystem" then
    warn("[Axstools] ERROR: _G.Axstools belum didefinisikan! Harap pasang key Anda:")
    warn('_G.Axstools = "KEY_ANDA"')
    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", {
            Title = "Axstools Key Missing",
            Text = "Silakan pasang: _G.Axstools = 'KEY_ANDA'",
            Duration = 8
        })
    end)
    return
end

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

local function getHwid()
    local ok, id = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    if ok and id and tostring(id) ~= "" then return tostring(id) end
    return LocalPlayer and tostring(LocalPlayer.UserId) or "FALLBACK_HWID"
end

local HWID = getHwid()
local USERNAME = LocalPlayer and LocalPlayer.Name or "Unknown"

local function httpRequest(opts)
    local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
    if req then
        local ok, res = pcall(req, opts)
        if ok and res then return res end
    end
    local ok, body = pcall(function() return game:HttpGet(opts.Url) end)
    if ok and body then return { StatusCode = 200, Body = body } end
    return nil
end

local VALIDATE_URL = "${apiBase}/validate-key"
local payload = HttpService:JSONEncode({
    key = KEY,
    hwid = HWID,
    robloxUsername = USERNAME
})

local res = httpRequest({
    Url = VALIDATE_URL,
    Method = "POST",
    Headers = {
        ["Content-Type"] = "application/json"
    },
    Body = payload
})

local isValid = false
local errorMsg = "Gagal menghubungi server verifikasi Axstools."
local hwidLimitReached = false
local isFrozen = false

if res and res.Body then
    local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if ok and type(data) == "table" then
        if data.valid or data.success then
            isValid = true
        else
            errorMsg = data.error or data.message or "Key tidak valid"
            if data.hwid_limit_reached or (data.error and string.find(string.lower(data.error), "maximum devices")) then
                hwidLimitReached = true
            end
            if data.frozen then
                isFrozen = true
            end
        end
    end
end

if not isValid then
    if hwidLimitReached then
        warn("[Axstools] HWID LIMIT REACHED! Kuota perangkat untuk key ini penuh (Default 1 HWID).")
        warn("[Axstools] Beli penambahan +1 slot HWID permanen di portal Key System.")
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools HWID Penuh!",
                Text = "Batas 1 HWID tercapai. Beli +1 slot HWID permanen di portal web!",
                Duration = 10
            })
        end)
    elseif isFrozen then
        warn("[Axstools] SCRIPT MAINTENANCE: Key Anda sedang dibekukan sementara agar sisa masa aktif tidak rugi.")
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools Maintenance",
                Text = "Script sedang maintenance. Key Anda dibekukan sementara (Anti-Rugi).",
                Duration = 10
            })
        end)
    else
        warn("[Axstools] VALIDASI GAGAL: " .. tostring(errorMsg))
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools Akses Ditolak",
                Text = tostring(errorMsg),
                Duration = 8
            })
        end)
    end
    return
end

print("[Axstools] Key & HWID Valid! Menjalankan ${title}...")
pcall(function()
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Axstools Verified",
        Text = "${title} aktif. Selamat bermain!",
        Duration = 4
    })
end)

-- [[ SCRIPT LANGSUNG JALAN DARI DEVELOPER ]]
${rawScript}`;

            return new Response(wrappedScript, {
              status: 200,
              headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
            });
          }
        } catch (e) {
          console.error("Catalog parse error:", e);
        }
      }
    }

    if (!script) {
      return new Response('warn("[Axstools] Script not available or no code installed")', {
        status: 200,
        headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const activeContent = useBackup
      ? ((script as any).backup_content || script.content || "")
      : (script.content || "");

    if (wantPayload) {
      let payload: string | null = useBackup ? null : ((script as any).raw_content ?? null);
      if (!payload) {
        const marker = "-- USER SCRIPT (PROTECTED)";
        const idx = activeContent.indexOf(marker);
        if (idx !== -1) {
          const after = activeContent.substring(idx + marker.length);
          const nl = after.indexOf("\n");
          payload = nl !== -1 ? after.substring(nl + 1) : after;
        } else {
          payload = activeContent;
        }
      }
      return new Response(payload, {
        status: 200,
        headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(activeContent, {
      status: 200,
      headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(`warn("[Arexans] Error: ${msg.replaceAll('"', "'")}")`, {
      status: 200,
      headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
