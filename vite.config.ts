import dotenv from "dotenv";
dotenv.config();

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { handleRestRequest, handleFunctionsRequest, handleAuthRequest } from "./src/server/cloudsqlRouter.ts";
import { createPool } from "./src/db/index.ts";

function publicRawScriptPlugin() {
  return {
    name: 'public-raw-script-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/supabase-proxy')) {
          req.url = req.url.replace(/^\/supabase-proxy/, '');
        }

        // Handle auth, REST, and Functions API
        if (handleAuthRequest(req, res)) return;
        if (await handleRestRequest(req, res)) return;
        if (await handleFunctionsRequest(req, res)) return;

        const urlStr = req.url || '';
        const pathname = urlStr.split('?')[0] || '';

        // API Endpoint: /api/validate-key and /api/validate-toko-script-key
        if (pathname === '/api/validate-key' || pathname === '/api/validate-toko-script-key') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
          }

          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const key = (body.key || '').trim().toUpperCase();
              const productId = (body.productId || body.productRawId || '').trim();
              const hwid = (body.hwid || '').trim();
              const robloxUsername = (body.robloxUsername || 'Unknown').trim();

              const SUPABASE_URL = 'https://caecqqzbikmwroevvyrd.supabase.co';
              const SUPABASE_KEY = 'sb_publishable_CnZ2j0kBnLgok3J8Tu9WAA_kR31dqWL';

              // Fetch toko script keys
              const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?select=value&key=eq.toko_scripts_keys_data`, {
                headers: { 'apikey': SUPABASE_KEY }
              });
              const data = await resp.json();
              let keys: any[] = [];
              if (data && data[0]?.value) {
                try { keys = JSON.parse(data[0].value); } catch {}
              }

              const foundKey = keys.find((k: any) => (k.key || '').toUpperCase() === key);

              if (foundKey) {
                // STRICT CHECK: KEY HANYA BISA DIPAKAI DI 1 PRODUK YANG DIBELI!
                if (productId) {
                  const target = productId.toLowerCase();
                  const keyProd = (foundKey.productId || '').toLowerCase();
                  const keyRaw = (foundKey.productRawId || '').toLowerCase();
                  if (keyProd !== target && keyRaw !== target) {
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                      success: false,
                      valid: false,
                      error: `Akses Ditolak: Key "${key}" HANYA BERLAKU untuk produk "${foundKey.productTitle}". Tidak dapat dipakai di script ini!`
                    }));
                  }
                }

                if (foundKey.frozenUntil) {
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    success: false,
                    valid: false,
                    frozen: true,
                    error: `Key sedang dibekukan sementara karena script sedang dalam perbaikan (maintenance). Sisa durasi aman.`
                  }));
                }

                if (!foundKey.isLifetime && new Date(foundKey.expired) < new Date()) {
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    success: false,
                    valid: false,
                    expired: true,
                    error: `Key untuk "${foundKey.productTitle}" telah kadaluarsa (expired).`
                  }));
                }

                const maxHwid = foundKey.maxHwid || 1;
                const hwids = foundKey.hwids || [];
                if (hwid && !hwids.includes(hwid)) {
                  if (hwids.length >= maxHwid) {
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                      success: false,
                      valid: false,
                      hwid_limit_reached: true,
                      error: `Batas perangkat tercapai (${hwids.length}/${maxHwid} HWID). Beli slot HWID tambahan di web.`
                    }));
                  }
                  // Register HWID
                  hwids.push(hwid);
                  foundKey.hwids = hwids;
                  foundKey.robloxUsers = foundKey.robloxUsers || [];
                  foundKey.robloxUsers.push({ hwid, username: robloxUsername, registeredAt: new Date().toISOString() });
                  
                  await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.toko_scripts_keys_data`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: JSON.stringify(keys), updated_at: new Date().toISOString() })
                  });
                }

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  valid: true,
                  role: foundKey.role || 'Member',
                  productTitle: foundKey.productTitle
                }));
              }

              // Check if this is an ArexansTools key
              const axsResp = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?select=value&key=eq.license_keys`, {
                headers: { 'apikey': SUPABASE_KEY }
              });
              const axsData = await axsResp.json();
              let axsKeys: any[] = [];
              if (axsData && axsData[0]?.value) {
                try { axsKeys = JSON.parse(axsData[0].value); } catch {}
              }
              const isAxsKey = axsKeys.some((k: any) => (k.key || '').toUpperCase() === key);

              if (productId && isAxsKey) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  valid: false,
                  error: 'Akses Ditolak: Key Arexans Tools TIDAK DAPAT digunakan pada Toko Script! Setiap produk script memerlukan key tersendiri.'
                }));
              }

              // Fallback to proxying to supabase validate-key function
              const fwd = await fetch(`${SUPABASE_URL}/functions/v1/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
                body: bodyStr
              });
              const fwdText = await fwd.text();
              res.setHeader('Content-Type', 'application/json');
              return res.end(fwdText);
            } catch (e: any) {
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, valid: false, error: e.message }));
            }
          });
          return;
        }

        const match = pathname.match(/^\/api\/public\/raw\/([a-zA-Z0-9_\-\.]+)/);
        if (!match) return next();

        const scriptId = match[1];
        const searchParams = new URL(urlStr, 'http://localhost').searchParams;
        const queryKey = (searchParams.get('key') || '').trim();
        const host = req.headers.host || 'localhost:3000';
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const apiOrigin = `${proto}://${host}`;

        try {
          const pool = createPool();
          const q = await pool.query("SELECT value FROM app_settings WHERE key = 'toko_scripts_catalog' LIMIT 1");
          let foundScript: any = null;

          if (q.rows.length > 0 && q.rows[0]?.value) {
            try {
              const catalog = JSON.parse(q.rows[0].value);
              foundScript = catalog.find((p: any) => p.id === scriptId || (p.rawId && p.rawId.toLowerCase() === scriptId.toLowerCase()));
            } catch {}
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
-- Key System, HWID & Anti-Dumper Layer (Default 1 HWID Slot)

-- ============================================================
-- [[ AXSTOOLS ANTI-DUMP & SECURITY INTEGRITY ]]
-- ============================================================
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
    pcall(function()
        LocalPlayer = Players.PlayerAdded:Wait()
    end)
    if not LocalPlayer then
        LocalPlayer = Players:GetPlayers()[1]
    end
end

-- Fungsi Kick Otomatis Jika Terdeteksi Dumper
local function kickDumper(reason)
    local kickMsg = "\\n\\n[AXSTOOLS ANTI-DUMP SECURITY]\\n" .. tostring(reason or "Percobaan dumper script terdeteksi!") .. "\\nAkses Anda langsung diblokir."
    pcall(function()
        if LocalPlayer and LocalPlayer.Kick then
            LocalPlayer:Kick(kickMsg)
        end
    end)
    while true do
        task.wait(9e9)
    end
end

-- 1. Scan Dumper & HTTP Spy Tool Aktif
local function scanForDumpers()
    if getgenv then
        local env = getgenv()
        if env.SimpleSpyExecuted or env.Hydroxide or env.TurtleSpy or env.HttpSpy or env.DexDumper or env.ScriptDumper or env.OwlHubDumper then
            kickDumper("Dumper / HTTP Spy tool terdeteksi aktif di background!")
            return false
        end
    end
    return true
end

if not scanForDumpers() then return end

-- 2. Anti-Decompile / Memory Inspection Traps
pcall(function()
    if debug and type(debug.getinfo) == "function" then
        local ok, info = pcall(debug.getinfo, 1)
        if not ok or not info then
            kickDumper("Tampering debug environment terdeteksi!")
        end
    end
end)

-- 3. Background Continuous Scanner
task.spawn(function()
    while task.wait(3) do
        if getgenv then
            local env = getgenv()
            if env.SimpleSpyExecuted or env.Hydroxide or env.TurtleSpy or env.HttpSpy or env.DexDumper or env.ScriptDumper or env.OwlHubDumper then
                kickDumper("Dumper / HTTP Spy dijalankan saat script sedang aktif!")
                break
            end
        end
    end
end)

-- ============================================================
-- [[ KEY SYSTEM & HWID VERIFICATION ]]
-- ============================================================
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

local VALIDATE_URL = "${apiOrigin}/api/validate-key"
local payload = HttpService:JSONEncode({
    key = KEY,
    productId = "${scriptId}",
    productTitle = "${title.replace(/"/g, '\\"')}",
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

          // Fallback to Cloud SQL lua_scripts table
          const scriptQ = await pool.query('SELECT content FROM lua_scripts WHERE name = $1 LIMIT 1', [scriptId]);
          if (scriptQ.rows.length > 0 && scriptQ.rows[0].content) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(scriptQ.rows[0].content);
            return;
          }

          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`warn("[Axstools] Script '${scriptId}' tidak ditemukan.")`);
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
    strictPort: true,
    hmr: false,
    proxy: {
      '/casaku-proxy': {
        target: 'https://api.casaku.id',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/casaku-proxy/, ''),
      },
      '/xmpayment-proxy': {
        target: 'https://xmpayment.my.id',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/xmpayment-proxy/, ''),
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
  plugins: [react(), publicRawScriptPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
