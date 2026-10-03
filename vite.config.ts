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

        // API Endpoint: /loader (for Roblox executors calling loadstring(game:HttpGet(".../loader"))())
        if (pathname === '/loader') {
          const userAgent = (req.headers['user-agent'] || '').toLowerCase();
          const isRoblox = userAgent.includes('roblox') || userAgent.includes('executor') || userAgent.includes('httpclient') || !req.headers.accept?.includes('text/html');
          
          if (isRoblox) {
            try {
              const supabaseUrl = 'https://caecqqzbikmwroevvyrd.supabase.co';
              const supabaseKey = 'sb_publishable_CnZ2j0kBnLgok3J8Tu9WAA_kR31dqWL';
              const fwd = await fetch(`${supabaseUrl}/functions/v1/get-loader?name=keysystem`, {
                headers: { 'apikey': supabaseKey }
              });
              const text = await fwd.text();
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              return res.end(text);
            } catch (err: any) {
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              return res.end(`warn("[Axstools] Error loading loader: ${err.message}")`);
            }
          }
        }

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
              const urlObj = new URL(urlStr, 'http://localhost');
              let body: any = {};
              try { body = JSON.parse(bodyStr || '{}'); } catch {}

              const key = (body.key || urlObj.searchParams.get('key') || '').trim().toUpperCase();
              const productId = (body.productId || body.productRawId || urlObj.searchParams.get('productId') || urlObj.searchParams.get('productRawId') || '').trim();
              const hwid = (body.hwid || urlObj.searchParams.get('hwid') || '').trim();
              const robloxUsername = (body.robloxUsername || urlObj.searchParams.get('robloxUsername') || 'Unknown').trim();

              // Special bypass for developer testing
              if (key === 'DEV_TEST_KEY') {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  valid: true,
                  role: 'Developer',
                  productTitle: 'Developer Testing'
                }));
              }

              const supabaseUrl = 'https://caecqqzbikmwroevvyrd.supabase.co';
              const supabaseKey = 'sb_publishable_CnZ2j0kBnLgok3J8Tu9WAA_kR31dqWL';

              // Fetch toko script keys & catalog
              const [respKeys, respCatalog] = await Promise.all([
                fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.toko_scripts_keys_data`, {
                  headers: { 'apikey': supabaseKey }
                }),
                fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.toko_scripts_catalog`, {
                  headers: { 'apikey': supabaseKey }
                })
              ]);

              const dataKeys = await respKeys.json();
              const dataCatalog = await respCatalog.json();

              let keys: any[] = [];
              let catalog: any[] = [];
              if (dataKeys && dataKeys[0]?.value) {
                try { keys = JSON.parse(dataKeys[0].value); } catch {}
              }
              if (dataCatalog && dataCatalog[0]?.value) {
                try { catalog = JSON.parse(dataCatalog[0].value); } catch {}
              }

              const foundKey = keys.find((k: any) => (k.key || '').toUpperCase() === key);

              if (foundKey) {
                // STRICT CHECK: KEY HANYA BISA DIPAKAI DI 1 PRODUK YANG DIBELI!
                if (productId) {
                  const target = productId.toLowerCase();
                  const keyProd = (foundKey.productId || '').toLowerCase();
                  const keyRaw = (foundKey.productRawId || '').toLowerCase();
                  
                  const catalogItem = catalog.find((c: any) => 
                    (c.id && c.id.toLowerCase() === target) || 
                    (c.rawId && c.rawId.toLowerCase() === target)
                  );
                  const isMatch = (
                    keyProd === target ||
                    keyRaw === target ||
                    (catalogItem && (
                      (catalogItem.id && catalogItem.id.toLowerCase() === keyProd) ||
                      (catalogItem.rawId && catalogItem.rawId.toLowerCase() === keyRaw)
                    ))
                  );

                  if (!isMatch) {
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
                  
                  await fetch(`${supabaseUrl}/rest/v1/app_settings?key=eq.toko_scripts_keys_data`, {
                    method: 'PATCH',
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
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
              const axsResp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.license_keys`, {
                headers: { 'apikey': supabaseKey }
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
              const fwd = await fetch(`${supabaseUrl}/functions/v1/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
                body: bodyStr || JSON.stringify({ key, productId, hwid, robloxUsername })
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
        const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
        const proto = isLocal ? (req.headers['x-forwarded-proto'] || 'http') : 'https';
        const apiOrigin = `${proto}://${host}`;

        try {
          const supabaseUrl = 'https://caecqqzbikmwroevvyrd.supabase.co';
          const supabaseKey = 'sb_publishable_CnZ2j0kBnLgok3J8Tu9WAA_kR31dqWL';

          const resp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.toko_scripts_catalog`, {
            headers: {
              'apikey': supabaseKey
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
              const notice = (foundScript.maintenanceNotice || 'Script sedang maintenance. Key Anda dibekukan sementara agar tidak rugi.').replace(/"/g, "'");
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(`warn("[Axstools] SCRIPT MAINTENANCE: ${notice}")\npcall(function() game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Axstools Maintenance", Text = "${notice}", Duration = 10 }) end)`);
              return;
            }

            const rawScript = foundScript.luaScript;
            const title = (foundScript.title || 'Toko Script').replace(/"/g, '\\"');
            const targetId = (foundScript.rawId && foundScript.rawId.trim()) ? foundScript.rawId.trim() : foundScript.id;

            const wrappedScript = `-- [[ AXSTOOLS PROTECTED RUNTIME ]]
-- Title: ${title} (ID: ${targetId})
-- Key System & HWID Protection Layer (Default 1 HWID Slot)

local KEY = _G.Axstools or _G.AxstoolsKey or _G.Key or _G.LicenseKey
if (not KEY or KEY == "" or KEY == "keysystem") and "${queryKey}" ~= "" and "${queryKey}" ~= "keysystem" then
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
if not LocalPlayer then
    pcall(function()
        LocalPlayer = Players:GetPropertyChangedSignal("LocalPlayer"):Wait() or Players.LocalPlayer
    end)
end

local function getHwid()
    local hwid = nil
    pcall(function()
        if type(gethwid) == "function" then
            hwid = gethwid()
        elseif type(get_hwid) == "function" then
            hwid = get_hwid()
        elseif type(getexecutorhwid) == "function" then
            hwid = getexecutorhwid()
        end
    end)
    if hwid and tostring(hwid) ~= "" then return tostring(hwid) end

    local ok, id = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    if ok and id and tostring(id) ~= "" then return tostring(id) end
    return LocalPlayer and tostring(LocalPlayer.UserId) or "FALLBACK_HWID"
end

local HWID = getHwid()
local USERNAME = LocalPlayer and LocalPlayer.Name or "Unknown"

local function httpRequest(opts)
    local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
    local compatOpts = {
        Url = opts.Url or opts.url,
        url = opts.Url or opts.url,
        Method = opts.Method or opts.method or "GET",
        method = opts.Method or opts.method or "GET",
        Headers = opts.Headers or opts.headers or { ["Content-Type"] = "application/json" },
        headers = opts.Headers or opts.headers or { ["Content-Type"] = "application/json" },
        Body = opts.Body or opts.body,
        body = opts.Body or opts.body
    }
    if req then
        local ok, res = pcall(req, compatOpts)
        if ok and res then
            local rBody = res.Body or res.body or res.data or ""
            local rStatus = res.StatusCode or res.status_code or res.Status or res.statusCode or 200
            return { StatusCode = rStatus, Body = tostring(rBody), Success = true }
        end
    end

    local getUrl = opts.Url or opts.url
    if opts.QueryStr and opts.QueryStr ~= "" then
        getUrl = getUrl .. (string.find(getUrl, "?") and "&" or "?") .. opts.QueryStr
    end
    local ok, body = pcall(function() return game:HttpGet(getUrl) end)
    if ok and body then
        return { StatusCode = 200, Body = tostring(body), Success = true }
    end
    return nil
end

local VALIDATE_URL = "${apiOrigin}/api/validate-key"
local queryParams = "key=" .. HttpService:UrlEncode(tostring(KEY)) .. "&productId=" .. HttpService:UrlEncode("${targetId}") .. "&hwid=" .. HttpService:UrlEncode(tostring(HWID)) .. "&robloxUsername=" .. HttpService:UrlEncode(tostring(USERNAME))
local payload = HttpService:JSONEncode({
    key = tostring(KEY),
    productId = "${targetId}",
    productTitle = "${title}",
    hwid = tostring(HWID),
    robloxUsername = tostring(USERNAME)
})

local res = httpRequest({
    Url = VALIDATE_URL,
    Method = "POST",
    Headers = {
        ["Content-Type"] = "application/json"
    },
    Body = payload,
    QueryStr = queryParams
})

local isValid = false
local errorMsg = "Gagal menghubungi server verifikasi Axstools."
local hwidLimitReached = false
local isFrozen = false

if res and res.Body and res.Body ~= "" then
    local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if ok and type(data) == "table" then
        if data.valid or data.success then
            isValid = true
        else
            errorMsg = data.error or data.message or "Key tidak valid"
            if data.hwid_limit_reached or data.hwidLimitReached or (data.error and (string.find(string.lower(data.error), "batas perangkat") or string.find(string.lower(data.error), "maximum devices"))) then
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
${rawScript}
`;

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
    hmr: false,
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
