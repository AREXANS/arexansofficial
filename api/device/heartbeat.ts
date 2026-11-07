import { Pool } from 'pg';

// Global cache in serverless runtime instance
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
      connectionTimeoutMillis: 2500,
    });
    return globalThis._arexansPool;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  // Setup standard CORS headers for mobile app, Tasker, and web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    let body: any = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        try { body = JSON.parse(req.body); } catch { body = {}; }
      } else if (typeof req.body === 'object') {
        body = req.body;
      }
    } else {
      // Buffer body if not auto-parsed by Vercel
      const raw = await new Promise<string>((resolve) => {
        let str = '';
        req.on('data', (c: any) => { str += c; });
        req.on('end', () => resolve(str));
        req.on('error', () => resolve(''));
      });
      if (raw) {
        try { body = JSON.parse(raw); } catch { body = {}; }
      }
    }

    const query = req.query || {};
    const status = String(body.status || query.status || 'online').toLowerCase();
    const now = Date.now();
    const clientIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.socket?.remoteAddress || '127.0.0.1';

    const isOffline = status === 'offline';
    const lastSeenVal = isOffline ? 0 : now;

    const deviceInfo = {
      device_id: body.device_id || body.deviceId || query.device_id || 'arexans-apk-phone',
      device_name: body.device_name || body.deviceName || body.device || query.device_name || 'HP Owner (ArexansPay APK)',
      battery: body.battery ?? body.battery_level ?? (query.battery ? parseInt(String(query.battery), 10) : 100),
      network: body.network ?? body.network_type ?? query.network ?? 'ONLINE',
      ip: clientIp,
      status: isOffline ? 'offline' : 'online',
      last_seen: lastSeenVal,
      last_ping: new Date().toISOString(),
    };

    // Cache in serverless global state
    globalThis._arexansLastSeen = lastSeenVal;
    globalThis._arexansDeviceInfo = deviceInfo;

    // Persist to PostgreSQL if database connection is available
    const pool = getPool();
    if (pool) {
      try {
        await Promise.all([
          pool.query(
            "INSERT INTO app_settings (id, key, value, updated_at) VALUES ('developer_last_seen', 'developer_last_seen', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
            [lastSeenVal.toString()]
          ),
          pool.query(
            "INSERT INTO app_settings (id, key, value, updated_at) VALUES ('developer_device_online', 'developer_device_online', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
            [isOffline ? 'false' : 'true']
          ),
          pool.query(
            "INSERT INTO app_settings (id, key, value, updated_at) VALUES ('arexanspay_device_info', 'arexanspay_device_info', $1, now()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
            [JSON.stringify(deviceInfo)]
          ),
        ]);
      } catch (dbErr) {
        console.warn('Could not persist heartbeat to PostgreSQL:', dbErr);
      }
    }



    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: true,
      ok: true,
      status: isOffline ? 'offline' : 'online',
      online: !isOffline,
      developer_online: !isOffline,
      message: isOffline 
        ? 'Perangkat diset OFFLINE.' 
        : 'Sinyal heartbeat ArexansPay APK berhasil diterima! Perangkat terdeteksi ONLINE di web.',
      timestamp: now,
      ts: now,
      timeout_threshold_seconds: 180,
      device: deviceInfo
    }));
  } catch (err: any) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: true,
      ok: true,
      online: true,
      timestamp: Date.now(),
      error: err?.message || 'Warning processed with fallback'
    }));
  }
}
