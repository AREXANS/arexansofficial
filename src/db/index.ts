import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import fs from 'fs';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: any | undefined;
  var _inMemoryTables: Map<string, any[]> | undefined;
}

// Default seeded data for in-memory mode
const DEFAULT_PACKAGES = [
  {
    id: "f4e2af14-c91e-4259-944f-21876e6deba8",
    name: "NORMAL",
    display_name: "Normal",
    price_per_day: 2000,
    description: "Paket standar",
    features: ["Fitur dasar", "Update rutin"],
    is_active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "305482a0-5a57-449d-bb70-5af8470505ab",
    name: "VIP",
    display_name: "VIP",
    price_per_day: 3500,
    description: "Paket VIP",
    features: ["Semua fitur Normal", "Fitur VIP eksklusif", "Prioritas support"],
    is_active: true,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "d4e2f040-5e06-4d13-ab0a-3601bc7bdd8a",
    name: "LIFETIME",
    display_name: "Lifetime",
    price_per_day: 700000,
    description: "Akses permanen",
    features: ["Semua fitur VIP", "Akses selamanya"],
    is_active: true,
    sort_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const DEFAULT_SETTINGS = [
  {
    id: '2a6703d2-4073-4a92-baab-42c0bca8b92e',
    key: 'admin_key',
    value: 'arexans2025@',
    description: 'Password login halaman developer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'payment_gateway_settings',
    key: 'payment_gateway_settings',
    value: JSON.stringify({ provider: 'casaku' }),
    description: 'Setting Payment Gateway',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'license_keys',
    key: 'license_keys',
    value: '[]',
    description: 'License keys list',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'toko_scripts_catalog',
    key: 'toko_scripts_catalog',
    value: '[]',
    description: 'Catalog of Toko Scripts',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'toko_scripts_keys_data',
    key: 'toko_scripts_keys_data',
    value: '[]',
    description: 'Keys for Toko Scripts',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const DEFAULT_LUA_SCRIPTS = [
  {
    id: 'f1a10001-0001-4000-8000-000000000001',
    name: 'keysystem',
    display_name: 'Key System Loader',
    description: 'Script keysystem yang berisi UI input key dan validasi API sebelum memuat Main Script',
    content: `-- ============================================================
-- AREXANS TOOLS — KEY SYSTEM LOADER
-- Endpoint: /get-script?name=keysystem
-- ============================================================
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local CoreGui = game:GetService("CoreGui")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local API_BASE = "https://tools.arexans.my.id/api"

local function getHwid()
    local ok, id = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    if ok and id and tostring(id) ~= "" then return tostring(id) end
    return LocalPlayer and tostring(LocalPlayer.UserId) or "FALLBACK_HWID"
end

local HWID = getHwid()
local USERNAME = LocalPlayer and LocalPlayer.Name or "Unknown"

local KEY = _G.Axstools or _G.ArexansKey or ""

local function validateKey(inputKey)
    local url = API_BASE .. "/validate-key"
    local payload = HttpService:JSONEncode({
        key = inputKey,
        hwid = HWID,
        robloxUsername = USERNAME
    })
    
    local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
    if req then
        local res = req({
            Url = url,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = payload
        })
        if res and res.Body then
            local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
            if ok and data then return data end
        end
    end
    
    local ok, res = pcall(function()
        return game:HttpGet(API_BASE .. "/validate-key?key=" .. inputKey .. "&hwid=" .. HWID .. "&username=" .. USERNAME)
    end)
    if ok and res then
        local okDecode, data = pcall(function() return HttpService:JSONDecode(res) end)
        if okDecode and data then return data end
    end
    
    return { valid = false, message = "Gagal menghubungi server validasi." }
end

local function executeMainScript()
    local scriptUrl = API_BASE .. "/get-script?name=main&raw=1"
    local success, result = pcall(function()
        local src = game:HttpGet(scriptUrl .. (scriptUrl:find("%?") and "&raw=1" or "?raw=1"))
        if type(src) ~= "string" or src == "" then error("empty script body from server") end
        local loader = loadstring or load
        if type(loader) ~= "function" then error("executor missing loadstring/load") end
        local fn, compileErr = loader(src, "=ArexansMainScript")
        if type(fn) ~= "function" then error("compile error: " .. tostring(compileErr)) end
        return fn()
    end)
    
    if not success then
        warn("[Arexans] Gagal memuat Main Script: " .. tostring(result))
    end
end

if KEY ~= "" then
    local res = validateKey(KEY)
    if res and (res.valid or res.success) then
        print("[Arexans] Key terverifikasi: " .. KEY)
        executeMainScript()
        return
    end
end

print("[Arexans] Key System aktif. Silakan masukkan key lisensi Anda.")`,
    backup_content: `-- Backup Key System Loader\n-- Disimpan sebagai cadangan aman`,
    script_type: 'loader',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'f1a10001-0001-4000-8000-000000000002',
    name: 'main',
    display_name: 'Main Script',
    description: 'Script utama berisi semua fitur tool Arexans',
    content: `-- ============================================================
-- AREXANS TOOLS — MAIN SCRIPT
-- Endpoint: /get-script?name=main
-- Script utama berisi fitur-fitur tool, UI hub, dan modul
-- ============================================================
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local Character = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()

print("[ArexansTools] Main script loaded successfully!")

-- Muat UI Library jika tersedia
local UILibrary = nil
pcall(function()
    local libSrc = game:HttpGet("https://tools.arexans.my.id/api/get-script?name=library&raw=1")
    if libSrc and libSrc ~= "" then
        UILibrary = (loadstring or load)(libSrc, "=ArexansUILibrary")()
    end
end)

-- Hub Notification
pcall(function()
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Arexans Tools",
        Text = "Main Script berhasil diaktifkan! Selamat bermain.",
        Duration = 6
    })
end)

_G.Arexans_Loaded = true`,
    backup_content: `-- Backup Main Script\n-- Disimpan sebagai cadangan aman`,
    script_type: 'main',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'f1a10001-0001-4000-8000-000000000003',
    name: 'library',
    display_name: 'UI Library',
    description: 'Library Lua untuk komponen UI yang dipakai bersama',
    content: `-- ============================================================
-- AREXANS TOOLS — UI LIBRARY
-- Endpoint: /get-script?name=library
-- Library komponen UI yang dipakai bersama (Windows, Tabs, Buttons)
-- ============================================================
local UI = {}
local CoreGui = game:GetService("CoreGui")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

UI.createWindow = function(title)
    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "ArexansUI_" .. tostring(math.random(1000, 9999))
    ScreenGui.ResetOnSpawn = false
    
    pcall(function()
        ScreenGui.Parent = CoreGui
    end)
    if not ScreenGui.Parent then
        ScreenGui.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
    end
    
    local MainFrame = Instance.new("Frame", ScreenGui)
    MainFrame.Size = UDim2.new(0, 500, 0, 340)
    MainFrame.Position = UDim2.new(0.5, -250, 0.5, -170)
    MainFrame.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
    MainFrame.BorderSizePixel = 0
    Instance.new("UICorner", MainFrame).CornerRadius = UDim.new(0, 10)
    
    local Title = Instance.new("TextLabel", MainFrame)
    Title.Size = UDim2.new(1, -20, 0, 36)
    Title.Position = UDim2.new(0, 15, 0, 0)
    Title.BackgroundTransparency = 1
    Title.Text = title or "Arexans Tools"
    Title.TextColor3 = Color3.fromRGB(0, 220, 255)
    Title.Font = Enum.Font.GothamBold
    Title.TextSize = 16
    Title.TextXAlignment = Enum.TextXAlignment.Left
    
    return {
        Gui = ScreenGui,
        Frame = MainFrame,
        Destroy = function() ScreenGui:Destroy() end
    }
end

UI.showNotification = function(text, duration)
    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", {
            Title = "Arexans Tools",
            Text = tostring(text or ""),
            Duration = duration or 5
        })
    end)
end

return UI`,
    backup_content: `-- Backup UI Library\n-- Disimpan sebagai cadangan aman`,
    script_type: 'library',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'f1a10001-0001-4000-8000-000000000004',
    name: 'game',
    display_name: 'Game Script',
    description: 'Script khusus per-game/map (fitur spesifik gameplay)',
    content: `-- ============================================================
-- AREXANS TOOLS — GAME SCRIPT
-- Endpoint: /get-script?name=game
-- Script khusus per-game/map (fitur spesifik gameplay)
-- ============================================================
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

print("[ArexansTools] Game Script initialized for PlaceId: " .. tostring(game.PlaceId))

local GameFeatures = {
    AutoFarm = false,
    SpeedMultiplier = 1,
    ESP = false
}

function GameFeatures:ToggleAutoFarm(enable)
    self.AutoFarm = enable
    print("[ArexansTools] AutoFarm: " .. tostring(enable))
end

return GameFeatures`,
    backup_content: `-- Backup Game Script\n-- Disimpan sebagai cadangan aman`,
    script_type: 'game',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const DISK_STORE_PATH = typeof process !== 'undefined' && process.cwd ? `${process.cwd()}/.db_mock_store.json` : '';

function loadDiskStore(): Record<string, any[]> | null {
  try {
    if (DISK_STORE_PATH && fs.existsSync(DISK_STORE_PATH)) {
      const raw = fs.readFileSync(DISK_STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export function saveDiskStore() {
  try {
    if (DISK_STORE_PATH && global._inMemoryTables) {
      const obj: Record<string, any[]> = {};
      for (const [k, v] of global._inMemoryTables.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(DISK_STORE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
    }
  } catch {}
}

function getTables(): Map<string, any[]> {
  if (!global._inMemoryTables) {
    global._inMemoryTables = new Map<string, any[]>();
    const saved = loadDiskStore();

    global._inMemoryTables.set('packages', saved?.packages || [...DEFAULT_PACKAGES]);
    global._inMemoryTables.set('app_settings', saved?.app_settings || [...DEFAULT_SETTINGS]);
    global._inMemoryTables.set('ads', saved?.ads || []);
    global._inMemoryTables.set('backgrounds', saved?.backgrounds || []);
    global._inMemoryTables.set('blocked_ips', saved?.blocked_ips || []);
    global._inMemoryTables.set('developer_access_logs', saved?.developer_access_logs || []);
    global._inMemoryTables.set('duration_codes', saved?.duration_codes || []);
    global._inMemoryTables.set('lua_recording_events', saved?.lua_recording_events || []);
    global._inMemoryTables.set('lua_recordings', saved?.lua_recordings || []);
    global._inMemoryTables.set('lua_script_versions', saved?.lua_script_versions || []);
    
    // Pastikan 4 script inti (keysystem, main, library, game) selalu ada
    const loadedScripts: any[] = saved?.lua_scripts ? [...saved.lua_scripts] : [];
    for (const def of DEFAULT_LUA_SCRIPTS) {
      const exists = loadedScripts.some(s => s.name?.toLowerCase() === def.name.toLowerCase());
      if (!exists) {
        loadedScripts.push({ ...def });
      }
    }
    global._inMemoryTables.set('lua_scripts', loadedScripts);

    global._inMemoryTables.set('lua_teleports', saved?.lua_teleports || []);
    global._inMemoryTables.set('package_discounts', saved?.package_discounts || []);
    global._inMemoryTables.set('social_links', saved?.social_links || []);
    global._inMemoryTables.set('transactions', saved?.transactions || []);
    global._inMemoryTables.set('users', saved?.users || []);
    global._inMemoryTables.set('xcoins_balances', saved?.xcoins_balances || []);
    global._inMemoryTables.set('xcoins_otp', saved?.xcoins_otp || []);
    global._inMemoryTables.set('xcoins_transactions', saved?.xcoins_transactions || []);
    global._inMemoryTables.set('admin_sessions', saved?.admin_sessions || []);
  }
  return global._inMemoryTables;
}

function normalizeTableName(raw: string): string {
  return raw.replace(/["']/g, '').trim().toLowerCase();
}

export function executeMockQuery(sqlText: string, values: any[] = []): { rows: any[]; rowCount: number } {
  const tables = getTables();
  const trimmed = sqlText.trim();

  // 1. SELECT COUNT(*)
  const countMatch = trimmed.match(/SELECT\s+COUNT\(\*\)\s+FROM\s+(["']?[a-zA-Z0-9_]+["']?)(?:\s+WHERE\s+(.*))?/i);
  if (countMatch) {
    const tableName = normalizeTableName(countMatch[1]);
    const items = tables.get(tableName) || [];
    return { rows: [{ count: String(items.length) }], rowCount: 1 };
  }

  // 2. SELECT
  const selectMatch = trimmed.match(/SELECT\s+(.*?)\s+FROM\s+(["']?[a-zA-Z0-9_]+["']?)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+|\$\d+))?(?:\s+OFFSET\s+(\d+|\$\d+))?$/i);
  if (selectMatch) {
    const selectCols = selectMatch[1].trim();
    const tableName = normalizeTableName(selectMatch[2]);
    const whereClause = selectMatch[3]?.trim();
    const orderClause = selectMatch[4]?.trim();
    const limitClause = selectMatch[5]?.trim();
    const offsetClause = selectMatch[6]?.trim();

    let items = [...(tables.get(tableName) || [])];

    if (whereClause) {
      // Handle IN filters: col IN ('a', 'b', 'c') OR col IN ($1, $2, $3)
      const inMatches = [...whereClause.matchAll(/(?:["']?([a-zA-Z0-9_]+)["']?)\s+IN\s*\((.*?)\)/gi)];
      for (const inM of inMatches) {
        const col = inM[1].toLowerCase();
        const allowedVals = inM[2].split(',').map(s => {
          const raw = s.trim();
          if (raw.startsWith('$')) {
            const idx = parseInt(raw.slice(1), 10) - 1;
            return String(values[idx] || '').toLowerCase();
          }
          return raw.replace(/^['"]|['"]$/g, '').toLowerCase();
        });
        items = items.filter(item => {
          const val = String(item[col] ?? item[inM[1]] ?? '').toLowerCase();
          return allowedVals.includes(val);
        });
      }

      // Handle simple equality filters: col = $1 or col = 'value'
      const eqMatches = [...whereClause.matchAll(/(?:["']?([a-zA-Z0-9_]+)["']?)\s*=\s*(?:\$(\d+)|'([^']*)'|(\S+))/gi)];
      for (const eq of eqMatches) {
        const col = eq[1].toLowerCase();
        let targetVal: any = undefined;
        if (eq[2]) {
          const idx = parseInt(eq[2], 10) - 1;
          targetVal = values[idx];
        } else if (eq[3] !== undefined) {
          targetVal = eq[3];
        } else if (eq[4] !== undefined) {
          targetVal = eq[4] === 'true' ? true : eq[4] === 'false' ? false : eq[4];
        }

        if (targetVal !== undefined) {
          items = items.filter(item => {
            const val = item[col] ?? item[eq[1]];
            return String(val).toLowerCase() === String(targetVal).toLowerCase();
          });
        }
      }
    }

    if (orderClause) {
      const orderParts = orderClause.split(',').map(p => p.trim());
      for (const part of orderParts) {
        const [colRaw, dirRaw] = part.split(/\s+/);
        const col = colRaw.replace(/["']/g, '');
        const isDesc = (dirRaw || '').toUpperCase() === 'DESC';
        items.sort((a, b) => {
          const vA = a[col] ?? 0;
          const vB = b[col] ?? 0;
          if (vA < vB) return isDesc ? 1 : -1;
          if (vA > vB) return isDesc ? -1 : 1;
          return 0;
        });
      }
    }

    if (offsetClause) {
      const offset = parseInt(offsetClause, 10);
      if (!isNaN(offset)) items = items.slice(offset);
    }

    if (limitClause) {
      const limit = parseInt(limitClause, 10);
      if (!isNaN(limit)) items = items.slice(0, limit);
    }

    if (selectCols !== '*' && !selectCols.includes('(')) {
      const cols = selectCols.split(',').map(c => c.trim().replace(/["']/g, ''));
      items = items.map(item => {
        const projected: any = {};
        for (const c of cols) {
          projected[c] = item[c];
        }
        return projected;
      });
    }

    return { rows: items, rowCount: items.length };
  }

  // 3. INSERT INTO
  if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
    const tableM = trimmed.match(/INSERT\s+INTO\s+([\"']?[a-zA-Z0-9_]+[\"']?)/i);
    if (tableM) {
      const tableName = normalizeTableName(tableM[1]);
      const colsM = trimmed.match(/INSERT\s+INTO\s+[^\(]+\(([\s\S]*?)\)\s*VALUES/i);
      if (colsM) {
        const cols = colsM[1].split(',').map(c => c.trim().replace(/[\"']/g, ''));
        const valuesStart = trimmed.toUpperCase().indexOf('VALUES');
        const afterValues = trimmed.slice(valuesStart + 6).trim();

        let parenDepth = 0;
        let startIdx = -1;
        let endIdx = -1;
        for (let i = 0; i < afterValues.length; i++) {
          if (afterValues[i] === '(') {
            if (parenDepth === 0) startIdx = i;
            parenDepth++;
          } else if (afterValues[i] === ')') {
            parenDepth--;
            if (parenDepth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        if (startIdx !== -1 && endIdx !== -1) {
          const valuesStr = afterValues.slice(startIdx + 1, endIdx);
          
          // Helper to split SQL tokens respecting quotes and parens
          const valTokens: string[] = [];
          let current = '';
          let inQuote = false;
          let quoteChar = '';
          let depth = 0;
          for (let i = 0; i < valuesStr.length; i++) {
            const ch = valuesStr[i];
            if (inQuote) {
              current += ch;
              if (ch === quoteChar) {
                if (valuesStr[i + 1] === quoteChar) {
                  current += quoteChar;
                  i++;
                } else {
                  inQuote = false;
                }
              }
            } else {
              if (ch === "'" || ch === '"') {
                inQuote = true;
                quoteChar = ch;
                current += ch;
              } else if (ch === '(') {
                depth++;
                current += ch;
              } else if (ch === ')') {
                depth--;
                current += ch;
              } else if (ch === ',' && depth === 0) {
                valTokens.push(current.trim());
                current = '';
              } else {
                current += ch;
              }
            }
          }
          if (current.trim().length > 0) valTokens.push(current.trim());

          const conflictM = trimmed.match(/ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s*([\s\S]*?)(?:\s+RETURNING|\s*$)/i);
          const conflictCol = conflictM ? conflictM[1].trim().replace(/[\"']/g, '') : null;

          const newRow: any = {};
          cols.forEach((col, i) => {
            const token = valTokens[i];
            if (token && token.startsWith('$')) {
              const valIdx = parseInt(token.slice(1), 10) - 1;
              newRow[col] = values[valIdx];
            } else if (token && token.toLowerCase() === 'now()') {
              newRow[col] = new Date().toISOString();
            } else {
              newRow[col] = token?.replace(/^'|'$/g, '');
            }
          });

          if (!newRow.id) {
            newRow.id = Math.random().toString(36).substring(2, 10) + '-' + Date.now();
          }
          if (!newRow.created_at) {
            newRow.created_at = new Date().toISOString();
          }
          newRow.updated_at = new Date().toISOString();

          let items = tables.get(tableName);
          if (!items) {
            items = [];
            tables.set(tableName, items);
          }

          if (conflictCol) {
            const existingIdx = items.findIndex(item => String(item[conflictCol] ?? item[conflictCol.toLowerCase()]).toLowerCase() === String(newRow[conflictCol] ?? newRow[conflictCol.toLowerCase()]).toLowerCase());
            if (existingIdx >= 0) {
              items[existingIdx] = { ...items[existingIdx], ...newRow };
              // Remove any stale duplicate rows with the same key
              const filtered = items.filter((item, idx) => idx === existingIdx || String(item[conflictCol] ?? item[conflictCol.toLowerCase()]).toLowerCase() !== String(newRow[conflictCol] ?? newRow[conflictCol.toLowerCase()]).toLowerCase());
              tables.set(tableName, filtered);
              saveDiskStore();
              return { rows: [items[existingIdx]], rowCount: 1 };
            }
          }

          items.push(newRow);
          saveDiskStore();
          return { rows: [newRow], rowCount: 1 };
        }
      }
    }
  }

  // 4. UPDATE
  const updateMatch = trimmed.match(/UPDATE\s+(["']?[a-zA-Z0-9_]+["']?)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*?))?(?:\s+RETURNING\s+.*)?$/i);
  if (updateMatch) {
    const tableName = normalizeTableName(updateMatch[1]);
    const setClause = updateMatch[2].trim();
    const whereClause = updateMatch[3]?.trim();

    const items = tables.get(tableName) || [];
    const setPairs = setClause.split(',').map(p => p.trim());
    const updates: Record<string, any> = {};

    for (const pair of setPairs) {
      const [colRaw, valTokenRaw] = pair.split('=').map(s => s.trim());
      const col = colRaw.replace(/["']/g, '');
      if (valTokenRaw.startsWith('$')) {
        const valIdx = parseInt(valTokenRaw.slice(1), 10) - 1;
        updates[col] = values[valIdx];
      } else {
        updates[col] = valTokenRaw.replace(/^'|'$/g, '');
      }
    }

    const updatedRows: any[] = [];
    for (let i = 0; i < items.length; i++) {
      let matches = true;
      if (whereClause) {
        const eqMatches = [...whereClause.matchAll(/(?:["']?([a-zA-Z0-9_]+)["']?)\s*=\s*(?:\$(\d+)|'([^']*)')/gi)];
        for (const eq of eqMatches) {
          const col = eq[1].toLowerCase();
          const targetVal = eq[2] ? values[parseInt(eq[2], 10) - 1] : eq[3];
          if (String(items[i][col] ?? items[i][eq[1]]).toLowerCase() !== String(targetVal).toLowerCase()) {
            matches = false;
            break;
          }
        }
      }
      if (matches) {
        items[i] = { ...items[i], ...updates, updated_at: new Date().toISOString() };
        updatedRows.push(items[i]);
      }
    }
    if (updatedRows.length > 0) saveDiskStore();
    return { rows: updatedRows, rowCount: updatedRows.length };
  }

  // 5. DELETE
  const deleteMatch = trimmed.match(/DELETE\s+FROM\s+(["']?[a-zA-Z0-9_]+["']?)(?:\s+WHERE\s+(.*?))?$/i);
  if (deleteMatch) {
    const tableName = normalizeTableName(deleteMatch[1]);
    const whereClause = deleteMatch[2]?.trim();
    let items = tables.get(tableName) || [];
    const origCount = items.length;

    if (whereClause) {
      const eqMatches = [...whereClause.matchAll(/(?:["']?([a-zA-Z0-9_]+)["']?)\s*=\s*(?:\$(\d+)|'([^']*)')/gi)];
      items = items.filter(item => {
        for (const eq of eqMatches) {
          const col = eq[1].toLowerCase();
          const targetVal = eq[2] ? values[parseInt(eq[2], 10) - 1] : eq[3];
          if (String(item[col] ?? item[eq[1]]).toLowerCase() === String(targetVal).toLowerCase()) {
            return false;
          }
        }
        return true;
      });
      tables.set(tableName, items);
    } else {
      tables.set(tableName, []);
    }
    saveDiskStore();
    return { rows: [], rowCount: origCount - items.length };
  }

  return { rows: [], rowCount: 0 };
}

function createMockPool(): any {
  return {
    async query(sqlOrObj: any, values: any[] = []) {
      const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : (sqlOrObj?.text || '');
      const vals = Array.isArray(sqlOrObj?.values) ? sqlOrObj.values : values;
      return executeMockQuery(sqlText, vals);
    },
    async connect() {
      return {
        query: async (sqlOrObj: any, values: any[] = []) => {
          const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : (sqlOrObj?.text || '');
          const vals = Array.isArray(sqlOrObj?.values) ? sqlOrObj.values : values;
          return executeMockQuery(sqlText, vals);
        },
        release() {}
      };
    },
    on(_event: string, _callback: (...args: any[]) => void) {
      return this;
    },
    async end() {}
  };
}

let _useMockDirectly = false;

export const createPool = () => {
  if (!global._postgresPool) {
    const connStr = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
    const isRealConnStr = Boolean(connStr && !connStr.includes('@host:') && !connStr.includes('your-host') && !connStr.includes('user:password'));
    const isRealSqlHost = Boolean(process.env.SQL_HOST && process.env.SQL_PASSWORD && process.env.SQL_PASSWORD.trim().length > 0);

    if (isRealConnStr || isRealSqlHost) {
      const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
      const realPool = isRealConnStr
        ? new Pool({
            connectionString: connStr,
            ssl: isLocal ? false : { rejectUnauthorized: false },
            max: 10,
            connectionTimeoutMillis: 3000,
          })
        : new Pool({
            host: process.env.SQL_HOST,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD || '',
            database: process.env.SQL_DB_NAME,
            max: 10,
            connectionTimeoutMillis: 3000,
          });

      realPool.on('error', (err) => {
        _useMockDirectly = true;
      });

      const mock = createMockPool();
      global._postgresPool = new Proxy(realPool, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return async (...args: any[]) => {
              if (_useMockDirectly) {
                return mock.query(...args);
              }
              try {
                return await (target as any).query(...args);
              } catch {
                _useMockDirectly = true;
                return mock.query(...args);
              }
            };
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    } else {
      global._postgresPool = createMockPool();
    }
  }
  return global._postgresPool;
};

const pool = createPool();

let dbInstance: any;
try {
  dbInstance = drizzle(pool, { schema });
} catch {
  console.warn('[AI Studio] Database not connected — using mock ORM proxy');
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({})
  };
  dbInstance = new Proxy({}, {
    get: (_, prop) => prop === 'query' ? new Proxy({}, { get: () => noOp }) : async () => [],
  });
}

export const db = dbInstance;
