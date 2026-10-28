import SafeEditor from '@/components/SafeEditor';
import { FC, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { enqueue, readFileWithProgress, writeLuaScript, idle } from '@/lib/uploadQueue';
import {
  Upload, Trash2, RefreshCw, FileCode, Copy, ExternalLink, Shield,
  History as HistoryIcon, Undo2, Redo2, RotateCcw, Download, Replace, Pencil, Save,
  Key, Calendar, Clock, Plus, Check, Sparkles, AlertCircle
} from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import LoadstringDurationDialog, { LoadstringDialogConfig } from '@/components/LoadstringDurationDialog';

export interface ScriptCustomKey {
  id: string;
  key: string;
  label?: string;
  role?: string;
  expired?: string | null; // ISO date string, or 'permanent' / null
  createdAt: string;
}

interface UploadedScript {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  content: string;
  script_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ScriptVersion {
  id: string;
  script_id: string;
  version_number: number;
  content: string;
  display_name: string | null;
  created_at: string;
}

/**
 * Protection wrapper: integrasi key system + whitelist + session cache.
 * Saat dieksekusi:
 *   1) Cek ArexansTools/ArexansTools_Session.json → kalau ada key valid, jalan langsung.
 *   2) Cek whitelist username (manual + license robloxUsers) di server.
 *   3) Kalau tidak whitelist, prompt input AXS key → simpan ke session file.
 *   4) Kalau key invalid → fake script.
 */
const PROTECTION_WRAPPER = (
  apiBase: string,
  scriptName: string,
  _userScript: string,
  customKeys: ScriptCustomKey[] = []
) => {
  const customKeysLuaTable = customKeys
    .map((k) => {
      let epoch = 0;
      if (k.expired && k.expired !== 'permanent') {
        const t = new Date(k.expired).getTime();
        if (!isNaN(t)) epoch = Math.floor(t / 1000);
      }
      const roleEsc = (k.role || 'Special Key').replace(/"/g, '\\"');
      const labelEsc = (k.label || '').replace(/"/g, '\\"');
      const keyEsc = k.key.trim().replace(/"/g, '\\"');
      return `    ["${keyEsc}"] = { role = "${roleEsc}", expired = ${epoch}, label = "${labelEsc}" },`;
    })
    .join('\n');

  return `--[[
============================================================
 ArexansTools — Auto-Protected Bootstrap (v3)
 - Session cache (file-presence only, no extra network round-trip)
 - Key Khusus Script (Per-Script Dedicated Key) + Global License Keys
 - Whitelist check
 - Floating Key System UI (cyan-blue style)
 - Payload streamed terpisah supaya script besar tetap aman
============================================================
]]
local HttpService = game:GetService("HttpService")
local CoreGui = game:GetService("CoreGui")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local username    = LocalPlayer.Name

local API_BASE         = "${apiBase}"
local SCRIPT_NAME      = "${scriptName}"

local function urlEncode(str)
    str = tostring(str or "")
    return (str:gsub("([^%w%-%_%.%~])", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local PAYLOAD_URL      = API_BASE .. "/get-script?name=" .. urlEncode(SCRIPT_NAME) .. "&payload=1&raw=1"
local WHITELIST_API    = API_BASE .. "/get-whitelist?format=json"
local FAKE_SCRIPT_API  = API_BASE .. "/get-fake-script"
local VALIDATE_KEY_API = API_BASE .. "/validate-key"

local SESSION_FOLDER   = "ArexansTools"
local SESSION_FILE     = SESSION_FOLDER .. "/ArexansTools_Session.json"

-- ============================================================
-- KEY KHUSUS SCRIPT (SCRIPT-SPECIFIC KEYS)
-- Key di bawah dibuat khusus untuk script: ${scriptName}
-- Script ini juga tetap mendukung License Key global Arexans
-- ============================================================
local SCRIPT_CUSTOM_KEYS = {
${customKeysLuaTable}
}

local function isSpecialKeyValid(inputKey)
    if not SCRIPT_CUSTOM_KEYS or not inputKey or inputKey == "" then return false, nil end
    local sk = SCRIPT_CUSTOM_KEYS[inputKey]
    if not sk then return false, nil end
    local exp = tonumber(sk.expired) or 0
    if exp > 0 and os.time() > exp then
        return false, "expired"
    end
    return true, sk
end

if not _G.Arexans_Connections then _G.Arexans_Connections = {} end
local function ConnectEvent(event, func)
    local conn = event:Connect(func)
    table.insert(_G.Arexans_Connections, conn)
    return conn
end

local function getHwid()
    local ok, id = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    return ok and id or (LocalPlayer.UserId .. "_fallback")
end
local HWID = getHwid()

local function safeRead()
    if not (isfile and readfile) then return nil end
    if not isfile(SESSION_FILE) then return nil end
    local ok, raw = pcall(readfile, SESSION_FILE)
    if not ok or not raw or raw == "" then return nil end
    local ok2, data = pcall(function() return HttpService:JSONDecode(raw) end)
    if ok2 and type(data) == "table" then return data end
    return nil
end

local function safeWrite(tbl)
    if not (writefile and makefolder) then return end
    pcall(function()
        if isfolder and not isfolder(SESSION_FOLDER) then makefolder(SESSION_FOLDER) end
        writefile(SESSION_FILE, HttpService:JSONEncode(tbl))
    end)
end

local function httpRequest(opts)
    local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
    if not req then
        local ok, body = pcall(function() return game:HttpGet(opts.Url) end)
        return ok and { StatusCode = 200, Body = body } or nil
    end
    local ok, res = pcall(req, opts)
    return ok and res or nil
end

local function loadLuaString(source, label)
    local loader = loadstring or load
    if type(loader) ~= "function" then warn("[ArexansTools] Executor tanpa loadstring/load."); return nil end
    if type(source) ~= "string" or source == "" then return nil end
    local fn, compileErr = loader(source)
    if type(fn) ~= "function" then warn("[ArexansTools] " .. tostring(label) .. " compile error: " .. tostring(compileErr)); return nil end
    return fn
end

local function MakeDraggable(guiObject, dragHandle)
    local dragInput, dragStart, startPos
    ConnectEvent(dragHandle.InputBegan, function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragInput = input; dragStart = input.Position; startPos = guiObject.Position
        end
    end)
    ConnectEvent(UserInputService.InputChanged, function(input)
        if dragInput and (input.UserInputType == Enum.UserInputType.MouseMovement or input == dragInput) then
            local d = input.Position - dragStart
            guiObject.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + d.X, startPos.Y.Scale, startPos.Y.Offset + d.Y)
        end
    end)
    ConnectEvent(UserInputService.InputEnded, function(input)
        if dragInput and input.UserInputType == dragInput.UserInputType then dragInput = nil end
    end)
end

-- 1) Session cache: file-presence only (tidak validasi online → tidak nge-block payload)
local function tryCachedKey()
    local data = safeRead()
    if data and data.key and data.key ~= "" then
        if data.isScriptKey then
            local valid, skOrErr = isSpecialKeyValid(data.key)
            if not valid then
                print("[ArexansTools] Key khusus tersimpan telah kedaluwarsa.")
                return false
            end
        end
        print("[ArexansTools] Session ditemukan (role: " .. tostring(data.role or "Unknown") .. ")")
        return true
    end
    return false
end

local function checkWhitelist()
    local res = httpRequest({ Url = WHITELIST_API, Method = "GET" })
    if not res or not res.Body then return false end
    local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if not (ok and data and data.success and data.usernames) then return false end
    local lname = string.lower(username)
    for _, u in ipairs(data.usernames) do
        if string.lower(u) == lname then return true end
    end
    return false
end

local function showKeyPromptUI()
    local parentGui = CoreGui
    local okp, pg = pcall(function() return Players.LocalPlayer:WaitForChild("PlayerGui") end)
    if not okp or not pg then pg = CoreGui end
    pcall(function() if parentGui:FindFirstChild("ArexansKeySystemGUI") then parentGui.ArexansKeySystemGUI:Destroy() end end)
    pcall(function() if pg:FindFirstChild("ArexansKeySystemGUI") then pg.ArexansKeySystemGUI:Destroy() end end)

    local function ButtonFx(button, flash)
        button.AutoButtonColor = false
        local orig = button.BackgroundTransparency
        local us = button:FindFirstChild("BFX") or Instance.new("UIScale", button); us.Name = "BFX"
        button.MouseButton1Down:Connect(function()
            TweenService:Create(us, TweenInfo.new(0.1), {Scale = 0.95}):Play()
            if flash then TweenService:Create(button, TweenInfo.new(0.1), {BackgroundTransparency = math.max(0, orig - 0.2)}):Play() end
        end)
        local function restore()
            TweenService:Create(us, TweenInfo.new(0.1), {Scale = 1}):Play()
            if flash then TweenService:Create(button, TweenInfo.new(0.2), {BackgroundTransparency = orig}):Play() end
        end
        button.MouseButton1Up:Connect(restore); button.MouseLeave:Connect(restore)
    end

    local keyGui = Instance.new("ScreenGui")
    keyGui.Name = "ArexansKeySystemGUI"; keyGui.ResetOnSpawn = false
    keyGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling; keyGui.DisplayOrder = 999
    local pOk = pcall(function() keyGui.Parent = CoreGui end)
    if not pOk then keyGui.Parent = pg end

    local Frame = Instance.new("Frame", keyGui)
    Frame.Size = UDim2.new(0, 280, 0, 150); Frame.Position = UDim2.new(0.5, -140, 0.5, -75)
    Frame.BackgroundColor3 = Color3.fromRGB(10, 10, 10); Frame.BackgroundTransparency = 0.2; Frame.BorderSizePixel = 0
    Instance.new("UICorner", Frame).CornerRadius = UDim.new(0, 8)
    local fs = Instance.new("UIStroke", Frame); fs.Color = Color3.fromRGB(0, 150, 255); fs.Thickness = 3

    local TitleBar = Instance.new("TextButton", Frame)
    TitleBar.Size = UDim2.new(1, 0, 0, 35); TitleBar.BackgroundTransparency = 1; TitleBar.Text = ""; TitleBar.AutoButtonColor = false

    local TitleLbl = Instance.new("TextLabel", TitleBar)
    TitleLbl.Size = UDim2.new(1, -40, 1, 0); TitleLbl.Position = UDim2.new(0, 10, 0, 0)
    TitleLbl.BackgroundTransparency = 1; TitleLbl.Text = "Arexans Key System"
    TitleLbl.Font = Enum.Font.GothamBold; TitleLbl.TextColor3 = Color3.fromRGB(255, 255, 255)
    TitleLbl.TextSize = 16; TitleLbl.TextXAlignment = Enum.TextXAlignment.Left
    local grad = Instance.new("UIGradient", TitleLbl)
    grad.Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(0, 150, 255)),
        ColorSequenceKeypoint.new(0.5, Color3.fromRGB(0, 255, 255)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(0, 150, 255)),
    })
    grad.Rotation = 45
    task.spawn(function()
        while TitleLbl.Parent do grad.Rotation = (tick() * 50) % 360; RunService.Heartbeat:Wait() end
    end)

    local CloseBtn = Instance.new("TextButton", TitleBar)
    CloseBtn.Size = UDim2.new(0, 25, 0, 25); CloseBtn.Position = UDim2.new(1, -30, 0.5, 0); CloseBtn.AnchorPoint = Vector2.new(0, 0.5)
    CloseBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50); CloseBtn.BackgroundTransparency = 1
    CloseBtn.Text = "X"; CloseBtn.Font = Enum.Font.GothamBold; CloseBtn.TextColor3 = Color3.fromRGB(255, 100, 100); CloseBtn.TextSize = 16
    Instance.new("UICorner", CloseBtn).CornerRadius = UDim.new(0, 4)
    local cs = Instance.new("UIStroke", CloseBtn); cs.Color = Color3.fromRGB(255, 100, 100); cs.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    ButtonFx(CloseBtn, true)

    local Sep = Instance.new("Frame", Frame)
    Sep.Size = UDim2.new(1, -20, 0, 1); Sep.Position = UDim2.new(0, 10, 0, 35)
    Sep.BackgroundColor3 = Color3.fromRGB(0, 150, 255); Sep.BackgroundTransparency = 0.5; Sep.BorderSizePixel = 0

    local KeyBox = Instance.new("TextBox", Frame)
    KeyBox.Size = UDim2.new(1, -20, 0, 35); KeyBox.Position = UDim2.new(0, 10, 0, 45)
    KeyBox.BackgroundColor3 = Color3.fromRGB(30, 30, 40); KeyBox.BackgroundTransparency = 1
    KeyBox.TextColor3 = Color3.fromRGB(0, 150, 255); KeyBox.PlaceholderText = "Masukkan key..."
    KeyBox.PlaceholderColor3 = Color3.fromRGB(0, 100, 180); KeyBox.Text = ""
    KeyBox.Font = Enum.Font.GothamBold; KeyBox.TextSize = 14; KeyBox.ClearTextOnFocus = false
    Instance.new("UICorner", KeyBox).CornerRadius = UDim.new(0, 6)
    local ks = Instance.new("UIStroke", KeyBox); ks.Color = Color3.fromRGB(0, 150, 255); ks.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local Btns = Instance.new("Frame", Frame)
    Btns.Size = UDim2.new(1, -20, 0, 35); Btns.Position = UDim2.new(0, 10, 0, 90); Btns.BackgroundTransparency = 1

    local GetKeyBtn = Instance.new("TextButton", Btns)
    GetKeyBtn.Size = UDim2.new(0.48, 0, 1, 0); GetKeyBtn.BackgroundColor3 = Color3.fromRGB(0, 150, 255); GetKeyBtn.BackgroundTransparency = 1
    GetKeyBtn.Text = "Get Key"; GetKeyBtn.Font = Enum.Font.GothamBold; GetKeyBtn.TextColor3 = Color3.fromRGB(0, 150, 255); GetKeyBtn.TextSize = 14
    Instance.new("UICorner", GetKeyBtn).CornerRadius = UDim.new(0, 6)
    local gks = Instance.new("UIStroke", GetKeyBtn); gks.Color = Color3.fromRGB(0, 150, 255); gks.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local LoginBtn = Instance.new("TextButton", Btns)
    LoginBtn.Size = UDim2.new(0.48, 0, 1, 0); LoginBtn.Position = UDim2.new(0.52, 0, 0, 0)
    LoginBtn.BackgroundColor3 = Color3.fromRGB(0, 150, 255); LoginBtn.BackgroundTransparency = 1
    LoginBtn.Text = "Login"; LoginBtn.Font = Enum.Font.GothamBold; LoginBtn.TextColor3 = Color3.fromRGB(0, 150, 255); LoginBtn.TextSize = 14
    Instance.new("UICorner", LoginBtn).CornerRadius = UDim.new(0, 6)
    local lgs = Instance.new("UIStroke", LoginBtn); lgs.Color = Color3.fromRGB(0, 150, 255); lgs.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

    local Status = Instance.new("TextLabel", Frame)
    Status.Size = UDim2.new(1, -20, 0, 20); Status.Position = UDim2.new(0, 10, 1, -25); Status.BackgroundTransparency = 1
    Status.Text = ""; Status.Font = Enum.Font.GothamBold; Status.TextColor3 = Color3.fromRGB(0, 150, 255); Status.TextSize = 14

    pcall(function() MakeDraggable(Frame, TitleBar) end)
    ButtonFx(GetKeyBtn, true); ButtonFx(LoginBtn, true)

    local result = { done = false, key = nil, cancelled = false }
    local busy = false

    CloseBtn.MouseButton1Click:Connect(function()
        result.cancelled = true; result.done = true
        pcall(function() keyGui:Destroy() end)
    end)

    GetKeyBtn.MouseButton1Click:Connect(function()
        if setclipboard then
            setclipboard("https://tools.arexans.my.id")
            Status.Text = "Link disalin!"; Status.TextColor3 = Color3.fromRGB(100, 255, 100)
        else
            Status.Text = "Clipboard tidak didukung"; Status.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
    end)

    local function attemptLogin()
        if busy then return end
        local key = KeyBox.Text
        if not key or key == "" then
            Status.Text = "Masukkan key terlebih dahulu"; Status.TextColor3 = Color3.fromRGB(255, 200, 50); return
        end

        -- 1) Prioritaskan verifikasi Key Khusus untuk script ini
        local isSpecialValid, specialInfo = isSpecialKeyValid(key)
        if isSpecialValid then
            local roleTitle = (specialInfo and specialInfo.role) or "Special Key"
            safeWrite({ key = key, savedAt = os.time(), role = roleTitle, isScriptKey = true, scriptName = SCRIPT_NAME })
            Status.Text = roleTitle .. " | Valid (Khusus Script)"
            Status.TextColor3 = Color3.fromRGB(100, 255, 100)
            task.wait(0.6)
            result.key = key; result.done = true
            pcall(function() keyGui:Destroy() end)
            return
        elseif specialInfo == "expired" then
            Status.Text = "Key khusus script ini telah expired!"; Status.TextColor3 = Color3.fromRGB(255, 100, 100)
            return
        end

        -- 2) Fallback: Verifikasi ke server Key System Global
        busy = true; Status.Text = "Memvalidasi..."; Status.TextColor3 = Color3.fromRGB(255, 255, 100); LoginBtn.Text = "..."
        task.spawn(function()
            local res = httpRequest({
                Url = VALIDATE_KEY_API, Method = "POST",
                Headers = { ["Content-Type"] = "application/json" },
                Body = HttpService:JSONEncode({ key = key, hwid = HWID, robloxUsername = username }),
            })
            busy = false; LoginBtn.Text = "Login"
            if not res or not res.Body then
                Status.Text = "Gagal terhubung ke server"; Status.TextColor3 = Color3.fromRGB(255, 100, 100); return
            end
            local ok, parsed = pcall(function() return HttpService:JSONDecode(res.Body) end)
            if ok and parsed and parsed.success and parsed.valid then
                safeWrite({ key = key, savedAt = os.time(), role = parsed.role, isScriptKey = false })
                Status.Text = (parsed.role or "Member") .. " | Valid"
                Status.TextColor3 = Color3.fromRGB(100, 255, 100)
                task.wait(0.6)
                result.key = key; result.done = true
                pcall(function() keyGui:Destroy() end)
            else
                local err = (parsed and (parsed.error or parsed.message)) or "Key tidak valid"
                Status.Text = tostring(err); Status.TextColor3 = Color3.fromRGB(255, 100, 100)
            end
        end)
    end

    LoginBtn.MouseButton1Click:Connect(attemptLogin)
    KeyBox.FocusLost:Connect(function(enter) if enter then attemptLogin() end end)

    local timeout = tick() + 600
    while not result.done and tick() < timeout do task.wait(0.2) end
    if not result.done then pcall(function() keyGui:Destroy() end) end
    return result.key
end

local function promptAndSaveKey()
    local key = showKeyPromptUI()
    return key ~= nil and key ~= ""
end

local function runFake()
    local res = httpRequest({ Url = FAKE_SCRIPT_API, Method = "GET" })
    if res and res.Body then
        local fn = loadLuaString(res.Body, "fake")
        if fn then pcall(fn) end
    else
        warn("[ArexansTools] Akses ditolak.")
    end
end

local authorized = false
if tryCachedKey() then
    authorized = true
    print("[ArexansTools] Akses diizinkan melalui cache lokal.")
elseif checkWhitelist() then
    authorized = true
    print("[ArexansTools] Whitelist verified for " .. username)
elseif promptAndSaveKey() then
    authorized = true
end

if not authorized then runFake(); return end

print("[ArexansTools] Access granted. Fetching payload...")

local payloadRes = httpRequest({ Url = PAYLOAD_URL, Method = "GET" })
if not payloadRes or not payloadRes.Body or payloadRes.Body == "" then
    warn("[ArexansTools] Gagal mengambil payload script.")
    return
end

local fn = loadLuaString(payloadRes.Body, "payload")
if not fn then return end

if getgenv then
    getgenv().AREXANS_SCRIPT_NAME = SCRIPT_NAME
    getgenv().AREXANS_PAYLOAD_URL = PAYLOAD_URL
end

local ok, resultOrErr = pcall(fn)
if not ok then
    warn("[ArexansTools] Payload runtime error: " .. tostring(resultOrErr))
elseif type(resultOrErr) == "function" then
    local ok2, err2 = pcall(resultOrErr)
    if not ok2 then warn("[ArexansTools] Payload returned function error: " .. tostring(err2)) end
end
`;
};

const LuaUploadManager: FC = () => {
  const [scripts, setScripts] = useState<UploadedScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rewrapping, setRewrapping] = useState(false);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [historyScript, setHistoryScript] = useState<UploadedScript | null>(null);
  const [previewVersion, setPreviewVersion] = useState<ScriptVersion | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [editScript, setEditScript] = useState<UploadedScript | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Script-Specific Keys state
  const [customKeysByScript, setCustomKeysByScript] = useState<Record<string, ScriptCustomKey[]>>({});
  const [selectedScriptForKeys, setSelectedScriptForKeys] = useState<UploadedScript | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  // New Key input form
  const [inputKey, setInputKey] = useState('');
  const [inputRole, setInputRole] = useState('VIP Script');
  const [inputLabel, setInputLabel] = useState('');
  const [durationPreset, setDurationPreset] = useState<'1d' | '3d' | '7d' | '30d' | '90d' | '365d' | 'permanent' | 'custom'>('30d');
  const [customExpireDate, setCustomExpireDate] = useState('');

  // Loadstring Duration Dialog
  const [loadstringDialogConfig, setLoadstringDialogConfig] = useState<LoadstringDialogConfig | null>(null);
  const [showLoadstringDialog, setShowLoadstringDialog] = useState(false);

  const SUPABASE_API_BASE = `${typeof window !== 'undefined' ? window.location.origin : ''}/functions/v1`;

  const fetchCustomKeys = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'script_custom_keys')
        .maybeSingle();
      if (data?.value) {
        try {
          setCustomKeysByScript(JSON.parse(data.value));
        } catch {
          setCustomKeysByScript({});
        }
      }
    } catch (err) {
      console.error('Failed to load script custom keys', err);
    }
  };

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lua_scripts')
        .select('*')
        .eq('script_type', 'uploaded')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setScripts(data || []);
      await fetchCustomKeys();
    } catch (e) {
      toast({ title: 'Error', description: 'Gagal mengambil scripts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScripts(); }, []);

  const wrap = (name: string, raw: string, keysOverride?: ScriptCustomKey[]) => {
    const keys = keysOverride ?? (customKeysByScript[name] || []);
    return PROTECTION_WRAPPER(SUPABASE_API_BASE, name, raw, keys);
  };

  const unwrap = (wrapped: string): string => {
    const marker = '-- USER SCRIPT (PROTECTED)';
    const idx = wrapped.indexOf(marker);
    if (idx === -1) return wrapped;
    const afterMarker = wrapped.substring(idx + marker.length);
    const nl = afterMarker.indexOf('\n');
    return afterMarker.substring(nl + 1).replace(/\n$/, '');
  };

  const generateRandomKey = (prefix = 'AXS-SCR') => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${prefix}-${seg(4)}-${seg(4)}`;
  };

  const calculateExpiry = (): string | null => {
    if (durationPreset === 'permanent') return null;
    if (durationPreset === 'custom') {
      if (!customExpireDate) return null;
      return new Date(customExpireDate).toISOString();
    }
    const now = new Date();
    const daysMap: Record<string, number> = {
      '1d': 1,
      '3d': 3,
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '365d': 365,
    };
    const days = daysMap[durationPreset] || 30;
    now.setDate(now.getDate() + days);
    return now.toISOString();
  };

  const openCustomKeysModal = (script: UploadedScript) => {
    setSelectedScriptForKeys(script);
    setInputKey(generateRandomKey());
    setInputRole('VIP Script');
    setInputLabel('');
    setDurationPreset('30d');
    setCustomExpireDate('');
    setIsKeyModalOpen(true);
  };

  const persistAndApplyKeys = async (
    script: UploadedScript,
    allKeysMap: Record<string, ScriptCustomKey[]>,
    scriptKeys: ScriptCustomKey[]
  ) => {
    setSavingKeys(true);
    try {
      // 1. Simpan ke app_settings
      await supabase.from('app_settings').upsert({
        key: 'script_custom_keys',
        value: JSON.stringify(allKeysMap),
        description: 'Custom keys dedicated to specific uploaded scripts',
        updated_at: new Date().toISOString(),
      } as any);

      // 2. Re-wrap script content dengan key khusus yang baru
      const raw = (script as any).raw_content || unwrap(script.content);
      const newWrapped = wrap(script.name, raw, scriptKeys);
      const { error } = await supabase.from('lua_scripts').update({
        content: newWrapped,
        updated_at: new Date().toISOString(),
      } as any).eq('id', script.id);

      if (error) throw error;

      // Update di local state
      setScripts(prev => prev.map(s => s.id === script.id ? { ...s, content: newWrapped } : s));
      return true;
    } catch (err: any) {
      console.error('Error saving custom keys:', err);
      toast({ title: 'Gagal Menyimpan', description: err.message || 'Terjadi kesalahan', variant: 'destructive' });
      return false;
    } finally {
      setSavingKeys(false);
    }
  };

  const handleAddKeyToScript = async () => {
    if (!selectedScriptForKeys) return;
    const finalKey = inputKey.trim() || generateRandomKey();
    const scriptName = selectedScriptForKeys.name;
    const existingList = customKeysByScript[scriptName] || [];

    if (existingList.some(k => k.key.toUpperCase() === finalKey.toUpperCase())) {
      toast({ title: 'Duplikat Key', description: 'Key ini sudah ada untuk script ini', variant: 'destructive' });
      return;
    }

    const newKeyItem: ScriptCustomKey = {
      id: `k_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      key: finalKey,
      role: inputRole.trim() || 'VIP Script',
      label: inputLabel.trim() || undefined,
      expired: calculateExpiry(),
      createdAt: new Date().toISOString(),
    };

    const updatedKeys = [newKeyItem, ...existingList];
    const updatedMap = { ...customKeysByScript, [scriptName]: updatedKeys };
    setCustomKeysByScript(updatedMap);

    const ok = await persistAndApplyKeys(selectedScriptForKeys, updatedMap, updatedKeys);
    if (ok) {
      toast({ title: 'Berhasil!', description: `Key "${newKeyItem.key}" dibuat dan terintegrasi ke script!` });
      setInputKey(generateRandomKey());
      setInputLabel('');
    }
  };

  const handleDeleteKeyFromScript = async (keyId: string) => {
    if (!selectedScriptForKeys) return;
    const scriptName = selectedScriptForKeys.name;
    const existingList = customKeysByScript[scriptName] || [];
    const updatedKeys = existingList.filter(k => k.id !== keyId);
    const updatedMap = { ...customKeysByScript, [scriptName]: updatedKeys };
    setCustomKeysByScript(updatedMap);

    const ok = await persistAndApplyKeys(selectedScriptForKeys, updatedMap, updatedKeys);
    if (ok) {
      toast({ title: 'Dihapus', description: 'Key khusus dihapus dan script diperbarui.' });
    }
  };

  const openLoadstringDialog = (script: UploadedScript) => {
    setLoadstringDialogConfig({
      scriptName: script.display_name,
      rawLoadstring: `loadstring(game:HttpGet("${getScriptUrl(script.name)}"))()`,
      sourceUrl: getScriptUrl(script.name),
    });
    setShowLoadstringDialog(true);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    for (const file of files) {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!['.lua', '.txt'].includes(ext)) {
        toast({ title: 'Error', description: `${file.name}: hanya .lua atau .txt`, variant: 'destructive' });
        continue;
      }
      enqueue(`Upload: ${file.name}`, async (update) => {
        const raw = await readFileWithProgress(file, p => update(p * 0.2, 'Membaca file...'));
        const scriptName = file.name.replace(/\.(lua|txt)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const dbName = `uploaded_${scriptName}`;
        update(22, 'Membungkus script...');
        await idle();
        const wrapped = wrap(dbName, raw);
        await idle();
        const { data: existing } = await supabase.from('lua_scripts').select('id').eq('name', dbName).maybeSingle();
        const onP = (p: number) => update(25 + p * 0.75, p >= 100 ? 'Menyimpan di server...' : 'Mengupload...');
        if (existing) {
          await writeLuaScript('PATCH', { content: wrapped, raw_content: raw, updated_at: new Date().toISOString() }, `id=eq.${existing.id}`, onP);
        } else {
          await writeLuaScript('POST', {
            name: dbName, display_name: file.name,
            description: 'Auto-integrated: key system + whitelist',
            content: wrapped, raw_content: raw, script_type: 'uploaded', is_active: true,
          }, null, onP);
        }
      }, { sizeBytes: file.size, onDone: () => { toast({ title: 'Berhasil', description: `"${file.name}" terupload` }); fetchScripts(); } });
    }
    if (files.length) toast({ title: 'Diantrikan', description: `${files.length} file diupload di latar belakang — silakan lanjut edit` });
  };

  const reWrapAll = async () => {
    if (!confirm('Re-wrap semua script dengan wrapper terbaru (key system + whitelist)?')) return;
    setRewrapping(true);
    try {
      for (const s of scripts) {
        const raw = (s as any).raw_content || unwrap(s.content);
        const newWrapped = wrap(s.name, raw);
        await supabase.from('lua_scripts').update({
          content: newWrapped, raw_content: raw, updated_at: new Date().toISOString(),
        } as any).eq('id', s.id);
      }
      toast({ title: 'Berhasil', description: `${scripts.length} script di-rewrap` });
      fetchScripts();
    } catch (e) {
      toast({ title: 'Error', description: 'Gagal re-wrap', variant: 'destructive' });
    } finally {
      setRewrapping(false);
    }
  };

  const deleteScript = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from('lua_scripts').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Berhasil', description: `"${name}" dihapus` });
      fetchScripts();
    } catch {
      toast({ title: 'Error', description: 'Gagal menghapus', variant: 'destructive' });
    }
  };

  const openHistory = async (script: UploadedScript) => {
    setHistoryScript(script);
    setPreviewVersion(null);
    const { data, error } = await supabase
      .from('lua_script_versions')
      .select('*')
      .eq('script_id', script.id)
      .order('version_number', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: 'Gagal load history', variant: 'destructive' });
      return;
    }
    setVersions(data || []);
  };

  const restoreVersion = async (version: ScriptVersion) => {
    if (!historyScript) return;
    if (!confirm(`Restore versi #${version.version_number}? Versi saat ini akan disimpan ke history.`)) return;
    const { error } = await supabase.from('lua_scripts').update({
      content: version.content, updated_at: new Date().toISOString(),
    }).eq('id', historyScript.id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal restore', variant: 'destructive' });
      return;
    }
    toast({ title: 'Berhasil', description: `Restored ke v${version.version_number}` });
    setHistoryScript(null);
    fetchScripts();
  };

  const undoToPrevious = async (script: UploadedScript) => {
    const { data } = await supabase
      .from('lua_script_versions')
      .select('*')
      .eq('script_id', script.id)
      .order('version_number', { ascending: false })
      .limit(1);
    if (!data || data.length === 0) {
      toast({ title: 'Tidak ada history', description: 'Belum ada versi sebelumnya' });
      return;
    }
    const prev = data[0];
    if (!confirm(`Undo ke versi #${prev.version_number} (${new Date(prev.created_at).toLocaleString('id-ID')})?`)) return;
    const { error } = await supabase.from('lua_scripts').update({
      content: prev.content, updated_at: new Date().toISOString(),
    }).eq('id', script.id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal undo', variant: 'destructive' });
      return;
    }
    toast({ title: 'Undo berhasil', description: `Kembali ke v${prev.version_number}` });
    fetchScripts();
  };

  const getScriptUrl = (n: string) => `https://tools.arexans.my.id/api/get-script?name=${n}`;
  const copyUrl = (n: string) => { navigator.clipboard.writeText(getScriptUrl(n)); toast({ title: 'Copied!' }); };
  const copyLoadstring = (n: string) => {
    navigator.clipboard.writeText(`loadstring(game:HttpGet("${getScriptUrl(n)}"))()`);
    toast({ title: 'Copied!', description: 'Loadstring disalin' });
  };
  const copyIntegratedCode = (script: UploadedScript) => {
    navigator.clipboard.writeText(script.content || '');
    toast({ title: 'Copied!', description: 'Kode terintegrasi lengkap disalin' });
  };

  const downloadRawFile = (script: UploadedScript) => {
    // Download raw (unwrapped) content — no key system / whitelist integration
    const raw = (script as any).raw_content || unwrap(script.content || '');
    const fileName = /\.(lua|txt)$/i.test(script.display_name) ? script.display_name : `${script.display_name}.lua`;
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: `"${fileName}" berhasil diunduh (tanpa integrasi)` });
  };

  const handleReplaceUpload = async (script: UploadedScript, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!['.lua', '.txt'].includes(ext)) {
      toast({ title: 'Error', description: 'Hanya .lua atau .txt', variant: 'destructive' });
      event.target.value = '';
      return;
    }
    if (!confirm(`Ganti isi "${script.display_name}" dengan "${file.name}"? Versi lama tetap tersimpan di history.`)) {
      event.target.value = '';
      return;
    }
    event.target.value = '';
    enqueue(`Ganti: ${script.display_name}`, async (update) => {
      const raw = await readFileWithProgress(file, p => update(p * 0.2, 'Membaca file...'));
      update(22, 'Membungkus script...');
      await idle();
      const wrapped = wrap(script.name, raw);
      await idle();
      await writeLuaScript('PATCH', { content: wrapped, raw_content: raw, display_name: file.name, updated_at: new Date().toISOString() },
        `id=eq.${script.id}`, p => update(25 + p * 0.75, p >= 100 ? 'Menyimpan di server...' : 'Mengupload...'));
    }, { sizeBytes: file.size, onDone: () => { toast({ title: 'Berhasil', description: `"${script.display_name}" diganti dengan "${file.name}"` }); fetchScripts(); } });
  };

  const openEditor = (script: UploadedScript) => {
    setEditScript(script);
    const raw = (script as any).raw_content || unwrap(script.content || '');
    setEditContent(raw);
  };

  const saveEdit = async () => {
    if (!editScript) return;
    const target = editScript;
    const content = editContent;
    setEditScript(null);
    enqueue(`Simpan: ${target.display_name}`, async (update) => {
      update(5, 'Membungkus script...');
      await idle();
      const wrapped = wrap(target.name, content);
      await idle();
      await writeLuaScript('PATCH', { content: wrapped, raw_content: content, updated_at: new Date().toISOString() },
        `id=eq.${target.id}`, p => update(10 + p * 0.9, p >= 100 ? 'Menyimpan di server...' : 'Mengupload...'));
    }, { sizeBytes: content.length, onDone: () => { toast({ title: 'Berhasil', description: `"${target.display_name}" diupdate` }); fetchScripts(); } });
    toast({ title: 'Diantrikan', description: 'Penyimpanan berjalan di latar belakang' });
  };


  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-display font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <span className="truncate">Upload Lua Scripts</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Upload .lua — otomatis terintegrasi key system + whitelist database
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={reWrapAll} disabled={rewrapping || scripts.length === 0} title="Re-wrap semua dengan wrapper terbaru">
            <RotateCcw className={`w-4 h-4 ${rewrapping ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchScripts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4 sm:p-6">
          <input type="file" accept=".lua,.txt" multiple ref={fileInputRef} onChange={handleUpload} className="hidden" />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-primary/30 rounded-xl p-6 sm:p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <Upload className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-primary/50" />
            <p className="text-sm font-medium mb-1">Klik untuk upload file Lua (bisa banyak sekaligus, berjalan di latar belakang)</p>
            <p className="text-xs text-muted-foreground">File .lua atau .txt — auto-wrap key system + whitelist</p>
          </div>
          <div className="mt-3 p-2 rounded bg-primary/10 border border-primary/20">
            <div className="flex items-start gap-2 text-xs text-primary">
              <Shield className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>Script otomatis cek <code className="text-[10px]">ArexansTools_Session.json</code> → kalau key valid langsung jalan, kalau tidak cek whitelist, kalau bukan whitelist minta input key.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <FileCode className="w-4 h-4 text-primary" />
            Script Ter-upload ({scripts.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Semua script terproteksi key system + whitelist · Undo / History tersedia per script
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {scripts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCode className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Belum ada script</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-3">
                {scripts.map((script) => (
                  <div key={script.id} className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{script.display_name}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            <Shield className="w-2.5 h-2.5 mr-0.5" />Key+WL
                          </Badge>
                          {customKeysByScript[script.name]?.length ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border border-primary/30">
                              <Key className="w-2.5 h-2.5 mr-0.5" />
                              {customKeysByScript[script.name].length} Key Khusus
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{new Date(script.updated_at).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 flex-wrap">
                        <input
                          type="file"
                          accept=".lua,.txt"
                          ref={(el) => (replaceInputRefs.current[script.id] = el)}
                          onChange={(e) => handleReplaceUpload(script, e)}
                          className="hidden"
                        />
                        <Button variant="ghost" size="sm" onClick={() => downloadRawFile(script)} title="Download file mentah (tanpa integrasi key/whitelist)" className="h-8 px-2">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => replaceInputRefs.current[script.id]?.click()} title="Upload ulang / ganti file" className="h-8 px-2">
                          <Replace className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditor(script)} title="Edit isi script" className="h-8 px-2">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => undoToPrevious(script)} title="Undo ke versi sebelumnya" className="h-8 px-2">
                          <Undo2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openHistory(script)} title="Lihat history" className="h-8 px-2">
                          <HistoryIcon className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteScript(script.id, script.display_name)} className="text-destructive hover:text-destructive h-8 px-2">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input readOnly value={getScriptUrl(script.name)} className="font-mono text-[10px] h-7 bg-black/30" />
                        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => copyUrl(script.name)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => window.open(getScriptUrl(script.name), '_blank')}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openLoadstringDialog(script)}>
                          <Copy className="w-3 h-3 mr-1" />
                          Loadstring
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs h-7 border border-primary/30 hover:border-primary text-primary font-medium"
                          onClick={() => openCustomKeysModal(script)}
                        >
                          <Key className="w-3 h-3 mr-1" />
                          Key Khusus ({customKeysByScript[script.name]?.length || 0})
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => downloadRawFile(script)}>
                          <Download className="w-3 h-3 mr-1" />
                          Download Raw
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => copyIntegratedCode(script)}>
                        <FileCode className="w-3 h-3 mr-1" />
                        Copy Kode Terintegrasi Lengkap
                      </Button>
                    </div>

                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-500" />
            Fake Script API
          </CardTitle>
          <CardDescription className="text-xs">Endpoint fake source untuk user gagal autentikasi</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 space-y-2">
          <div className="flex gap-1.5">
            <Input readOnly value={`https://tools.arexans.my.id/api/get-fake-script`} className="font-mono text-xs bg-black/30" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`https://tools.arexans.my.id/api/get-fake-script`); toast({ title: 'Copied!' }); }}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History dialog */}
      <Dialog open={!!historyScript} onOpenChange={(o) => { if (!o) { setHistoryScript(null); setPreviewVersion(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="w-4 h-4" />
              History: {historyScript?.display_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Versi tersimpan otomatis tiap kali script diupdate (max 20 versi terakhir).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden flex-1">
            <ScrollArea className="border rounded p-2 max-h-[60vh]">
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Belum ada versi tersimpan</p>
              ) : (
                <div className="space-y-1">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setPreviewVersion(v)}
                      className={`w-full text-left p-2 rounded text-xs hover:bg-muted/50 transition ${previewVersion?.id === v.id ? 'bg-primary/10 border border-primary/30' : ''}`}
                    >
                      <div className="font-medium">Versi #{v.version_number}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(v.created_at).toLocaleString('id-ID')}</div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex flex-col gap-2 overflow-hidden">
              {previewVersion ? (
                <>
                  <ScrollArea className="border rounded p-2 max-h-[50vh] bg-black/30">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">{previewVersion.content.substring(0, 5000)}{previewVersion.content.length > 5000 ? '\n...(truncated)' : ''}</pre>
                  </ScrollArea>
                  <Button onClick={() => restoreVersion(previewVersion)} className="w-full">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Restore versi #{previewVersion.version_number}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Pilih versi untuk preview</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editScript} onOpenChange={(o) => { if (!o) setEditScript(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit: {editScript?.display_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ubah isi script mentah. Wrapper key system + whitelist akan otomatis diterapkan saat disimpan.
            </DialogDescription>
          </DialogHeader>
          <SafeEditor
            value={editContent}
            onChange={setEditContent}
            className="w-full flex-1 min-h-[400px] font-mono text-xs bg-black/50 border border-primary/30 rounded p-3 outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditScript(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Menyimpan...</> : <><Save className="w-3 h-3 mr-1" />Simpan</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Script-Specific Custom Keys Dialog */}
      <Dialog open={isKeyModalOpen} onOpenChange={setIsKeyModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Key className="w-5 h-5 text-primary" />
              Key Khusus: {selectedScriptForKeys?.display_name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Buat dan atur key khusus yang dibuat hanya untuk script ini saja. Script ini juga tetap membaca License Key global Arexans.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Form Tambah Key Baru */}
            <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                  <Plus className="w-3.5 h-3.5" />
                  Buat Key Khusus Baru
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-primary hover:text-primary px-2"
                  onClick={() => setInputKey(generateRandomKey())}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Generate Acak
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px]">Kode Key Khusus</Label>
                  <Input
                    placeholder="Contoh: AXS-SCR-ABCD-1234"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Role / Tier Key</Label>
                  <Input
                    placeholder="Contoh: VIP Script, Member"
                    value={inputRole}
                    onChange={(e) => setInputRole(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Durasi & Expired */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    Durasi Expired Key
                  </Label>
                  {durationPreset !== 'permanent' && durationPreset !== 'custom' && (
                    <span className="text-[10px] text-muted-foreground">
                      Expired: {new Date(calculateExpiry() || '').toLocaleDateString('id-ID')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: '1d', label: '1 Hari' },
                    { id: '3d', label: '3 Hari' },
                    { id: '7d', label: '7 Hari' },
                    { id: '30d', label: '30 Hari' },
                    { id: '90d', label: '90 Hari' },
                    { id: '365d', label: '1 Tahun' },
                    { id: 'permanent', label: 'Selamanya (Permanent)' },
                    { id: 'custom', label: 'Bebas Atur' },
                  ].map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant={durationPreset === p.id ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setDurationPreset(p.id as any)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>

                {durationPreset === 'custom' && (
                  <div className="pt-1">
                    <Label className="text-[10px] text-muted-foreground">Pilih Tanggal & Jam Expired Bebas:</Label>
                    <Input
                      type="datetime-local"
                      value={customExpireDate}
                      onChange={(e) => setCustomExpireDate(e.target.value)}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Catatan / Nama Pembeli (Opsional)</Label>
                <Input
                  placeholder="Contoh: Pembeli: Rizky / Order #12"
                  value={inputLabel}
                  onChange={(e) => setInputLabel(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <Button
                onClick={handleAddKeyToScript}
                disabled={savingKeys}
                className="w-full h-8 text-xs font-semibold"
              >
                {savingKeys ? (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menerapkan ke Script...</>
                ) : (
                  <><Plus className="w-3.5 h-3.5 mr-1.5" /> Tambahkan & Terapkan ke Kode Integrasi</>
                )}
              </Button>
            </div>

            {/* List Key Khusus Terdaftar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Daftar Key Khusus Aktif ({selectedScriptForKeys ? (customKeysByScript[selectedScriptForKeys.name]?.length || 0) : 0})
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Semua key di bawah tertanam pada script terintegrasi
                </span>
              </div>

              {selectedScriptForKeys && (!customKeysByScript[selectedScriptForKeys.name] || customKeysByScript[selectedScriptForKeys.name].length === 0) ? (
                <div className="p-4 text-center rounded-lg border border-dashed border-muted text-xs text-muted-foreground">
                  Belum ada key khusus untuk script ini. Buat key di atas agar script dapat diakses dengan key khusus selain license key global.
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {selectedScriptForKeys && customKeysByScript[selectedScriptForKeys.name]?.map((k) => {
                    const isPermanent = !k.expired || k.expired === 'permanent';
                    const isExpired = !isPermanent && new Date(k.expired!).getTime() < Date.now();
                    return (
                      <div
                        key={k.id}
                        className="p-2.5 rounded-lg bg-black/30 border border-border/50 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-primary">{k.key}</span>
                            <Badge
                              variant={isExpired ? 'destructive' : isPermanent ? 'secondary' : 'default'}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {isExpired ? 'Expired' : isPermanent ? 'Permanent' : 'Aktif'}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {k.role || 'VIP Script'}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>
                              {isPermanent
                                ? 'Masa berlaku: Selamanya'
                                : `Expired: ${new Date(k.expired!).toLocaleString('id-ID')}`}
                            </span>
                            {k.label && <span className="italic">({k.label})</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            title="Salin Key"
                            onClick={() => {
                              navigator.clipboard.writeText(k.key);
                              toast({ title: 'Disalin!', description: `Key ${k.key} disalin ke clipboard` });
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            title="Hapus Key"
                            onClick={() => handleDeleteKeyFromScript(k.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick action buttons inside key dialog */}
            <div className="pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => {
                  if (selectedScriptForKeys) openLoadstringDialog(selectedScriptForKeys);
                }}
              >
                <Sparkles className="w-3 h-3 mr-1 text-primary" />
                Salin Loadstring Script Ini
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => {
                  if (selectedScriptForKeys) copyIntegratedCode(selectedScriptForKeys);
                }}
              >
                <FileCode className="w-3 h-3 mr-1" />
                Salin Kode Integrasi Lengkap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LoadstringDurationDialog
        open={showLoadstringDialog}
        onOpenChange={setShowLoadstringDialog}
        config={loadstringDialogConfig}
      />
    </div>

  );
};

export default LuaUploadManager;
