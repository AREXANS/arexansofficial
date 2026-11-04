import { Pool } from 'pg';

declare global {
  var _arexansLastSeen: number | undefined;
  var _arexansDeviceInfo: any | undefined;
  var _arexansPool: Pool | undefined;
}

function getPool(): Pool | null {
  if (globalThis._arexansPool) return globalThis._arexansPool;
  const connStr = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
  if (!connStr || connStr.includes('@host:') || connStr.includes('user:password')) {
    return null;
  }
  try {
    const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
    globalThis._arexansPool = new Pool({
      connectionString: connStr,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 2000,
    });
    return globalThis._arexansPool;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const now = Date.now();
  const TIMEOUT_SECONDS = 180; // 3 menit
  const STALE_MS = TIMEOUT_SECONDS * 1000;

  let lastSeen = globalThis._arexansLastSeen ?? null;
  let deviceInfo = globalThis._arexansDeviceInfo ?? null;

  // Check PostgreSQL if pool exists
  const pool = getPool();
  if (pool) {
    try {
      const q = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('developer_last_seen', 'arexanspay_device_info', 'developer_device_online')"
      );
      const map: Record<string, string> = {};
      (q.rows || []).forEach((r: any) => { map[r.key] = r.value; });
      if (map.developer_last_seen) {
        const parsed = parseInt(map.developer_last_seen, 10);
        if (!isNaN(parsed)) lastSeen = parsed;
      }
      if (map.arexanspay_device_info) {
        try { deviceInfo = JSON.parse(map.arexanspay_device_info); } catch {}
      }
    } catch {}
  }

  // If no heartbeat recorded in this instance yet, default lastSeen to recent so user doesn't flicker offline
  if (!lastSeen) {
    lastSeen = now;
  }

  const diffMs = now - lastSeen;
  const isOnline = lastSeen > 0 && diffMs < STALE_MS;

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  return res.end(JSON.stringify({
    success: true,
    ok: true,
    online: isOnline,
    developer_online: isOnline,
    last_seen: lastSeen,
    last_seen_seconds_ago: lastSeen ? Math.max(0, Math.round(diffMs / 1000)) : null,
    timeout_threshold_seconds: TIMEOUT_SECONDS,
    device_info: deviceInfo || {
      device_name: 'HP Owner (ArexansPay APK)',
      status: isOnline ? 'online' : 'offline',
      network: 'ONLINE'
    }
  }));
}
