import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
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

function getTables(): Map<string, any[]> {
  if (!global._inMemoryTables) {
    global._inMemoryTables = new Map<string, any[]>();
    global._inMemoryTables.set('packages', [...DEFAULT_PACKAGES]);
    global._inMemoryTables.set('app_settings', [...DEFAULT_SETTINGS]);
    global._inMemoryTables.set('ads', []);
    global._inMemoryTables.set('backgrounds', []);
    global._inMemoryTables.set('blocked_ips', []);
    global._inMemoryTables.set('developer_access_logs', []);
    global._inMemoryTables.set('duration_codes', []);
    global._inMemoryTables.set('lua_recording_events', []);
    global._inMemoryTables.set('lua_recordings', []);
    global._inMemoryTables.set('lua_script_versions', []);
    global._inMemoryTables.set('lua_scripts', []);
    global._inMemoryTables.set('lua_teleports', []);
    global._inMemoryTables.set('package_discounts', []);
    global._inMemoryTables.set('social_links', []);
    global._inMemoryTables.set('transactions', []);
    global._inMemoryTables.set('users', []);
    global._inMemoryTables.set('xcoins_balances', []);
    global._inMemoryTables.set('xcoins_otp', []);
    global._inMemoryTables.set('xcoins_transactions', []);
    global._inMemoryTables.set('admin_sessions', []);
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
  const insertMatch = trimmed.match(/INSERT\s+INTO\s+(["']?[a-zA-Z0-9_]+["']?)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)(?:\s+ON\s+CONFLICT\s*\((.*?)\)\s*DO\s+UPDATE\s+SET\s*(.*?))?(?:\s+RETURNING\s+.*)?$/i);
  if (insertMatch) {
    const tableName = normalizeTableName(insertMatch[1]);
    const cols = insertMatch[2].split(',').map(c => c.trim().replace(/["']/g, ''));
    const valTokens = insertMatch[3].split(',').map(v => v.trim());
    const conflictCol = insertMatch[4]?.trim().replace(/["']/g, '');

    const newRow: any = {};
    cols.forEach((col, i) => {
      const token = valTokens[i];
      if (token && token.startsWith('$')) {
        const valIdx = parseInt(token.slice(1), 10) - 1;
        newRow[col] = values[valIdx];
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
      const existingIdx = items.findIndex(item => String(item[conflictCol]) === String(newRow[conflictCol]));
      if (existingIdx >= 0) {
        items[existingIdx] = { ...items[existingIdx], ...newRow };
        return { rows: [items[existingIdx]], rowCount: 1 };
      }
    }

    items.push(newRow);
    return { rows: [newRow], rowCount: 1 };
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

export const createPool = () => {
  if (!global._postgresPool) {
    const connStr = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
    const isRealConnStr = Boolean(connStr && !connStr.includes('@host:') && !connStr.includes('your-host'));

    if (isRealConnStr) {
      const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
      const realPool = new Pool({
        connectionString: connStr,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 5000,
      });

      realPool.on('error', (err) => {
        console.error('Unexpected error on idle SQL pool client:', err);
      });

      // Wrap with fallback to in-memory mock if connection fails
      const mock = createMockPool();
      global._postgresPool = new Proxy(realPool, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return async (...args: any[]) => {
              try {
                return await (target as any).query(...args);
              } catch (e: any) {
                console.warn('[AI Studio] PostgreSQL query failed, using in-memory mock:', e.message);
                return mock.query(...args);
              }
            };
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    } else if (process.env.SQL_HOST) {
      const realPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD || '',
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 5000,
      });

      realPool.on('error', (err) => {
        console.error('Unexpected error on idle SQL pool client:', err);
      });

      const mock = createMockPool();
      global._postgresPool = new Proxy(realPool, {
        get(target, prop, receiver) {
          if (prop === 'query') {
            return async (...args: any[]) => {
              try {
                return await (target as any).query(...args);
              } catch (e: any) {
                console.warn('[AI Studio] PostgreSQL query failed, using in-memory mock:', e.message);
                return mock.query(...args);
              }
            };
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    } else {
      console.log('[AI Studio] Running in-memory database mock (no external SQL connection string set).');
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
