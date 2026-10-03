import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { generateProtectedLuaWrapper, TokoScriptProduct } from '@/types/tokoScript';

export const PublicRawScript: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';
  const [content, setContent] = useState<string>('-- Loading script...');

  useEffect(() => {
    const fetchScript = async () => {
      if (!id) {
        setContent('warn("[Axstools] Script ID missing")');
        return;
      }

      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'toko_scripts_catalog')
          .maybeSingle();

        if (data?.value) {
          const catalog: TokoScriptProduct[] = JSON.parse(data.value);
          const found = catalog.find(
            (p) => p.id === id || (p.rawId && p.rawId.toLowerCase() === id.toLowerCase())
          );

          if (found && found.luaScript) {
            if (found.isMaintenance) {
              const notice = found.maintenanceNotice || 'Script sedang maintenance.';
              setContent(`warn("[Axstools] SCRIPT MAINTENANCE: ${notice}")\npcall(function() game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Axstools Maintenance", Text = "${notice.replace(/"/g, "'")}", Duration = 10 }) end)`);
              return;
            }

            const apiOrigin = window.location.origin;
            // Generate full protected wrapper with Key & HWID checking
            const wrapper = `-- [[ AXSTOOLS PROTECTED RUNTIME ]]
-- Title: ${found.title} (ID: ${id})
-- Key System & HWID Protection Layer (Default 1 HWID Slot)

local KEY = _G.Axstools
if not KEY or KEY == "" then
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
    local ok, hid = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    if ok and hid and tostring(hid) ~= "" then return tostring(hid) end
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
    productId = "${id}",
    productTitle = "${found.title.replace(/"/g, '\\"')}",
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

print("[Axstools] Key & HWID Valid! Menjalankan ${found.title}...")
pcall(function()
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Axstools Verified",
        Text = "${found.title} aktif. Selamat bermain!",
        Duration = 4
    })
end)

-- [[ SCRIPT LANGSUNG JALAN DARI DEVELOPER ]]
${found.luaScript}`;

            setContent(wrapper);
            return;
          }
        }

        // Fallback to supabase edge function get-script
        const resp = await fetch(`https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/get-script?name=${id}&raw=1&public=1`);
        const text = await resp.text();
        setContent(text);
      } catch (err: any) {
        setContent(`warn("[Axstools] Error: ${err.message}")`);
      }
    };

    fetchScript();
  }, [id, key]);

  return (
    <pre style={{ margin: 0, padding: '16px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#000', color: '#fff', minHeight: '100vh' }}>
      {content}
    </pre>
  );
};

export default PublicRawScript;
