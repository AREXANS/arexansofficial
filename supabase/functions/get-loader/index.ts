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

function obfuscateString(str: string): string {
  const bytes = Array.from(new TextEncoder().encode(str));
  return `(function() local b={${bytes.join(",")}} local s="" for _,v in ipairs(b) do s=s..string.char(v) end return s end)()`;
}

function randVar(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "_";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

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
    const slotParam = (url.searchParams.get("slot") || "primary").toLowerCase();
    const useBackup = slotParam === "backup";

    if (!forceRaw && isBrowser(req)) {
      const deniedUrl = `https://tools.arexans.my.id/access-denied?name=${encodeURIComponent(scriptName || "unknown")}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          ...noCacheHeaders,
          Location: deniedUrl,
        },
      });
    }

    if (!scriptName) {
      return new Response("-- Access Denied", {
        status: 403,
        headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (isBot(req)) {
      const br = await botResponse(supabase, { ...corsHeaders, ...noCacheHeaders });
      if (br) return br;
    }

    const { data: script, error } = await supabase
      .from("lua_scripts")
      .select("name, content, backup_content, raw_content, script_type, is_active")
      .eq("name", scriptName)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !script) {
      return new Response("-- [Arexans] Script not available.", {
        status: 403,
        headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const activeContent = useBackup
      ? ((script as any).backup_content || script.content || "")
      : (script.content || "");

    const isUploaded = script.script_type === "uploaded" || script.name.startsWith("uploaded_");
    // Large scripts: never inline (byte-table obfuscation exhausts worker memory)
    const fetchRemote = isUploaded || activeContent.length > 60000;

    let loaderScript: string;
    if (fetchRemote) {
      const scriptUrl = `${supabaseUrl}/functions/v1/get-script?name=${encodeURIComponent(script.name)}&raw=1${useBackup ? "&slot=backup" : ""}`;
      loaderScript =
        `-- Arexans Uploaded Loader v4.4 [${useBackup ? "BACKUP" : "PRIMARY"}]\n` +
        `do\n` +
        `  local url=${obfuscateString(scriptUrl)}\n` +
        `  local src\n` +
        `  local ok,err=pcall(function() src=game:HttpGet(url) end)\n` +
        `  if not ok or type(src)~="string" or src=="" then warn("[Arexans] Failed to fetch protected script: "..tostring(err)); return end\n` +
        `  local loader=loadstring or load\n` +
        `  if type(loader)~="function" then warn("[Arexans] Executor missing loadstring/load"); return end\n` +
        `  local fn,compileErr=loader(src)\n` +
        `  if type(fn)~="function" then warn("[Arexans] Compile error: "..tostring(compileErr)); return end\n` +
        `  local ran,result=pcall(fn)\n` +
        `  if not ran then warn("[Arexans] Runtime error: "..tostring(result)); return end\n` +
        `  if type(result)=="function" then local ok2,err2=pcall(result); if not ok2 then warn("[Arexans] Returned function error: "..tostring(err2)) end end\n` +
        `end\n`;
    } else {
      const obfuscatedContent = obfuscateString(activeContent);
      const vS = randVar();
      const vExec = randVar();
      const vErr = randVar();
      const vLoad = randVar();

      loaderScript =
        `-- Arexans Loader v4.4 [${useBackup ? "BACKUP" : "PRIMARY"}]\n` +
        `do\n` +
        `  local ${vLoad}=loadstring or load\n` +
        `  if type(${vLoad})~="function" then warn("[Arexans] Executor missing loadstring/load"); return end\n` +
        `  local ${vS}=${obfuscatedContent}\n` +
        `  local ${vExec},${vErr}=pcall(function()\n` +
        `    local fn,err=${vLoad}(${vS})\n` +
        `    if type(fn)~="function" then error(err) end\n` +
        `    local result=fn()\n` +
        `    if type(result)=="function" then return result() end\n` +
        `  end)\n` +
        `  if not ${vExec} then warn("[Arexans] Runtime error: "..tostring(${vErr})) end\n` +
        `end\n`;
    }

    return new Response(loaderScript, {
      status: 200,
      headers: {
        ...corsHeaders,
        ...noCacheHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response("-- [Arexans] Access Denied", {
      status: 500,
      headers: { ...corsHeaders, ...noCacheHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
