import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
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
    id: 'arexanspay_api_key',
    key: 'arexanspay_api_key',
    value: 'arexanspay_f63fa727bda01551084e5c87bde526aeb68e1c471ff89fa36d2748b8c25156a3',
    description: 'API Key resmi ArexansPay Gateway',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'arexanspay_qris_id',
    key: 'arexanspay_qris_id',
    value: 'axspay-duqwono-h3sq-au0s-5h26-v7m2d1oy3c32',
    description: 'QRIS ID resmi ArexansPay Gateway',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'arexanspay_webhook_key',
    key: 'arexanspay_webhook_key',
    value: 'arexanspay_8d9f4138e8cc08891ee97d7f4e5dcd965ab950d240283c4fb245d17876c50927226cd438ec51dee106ecdb1591ce53f99bc3c62d725205857b285ebce3019cd9',
    description: 'Webhook Key resmi ArexansPay Gateway',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'arexanspay_enabled',
    key: 'arexanspay_enabled',
    value: 'true',
    description: 'Status aktif ArexansPay',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'developer_device_online',
    key: 'developer_device_online',
    value: 'true',
    description: 'Status online perangkat ArexansPay',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'developer_last_seen',
    key: 'developer_last_seen',
    value: Date.now().toString(),
    description: 'Timestamp heartbeat terakhir perangkat ArexansPay',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'heartbeat_timeout_seconds',
    key: 'heartbeat_timeout_seconds',
    value: '180',
    description: 'Ambang batas timeout heartbeat (detik)',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'payment_gateway_settings',
    key: 'payment_gateway_settings',
    value: JSON.stringify({ provider: 'arexanspay' }),
    description: 'Setting Payment Gateway',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'enabled_gateways',
    key: 'enabled_gateways',
    value: JSON.stringify(['arexanspay', 'xmpayment', 'poketo']),
    description: 'Gateway aktif',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'payment_gateway',
    key: 'payment_gateway',
    value: 'all',
    description: 'Pilihan Gateway',
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

function readAssetScript(filenames: string[]): string {
  try {
    for (const name of filenames) {
      const fullPath = path.isAbsolute(name) ? name : path.join(process.cwd(), 'public/assets/aistudio', name);
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf-8');
      }
    }
  } catch (err) {
    console.warn('[AI Studio] Failed to read asset script:', filenames, err);
  }
  return '';
}

export function getDefaultLuaScripts() {
  const keysystemContent = readAssetScript(['keysystem.lua', 'keysistem_268e5b11.lua']);
  const mainContent = readAssetScript(['Arexanstools.lua', 'Arexanstools_9fe42648.lua']);
  const libraryContent = readAssetScript(['UILibrary.lua', 'UILibrary_46217af3.lua']);
  const gameContent = readAssetScript(['games.lua', 'games_78935dd9.lua']);

  return [
    {
      id: 'f1a10001-0001-4000-8000-000000000001',
      name: 'keysystem',
      display_name: 'keysystem.lua',
      description: 'Script Key System Loader (keysystem.lua)',
      content: keysystemContent,
      backup_content: `-- Backup keysystem.lua\n` + keysystemContent,
      script_type: 'loader',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'f1a10001-0001-4000-8000-000000000002',
      name: 'main',
      display_name: 'Arexanstools.lua',
      description: 'Script Utama Arexans Tools (Arexanstools.lua)',
      content: mainContent,
      backup_content: `-- Backup Arexanstools.lua\n` + mainContent,
      script_type: 'main',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'f1a10001-0001-4000-8000-000000000003',
      name: 'library',
      display_name: 'UILibrary.lua',
      description: 'UI Library Komponen (UILibrary.lua)',
      content: libraryContent,
      backup_content: `-- Backup UILibrary.lua\n` + libraryContent,
      script_type: 'library',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'f1a10001-0001-4000-8000-000000000004',
      name: 'game',
      display_name: 'games.lua',
      description: 'Game Script Koleksi Game (games.lua)',
      content: gameContent,
      backup_content: `-- Backup games.lua\n` + gameContent,
      script_type: 'game',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
}

export const DEFAULT_LUA_SCRIPTS = getDefaultLuaScripts();

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

export function getTables(): Map<string, any[]> {
  if (!global._inMemoryTables) {
    global._inMemoryTables = new Map<string, any[]>();
    const saved = loadDiskStore();

    global._inMemoryTables.set('packages', saved?.packages || [...DEFAULT_PACKAGES]);
    const loadedAppSettings: any[] = saved?.app_settings ? [...saved.app_settings] : [];
    for (const def of DEFAULT_SETTINGS) {
      const idx = loadedAppSettings.findIndex(s => s.key === def.key);
      if (idx === -1) {
        loadedAppSettings.push({ ...def });
      } else if ((!loadedAppSettings[idx].value || loadedAppSettings[idx].value === '') && def.value) {
        loadedAppSettings[idx].value = def.value;
      }
    }
    global._inMemoryTables.set('app_settings', loadedAppSettings);
    global._inMemoryTables.set('ads', saved?.ads || []);
    global._inMemoryTables.set('backgrounds', saved?.backgrounds || []);
    global._inMemoryTables.set('blocked_ips', saved?.blocked_ips || []);
    global._inMemoryTables.set('developer_access_logs', saved?.developer_access_logs || []);
    global._inMemoryTables.set('duration_codes', saved?.duration_codes || []);
    global._inMemoryTables.set('lua_recording_events', saved?.lua_recording_events || []);
    global._inMemoryTables.set('lua_recordings', saved?.lua_recordings || []);
    global._inMemoryTables.set('lua_script_versions', saved?.lua_script_versions || []);
    
    // Pastikan 4 script inti (keysystem, main, library, game) selalu diisi dengan file asli
    const defaultScripts = getDefaultLuaScripts();
    const loadedScripts: any[] = saved?.lua_scripts ? [...saved.lua_scripts] : [];
    for (const def of defaultScripts) {
      const existingIdx = loadedScripts.findIndex(s => s.name?.toLowerCase() === def.name.toLowerCase());
      if (existingIdx === -1) {
        loadedScripts.push({ ...def });
      } else {
        // Selalu pastikan 4 default script Arexans Tools sinkron dengan file asli dari user
        if (!loadedScripts[existingIdx].content || loadedScripts[existingIdx].content.length < 5000 || loadedScripts[existingIdx].display_name !== def.display_name) {
          loadedScripts[existingIdx] = {
            ...loadedScripts[existingIdx],
            display_name: def.display_name,
            description: def.description,
            content: def.content,
            backup_content: def.backup_content,
            updated_at: new Date().toISOString()
          };
        }
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
