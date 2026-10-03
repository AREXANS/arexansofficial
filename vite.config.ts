import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function publicRawScriptPlugin() {
  return {
    name: 'public-raw-script-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlStr = req.url || '';
        const pathname = urlStr.split('?')[0] || '';
        const match = pathname.match(/^\/api\/public\/raw\/([a-zA-Z0-9_\-\.]+)/);
        if (!match) return next();

        const scriptId = match[1];
        const searchParams = new URL(urlStr, 'http://localhost').searchParams;
        const queryKey = (searchParams.get('key') || '').trim();
        const host = req.headers.host || 'localhost:3000';
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const apiOrigin = `${proto}://${host}`;

        try {
          const supabaseUrl = 'https://caecqqzbikmwroevvyrd.supabase.co';
          const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZWNxcXpiaWttd3JvZXZ2eXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0Mjk5MzQsImV4cCI6MjEwMDAwNTkzNH0.B0lrXEa8TUc82yW6rGb024TUTyqYI3gMTuE2QU2XDQc';

          const resp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.toko_scripts_catalog`, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          });
          const data = await resp.json();
          let foundScript: any = null;

          if (data && data[0]?.value) {
            const catalog = JSON.parse(data[0].value);
            foundScript = catalog.find((p: any) => p.id === scriptId || (p.rawId && p.rawId.toLowerCase() === scriptId.toLowerCase()));
          }

          if (foundScript && foundScript.luaScript) {
            if (foundScript.isMaintenance) {
              const notice = foundScript.maintenanceNotice || 'Script sedang maintenance. Key Anda dibekukan sementara agar tidak rugi.';
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(`warn("[Axstools] SCRIPT MAINTENANCE: ${notice}")\npcall(function() game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Axstools Maintenance", Text = "${notice.replace(/"/g, "'")}", Duration = 10 }) end)`);
              return;
            }

            const rawScript = foundScript.luaScript;
            const title = foundScript.title || 'Toko Script';
            const apiBase = `${apiOrigin}/supabase-proxy/functions/v1`;

            const wrappedScript = `-- [[ AXSTOOLS PROTECTED RUNTIME ]]
-- Title: ${title} (ID: ${scriptId})
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
        warn("[Axstools] Beli penambahan +1 slot HWID permanen di portal Key System:")
        warn("${apiOrigin}/key-system")
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

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(wrappedScript);
            return;
          }

          // Fallback to supabase function get-script
          const fallbackResp = await fetch(`${supabaseUrl}/functions/v1/get-script?name=${scriptId}&raw=1&public=1`);
          const fallbackText = await fallbackResp.text();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(fallbackText);
        } catch (err: any) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`warn("[Axstools] Error fetching script: ${err.message}")`);
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/supabase-proxy': {
        target: 'https://caecqqzbikmwroevvyrd.supabase.co',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/supabase-proxy/, ''),
      },
      '/casaku-proxy': {
        target: 'https://api.casaku.id',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/casaku-proxy/, ''),
      },
      '/pakasir-proxy': {
        target: 'https://app.pakasir.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/pakasir-proxy/, ''),
      },
      '/catbox-upload': {
        target: 'https://catbox.moe',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/catbox-upload/, ''),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), publicRawScriptPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
