import { createPool } from '../db/index.ts';

// Helper to sanitize identifier names (table/column) to prevent SQL injection
function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

// Map of allowed tables
const ALLOWED_TABLES = new Set([
  'admin_sessions',
  'ads',
  'app_settings',
  'backgrounds',
  'blocked_ips',
  'developer_access_logs',
  'duration_codes',
  'lua_recording_events',
  'lua_recordings',
  'lua_script_versions',
  'lua_scripts',
  'lua_teleports',
  'package_discounts',
  'packages',
  'social_links',
  'transactions',
  'users',
  'xcoins_balances',
  'xcoins_otp',
  'xcoins_transactions',
]);

// Handle /auth/v1/* requests with valid JSON so gotrue client never receives HTML 200
export function handleAuthRequest(req: any, res: any): boolean {
  const urlStr = req.url || '';
  const pathname = urlStr.split('?')[0] || '';
  if (!pathname.startsWith('/auth/v1/')) return false;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method?.toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ user: null, session: null }));
  return true;
}

export async function handleRestRequest(req: any, res: any): Promise<boolean> {
  const urlStr = req.url || '';
  const pathname = urlStr.split('?')[0] || '';

  // Match /rest/v1/:table
  const match = pathname.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)/);
  if (!match) return false;

  const tableName = match[1];
  if (!ALLOWED_TABLES.has(tableName)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Table '${tableName}' not found or not allowed` }));
    return true;
  }

  const pool = createPool();
  const searchParams = new URL(urlStr, 'http://localhost').searchParams;
  const method = req.method?.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    if (method === 'GET') {
      const selectParam = searchParams.get('select') || '*';
      const orderParam = searchParams.get('order');
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');
      const preferHeader = req.headers['prefer'] || '';

      const whereClauses: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      // Parse filter parameters (e.g. key=eq.abc, status=in.(a,b))
      searchParams.forEach((paramValue, paramKey) => {
        if (['select', 'order', 'limit', 'offset', 'apikey'].includes(paramKey)) return;

        const col = sanitizeIdentifier(paramKey);
        if (paramValue.startsWith('eq.')) {
          const rawVal = paramValue.slice(3);
          if (rawVal === 'true') {
            whereClauses.push(`${col} = true`);
          } else if (rawVal === 'false') {
            whereClauses.push(`${col} = false`);
          } else if (rawVal === 'null') {
            whereClauses.push(`${col} IS NULL`);
          } else {
            whereClauses.push(`${col} = $${valIdx++}`);
            values.push(rawVal);
          }
        } else if (paramValue.startsWith('neq.')) {
          const rawVal = paramValue.slice(4);
          whereClauses.push(`${col} != $${valIdx++}`);
          values.push(rawVal);
        } else if (paramValue.startsWith('gt.')) {
          whereClauses.push(`${col} > $${valIdx++}`);
          values.push(paramValue.slice(3));
        } else if (paramValue.startsWith('gte.')) {
          whereClauses.push(`${col} >= $${valIdx++}`);
          values.push(paramValue.slice(4));
        } else if (paramValue.startsWith('lt.')) {
          whereClauses.push(`${col} < $${valIdx++}`);
          values.push(paramValue.slice(3));
        } else if (paramValue.startsWith('lte.')) {
          whereClauses.push(`${col} <= $${valIdx++}`);
          values.push(paramValue.slice(4));
        } else if (paramValue.startsWith('is.')) {
          const rawVal = paramValue.slice(3);
          whereClauses.push(rawVal === 'null' ? `${col} IS NULL` : `${col} IS NOT NULL`);
        } else if (paramValue.startsWith('in.(') && paramValue.endsWith(')')) {
          const items = paramValue.slice(4, -1).split(',').map(s => s.trim());
          const placeholders = items.map(() => `$${valIdx++}`).join(', ');
          whereClauses.push(`${col} IN (${placeholders})`);
          values.push(...items);
        } else if (paramValue.startsWith('like.')) {
          whereClauses.push(`${col} LIKE $${valIdx++}`);
          values.push(paramValue.slice(5));
        } else if (paramValue.startsWith('ilike.')) {
          whereClauses.push(`${col} ILIKE $${valIdx++}`);
          values.push(paramValue.slice(6));
        }
      });

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count if prefer count=exact
      let totalCount: number | null = null;
      if (preferHeader.includes('count=exact') || preferHeader.includes('count=planned')) {
        const countRes = await pool.query(
          `SELECT COUNT(*) FROM ${sanitizeIdentifier(tableName)} ${whereSql}`,
          values
        );
        totalCount = parseInt(countRes.rows[0].count, 10);
      }

      // Order by
      let orderSql = '';
      if (orderParam) {
        const parts = orderParam.split(',').map(p => {
          const [field, dir] = p.split('.');
          const direction = (dir || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
          return `${sanitizeIdentifier(field)} ${direction}`;
        });
        orderSql = `ORDER BY ${parts.join(', ')}`;
      }

      // Pagination
      let limitSql = '';
      if (limitParam) {
        limitSql = `LIMIT ${parseInt(limitParam, 10)}`;
      }
      let offsetSql = '';
      if (offsetParam) {
        offsetSql = `OFFSET ${parseInt(offsetParam, 10)}`;
      }

      // Select columns
      let selectCols = '*';
      if (selectParam !== '*' && !selectParam.includes('(')) {
        selectCols = selectParam.split(',').map(c => sanitizeIdentifier(c.trim())).join(', ');
      }

      const querySql = `SELECT ${selectCols} FROM ${sanitizeIdentifier(tableName)} ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`;
      const result = await pool.query(querySql, values);

      if (totalCount !== null) {
        const start = offsetParam ? parseInt(offsetParam, 10) : 0;
        const end = start + result.rows.length - 1;
        res.setHeader('Content-Range', `${start}-${Math.max(start, end)}/${totalCount}`);
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.rows));
      return true;
    }

    if (method === 'POST') {
      let bodyStr = '';
      req.on('data', (chunk: any) => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const rows = Array.isArray(body) ? body : [body];
          if (rows.length === 0) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify([]));
          }

          const preferHeader = req.headers['prefer'] || '';
          const isUpsert = preferHeader.includes('resolution=merge-duplicates') || searchParams.has('on_conflict');
          const conflictTarget = searchParams.get('on_conflict') || (
            tableName === 'app_settings' ? 'key' :
            tableName === 'transactions' ? 'transaction_id' :
            tableName === 'blocked_ips' ? 'ip_address' :
            tableName === 'duration_codes' ? 'code' :
            tableName === 'xcoins_balances' ? 'phone' : 'id'
          );

          const insertedRows: any[] = [];
          for (const item of rows) {
            // Assign random ID if table has text ID and not provided
            if (!item.id && tableName !== 'users') {
              item.id = Math.random().toString(36).substring(2, 10) + '-' + Date.now();
            }

            const keys = Object.keys(item);
            const cols = keys.map(k => sanitizeIdentifier(k)).join(', ');
            const valPlaceholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = keys.map(k => {
              const v = item[k];
              return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
            });

            let query = `INSERT INTO ${sanitizeIdentifier(tableName)} (${cols}) VALUES (${valPlaceholders})`;
            if (isUpsert) {
              const updates = keys
                .filter(k => k !== conflictTarget)
                .map(k => `${sanitizeIdentifier(k)} = EXCLUDED.${sanitizeIdentifier(k)}`)
                .join(', ');
              query += ` ON CONFLICT (${sanitizeIdentifier(conflictTarget)}) DO UPDATE SET ${updates || `${sanitizeIdentifier(conflictTarget)} = EXCLUDED.${sanitizeIdentifier(conflictTarget)}`}`;
            }
            query += ' RETURNING *';

            const insertRes = await pool.query(query, values);
            if (insertRes.rows[0]) insertedRows.push(insertRes.rows[0]);
          }

          res.statusCode = 201;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(Array.isArray(body) ? insertedRows : insertedRows[0] || {}));
        } catch (postErr: any) {
          console.error(`Error POST ${tableName}:`, postErr);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: postErr.message }));
        }
      });
      return true;
    }

    if (method === 'PATCH') {
      let bodyStr = '';
      req.on('data', (chunk: any) => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const keys = Object.keys(body);
          if (keys.length === 0) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify([]));
          }

          const setClauses: string[] = [];
          const values: any[] = [];
          let valIdx = 1;

          for (const k of keys) {
            setClauses.push(`${sanitizeIdentifier(k)} = $${valIdx++}`);
            const v = body[k];
            values.push(typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);
          }

          // Where clauses from searchParams
          const whereClauses: string[] = [];
          searchParams.forEach((paramValue, paramKey) => {
            if (['select', 'order', 'limit', 'offset', 'apikey'].includes(paramKey)) return;
            const col = sanitizeIdentifier(paramKey);
            if (paramValue.startsWith('eq.')) {
              whereClauses.push(`${col} = $${valIdx++}`);
              values.push(paramValue.slice(3));
            }
          });

          const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
          const updateSql = `UPDATE ${sanitizeIdentifier(tableName)} SET ${setClauses.join(', ')} ${whereSql} RETURNING *`;
          const result = await pool.query(updateSql, values);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.rows));
        } catch (patchErr: any) {
          console.error(`Error PATCH ${tableName}:`, patchErr);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: patchErr.message }));
        }
      });
      return true;
    }

    if (method === 'DELETE') {
      const whereClauses: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      searchParams.forEach((paramValue, paramKey) => {
        if (['select', 'order', 'limit', 'offset', 'apikey'].includes(paramKey)) return;
        const col = sanitizeIdentifier(paramKey);
        if (paramValue.startsWith('eq.')) {
          whereClauses.push(`${col} = $${valIdx++}`);
          values.push(paramValue.slice(3));
        }
      });

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      await pool.query(`DELETE FROM ${sanitizeIdentifier(tableName)} ${whereSql}`, values);

      res.statusCode = 204;
      res.end();
      return true;
    }
  } catch (err: any) {
    console.error(`REST Error on ${tableName}:`, err);
    if (tableName === 'packages' && req.method?.toUpperCase() === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        {
          id: "f4e2af14-c91e-4259-944f-21876e6deba8",
          name: "NORMAL",
          display_name: "Normal",
          price_per_day: 2000,
          description: "Paket standar",
          features: ["Fitur dasar", "Update rutin"],
          is_active: true,
          sort_order: 1
        },
        {
          id: "305482a0-5a57-449d-bb70-5af8470505ab",
          name: "VIP",
          display_name: "VIP",
          price_per_day: 3500,
          description: "Paket VIP",
          features: ["Semua fitur Normal", "Fitur VIP eksklusif", "Prioritas support"],
          is_active: true,
          sort_order: 2
        },
        {
          id: "d4e2f040-5e06-4d13-ab0a-3601bc7bdd8a",
          name: "LIFETIME",
          display_name: "Lifetime",
          price_per_day: 700000,
          description: "Akses permanen",
          features: ["Semua fitur VIP", "Akses selamanya"],
          is_active: true,
          sort_order: 3
        }
      ]));
      return true;
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
    return true;
  }

  return false;
}

export async function handleFunctionsRequest(req: any, res: any): Promise<boolean> {
  const urlStr = req.url || '';
  const pathname = urlStr.split('?')[0] || '';

  const match = pathname.match(/^\/(?:functions\/v1|api)\/([a-zA-Z0-9_\-]+)/);
  if (!match) return false;

  const funcName = match[1];
  const pool = createPool();
  const searchParams = new URL(urlStr, 'http://localhost').searchParams;
  const method = req.method?.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // 1. get-script
  if (funcName === 'get-script') {
    const name = searchParams.get('name') || '';
    try {
      const q = await pool.query('SELECT content FROM lua_scripts WHERE name = $1 LIMIT 1', [name]);
      if (q.rows.length > 0 && q.rows[0].content) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(q.rows[0].content);
        return true;
      }

      // Check toko_scripts_catalog in app_settings
      const catRes = await pool.query("SELECT value FROM app_settings WHERE key = 'toko_scripts_catalog' LIMIT 1");
      if (catRes.rows.length > 0 && catRes.rows[0].value) {
        try {
          const catalog = JSON.parse(catRes.rows[0].value);
          const found = catalog.find((p: any) => p.id === name || (p.rawId && p.rawId.toLowerCase() === name.toLowerCase()));
          if (found && found.luaScript) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(found.luaScript);
            return true;
          }
        } catch {}
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`warn("[Axstools] Script '${name}' tidak ditemukan.")`);
      return true;
    } catch (e: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`warn("[Axstools] Error: ${e.message}")`);
      return true;
    }
  }

  // check-ip function
  if (funcName === 'check-ip') {
    try {
      const clientIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.socket?.remoteAddress || '127.0.0.1';
      const ipRes = await pool.query('SELECT reason FROM blocked_ips WHERE ip_address = $1 LIMIT 1', [clientIp]);
      res.setHeader('Content-Type', 'application/json');
      if (ipRes.rows.length > 0) {
        res.end(JSON.stringify({ blocked: true, reason: ipRes.rows[0].reason || 'IP Anda telah diblokir oleh sistem.', ip: clientIp }));
      } else {
        res.end(JSON.stringify({ blocked: false, ip: clientIp }));
      }
      return true;
    } catch {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ blocked: false, ip: '127.0.0.1' }));
      return true;
    }
  }

  // Read request body safely
  const bodyStr = await new Promise<string>((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(JSON.stringify(req.body));
    if (typeof req.body === 'string') return resolve(req.body);
    let str = '';
    req.on('data', (chunk: any) => { str += chunk; });
    req.on('end', () => resolve(str));
    req.on('error', () => resolve(''));
    if (req.complete) resolve(str);
  });

  try {
    const body = JSON.parse(bodyStr || '{}');

      async function fulfillTransaction(tx: any) {
        if (!tx) return;
        await pool.query("UPDATE transactions SET status = 'claimed', paid_at = now() WHERE id = $1 OR transaction_id = $1", [tx.id || tx.transaction_id]);

        if (tx.license_key && tx.package_name !== 'XCOINS_TOPUP') {
          try {
            const keysRes = await pool.query("SELECT value FROM app_settings WHERE key = 'license_keys' LIMIT 1");
            let allKeys: any[] = [];
            if (keysRes.rows[0]?.value) {
              try { allKeys = JSON.parse(keysRes.rows[0].value); } catch {}
            }

            const cleanKey = tx.license_key.trim().toUpperCase();
            const existingIdx = allKeys.findIndex((k: any) => (k.key || '').toUpperCase() === cleanKey);
            const days = tx.package_duration || 30;
            const isLifetime = days >= 9999;
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + days);

            if (existingIdx !== -1) {
              allKeys[existingIdx].expired = expireDate.toISOString();
              allKeys[existingIdx].isLifetime = isLifetime;
              allKeys[existingIdx].role = tx.package_name;
            } else {
              allKeys.push({
                key: cleanKey,
                role: tx.package_name,
                created: new Date().toISOString(),
                expired: expireDate.toISOString(),
                isLifetime,
                maxHwid: 1,
                hwids: [],
                devices: [],
                transactionId: tx.transaction_id,
              });
            }

            await pool.query(
              "UPDATE app_settings SET value = $1, updated_at = now() WHERE key = 'license_keys'",
              [JSON.stringify(allKeys)]
            );
          } catch (kErr) {
            console.warn('Auto key create error:', kErr);
          }
        }
      }

      const DEFAULT_AREXANS_QRIS = '00020101021126570011ID.DANA.WWW0118936009153920958133021500000109209581330303UMI51440014ID.CO.QRIS.WWW0215ID10200210000005204581253033605802ID5907AREXANS6011Kota Bekasi61051714862070703A016304CA12';

      function generateDynamicQris(rawStaticQris: string, amt: number): string {
        try {
          let qris = rawStaticQris.replace('010211', '010212');
          const step2 = qris.split('5802ID');
          const amountStr = Math.round(amt).toString();
          const amountTag = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
          let toCrc = `${step2[0]}${amountTag}5802ID${step2[1]}`;
          toCrc = toCrc.slice(0, -4);
          let crc = 0xFFFF;
          for (let c = 0; c < toCrc.length; c++) {
            crc ^= toCrc.charCodeAt(c) << 8;
            for (let i = 0; i < 8; i++) {
              if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
              else crc = (crc << 1) & 0xFFFF;
            }
          }
          return `${toCrc}${crc.toString(16).toUpperCase().padStart(4, '0')}`;
        } catch {
          return rawStaticQris;
        }
      }

      if (funcName === 'create-payment') {
        const rawAmount = Number(body.amount || body.total_amount || 0);
        const amount = Math.max(1000, isNaN(rawAmount) ? 1000 : Math.round(rawAmount));
        const packageName = body.packageName || body.package_name || 'NORMAL';
        const packageDuration = Number(body.packageDuration || body.package_duration || body.days || 1);
        const customerLicenseKey = (body.licenseKey || body.key || body.license_key || '').trim();
        const customerName = body.customerName || body.customer_name || customerLicenseKey || 'Pelanggan Arexans';
        const customerWhatsapp = body.customerWhatsapp || body.customer_whatsapp || body.phone || null;
        const deviceId = body.deviceId || body.device_id || null;
        const gateway = body.gateway || body.payment_gateway || '';

        const orderId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        let expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        let qrString = '';
        let qrisUrl = '';
        let paymentUrl = '';
        let totalAmount = amount;
        let gatewayUsed = 'arexanspay';
        let poketoSlug = '';
        let vaBanks: any[] = [];
        let quotes: any = null;

        // Query settings for gateway preference and keys
        const settingsRes = await pool.query(
          "SELECT key, value FROM app_settings WHERE key IN ('payment_gateway', 'poketo_api_key', 'poketo_webhook_key', 'arexanspay_api_key', 'arexanspay_qris_id', 'xmpayment_api_key')"
        );
        const settingsMap: Record<string, string> = {};
        (settingsRes.rows || []).forEach((r: any) => { settingsMap[r.key] = r.value; });

        const activeGateway = (gateway || settingsMap.payment_gateway || 'poketo').toLowerCase();
        const poketoKey = settingsMap.poketo_api_key || 'sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ';
        const arexansApiKey = settingsMap.arexanspay_api_key || 'arexanspay_f63fa727bda01551084e5c87bde526aeb68e1c471ff89fa36d2748b8c25156a3';
        const arexansQrisId = settingsMap.arexanspay_qris_id || 'axspay-duqwono-h3sq-au0s-5h26-v7m2d1oy3c32';
        const xmpKey = settingsMap.xmpayment_api_key || 'xmp_live_d2b8ea709d5d7a57ff974cd771435e0f58d4da888593350b';
        const cleanCustName = customerName || 'Pelanggan Arexans';

        // RULE: Pembayaran Poketo HANYA ketika minimal pembelian Rp 10.000.
        // Di bawah Rp 10.000 gunakan ArexansPay dan XMPayment.
        const isPoketoEligible = amount >= 10000;

        // 1. Jika amount >= 10.000: Gunakan Poketo (Realtime Multi-Metode: QRIS, VA, PayLater, Kartu)
        if (isPoketoEligible && (activeGateway === 'poketo' || activeGateway === 'both' || !activeGateway)) {
          try {
            const poketoResp = await fetch('https://poketo.id/api/v1/invoices', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${poketoKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': orderId,
              },
              body: JSON.stringify({
                amount: Math.round(Number(amount)),
                title: `Arexans - ${packageName || 'Tools'} (${packageDuration} Hari)`,
                referenceId: orderId,
                customer: {
                  name: cleanCustName,
                  email: 'customer@arexans.my.id',
                  phone: customerWhatsapp || null,
                },
              }),
            });

            const poketoData = await poketoResp.json().catch(() => null);
            if (poketoData?.data) {
              const inv = poketoData.data;
              paymentUrl = inv.paymentUrl || `https://pay.poketo.id/inv/${inv.id}`;
              totalAmount = inv.totalAmount || amount;
              gatewayUsed = 'poketo';
              if (inv.expiresAt) {
                expiresAt = new Date(inv.expiresAt);
              }

              // Extract slug dari paymentUrl (e.g. KrkJNiSOh7UbTtdCCfLYdj3W)
              poketoSlug = paymentUrl.split('/inv/')[1] || inv.id;

              // Ambil realtime detail invoice (VA banks & quotes) dari public invoice API Poketo
              try {
                const pubRes = await fetch(`https://pay.poketo.id/api/public/invoices/${encodeURIComponent(poketoSlug)}`);
                const pubData = await pubRes.json().catch(() => null);
                if (pubData?.invoice) {
                  vaBanks = pubData.invoice.vaBanks || [];
                  quotes = pubData.invoice.quotes || null;
                }

                // Inisiasi channel QRIS langsung via Poketo
                const qrisRes = await fetch(`https://pay.poketo.id/api/public/invoices/${encodeURIComponent(poketoSlug)}/pay`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ channel: 'QRIS' }),
                });
                const qrisData = await qrisRes.json().catch(() => null);
                if (qrisData?.payment?.qrContent) {
                  qrString = qrisData.payment.qrContent;
                  totalAmount = qrisData.payment.amount || totalAmount;
                }
              } catch (pubErr) {
                console.warn('Poketo public invoice API fetch error:', pubErr);
              }

              if (!qrString) {
                qrString = generateDynamicQris(DEFAULT_AREXANS_QRIS, totalAmount);
              }
              qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
            }
          } catch (pErr) {
            console.warn('Poketo create invoice exception, fallback to Arexanspay:', pErr);
          }
        }

        // 2. Jika amount < 10.000 ATAU Poketo gagal/belum ada QRIS:
        // Gunakan payment gateway ArexansPay dan XMPayment
        if (!qrString) {
          // Coba ArexansPay
          try {
            const arexResp = await fetch(`https://www.arexanspay.my.id/api/qris/${encodeURIComponent(arexansQrisId)}`, {
              headers: { 'X-API-Key': arexApiKey },
            });
            const arexData = await arexResp.json().catch(() => null);
            const rawQris = arexData?.raw_qris || arexData?.data?.[0]?.raw_qris;
            if (rawQris) {
              qrString = generateDynamicQris(rawQris, amount);
              qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
              gatewayUsed = 'arexanspay';
            }
          } catch (aErr) {
            console.warn('ArexansPay merchant fetch error, fallback:', aErr);
          }

          // Coba XMPayment jika ArexansPay gagal
          if (!qrString) {
            try {
              const xmpResp = await fetch('https://xmpayment.my.id/api/v1/create', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${xmpKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  order_id: orderId,
                  amount: amount,
                  customer_name: cleanCustName,
                  customer_email: 'buyer@arexans.my.id',
                  redirect_url: 'https://tools.arexans.my.id',
                }),
              });
              const xmpData = await xmpResp.json().catch(() => null);
              if (xmpData?.data?.qr_string) {
                qrString = xmpData.data.qr_string;
                totalAmount = xmpData.data.total_amount || amount;
                qrisUrl = xmpData.data.checkout_url || xmpData.data.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
                gatewayUsed = 'xmpayment';
              }
            } catch (xmpErr) {
              console.warn('XMPayment create error, fallback:', xmpErr);
            }
          }

          // Fallback Dynamic EMVCo QRIS untuk ArexansPay
          if (!qrString) {
            qrString = generateDynamicQris(DEFAULT_AREXANS_QRIS, amount);
            qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
            gatewayUsed = 'arexanspay';
          }
        }

        // Insert into Cloud SQL transactions
        try {
          const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
          await pool.query(
            `INSERT INTO transactions (id, transaction_id, customer_name, customer_whatsapp, package_name, package_duration, original_amount, total_amount, status, qr_string, license_key, expires_at, device_id, ip_address, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
            [
              orderId, orderId, customerName || 'Customer', customerWhatsapp || null,
              packageName || 'NORMAL', packageDuration, amount, totalAmount,
              'pending', qrString, customerLicenseKey || null, expiresAt.toISOString(),
              deviceId || null, clientIp
            ]
          );
        } catch (dbErr) {
          console.warn('Failed to record transaction to DB:', dbErr);
        }

        if (body.is_simulation || body.isSimulation) {
          setTimeout(async () => {
            try {
              const tx = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1 LIMIT 1', [orderId]);
              if (tx.rows[0] && tx.rows[0].status === 'pending') {
                await fulfillTransaction(tx.rows[0]);
              }
            } catch (err) {
              console.warn('Simulation fulfill error:', err);
            }
          }, 5000);
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          success: true,
          transactionId: orderId,
          gateway: gatewayUsed,
          isPoketo: gatewayUsed === 'poketo',
          slug: poketoSlug,
          qr_string: qrString,
          qris_url: qrisUrl,
          payment_url: gatewayUsed === 'poketo' ? paymentUrl : undefined,
          totalAmount,
          originalAmount: amount,
          vaBanks: gatewayUsed === 'poketo' ? vaBanks : undefined,
          quotes: gatewayUsed === 'poketo' ? quotes : undefined,
          expiresAt: expiresAt.toISOString(),
        }));
      }

      // Endpoint untuk generate Virtual Account Poketo realtime secara in-app
      if (funcName === 'poketo-va') {
        const { slug, bank } = body;
        if (!slug || !bank) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Slug dan kode bank wajib diisi' }));
        }

        try {
          const vaRes = await fetch(`https://pay.poketo.id/api/public/invoices/${encodeURIComponent(slug)}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'VA', bank: bank.toUpperCase() }),
          });
          const vaData = await vaRes.json();
          if (vaData?.success && vaData.payment) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: true,
              payment: vaData.payment,
            }));
          } else {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              error: vaData?.error || 'Gagal memproses nomor Virtual Account untuk bank ini.',
            }));
          }
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: false, error: e.message || 'Server error' }));
        }
      }

      if (funcName === 'check-payment') {
        const { transactionId } = body;
        if (!transactionId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Transaction ID required' }));
        }

        const txRes = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1 OR id = $1 LIMIT 1', [transactionId]);
        const transaction = txRes.rows[0];
        if (!transaction) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Transaction not found' }));
        }

        if (transaction.status === 'paid' || transaction.status === 'claimed') {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, paid: true, transaction }));
        }

        let isPaid = false;
        let cancelled = false;

        // 1. Check Poketo
        try {
          const settingsRes = await pool.query("SELECT value FROM app_settings WHERE key = 'poketo_api_key' LIMIT 1");
          const poketoKey = settingsRes.rows[0]?.value || 'sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ';
          let inv: any = null;

          // Try direct invoice ID check
          const poketoResp = await fetch(`https://poketo.id/api/v1/invoices/${encodeURIComponent(transactionId)}`, {
            headers: { 'Authorization': `Bearer ${poketoKey}` },
          });
          if (poketoResp.ok) {
            const poketoData = await poketoResp.json();
            inv = poketoData?.data;
          }

          // If not found directly, query recent invoices by referenceId
          if (!inv) {
            const listResp = await fetch(`https://poketo.id/api/v1/invoices?limit=25`, {
              headers: { 'Authorization': `Bearer ${poketoKey}` },
            });
            if (listResp.ok) {
              const listData = await listResp.json();
              inv = (listData?.data || []).find((item: any) =>
                item.referenceId === transactionId || item.id === transactionId
              );
            }
          }

          if (inv) {
            if (inv.status === 'paid' || inv.status === 'settled') {
              isPaid = true;
            } else if (inv.status === 'cancelled' || inv.status === 'expired') {
              cancelled = true;
            }
          }
        } catch (e) {
          console.warn('Poketo status check error:', e);
        }

        // 2. Check XMPayment
        if (!isPaid && !cancelled) {
          try {
            const xmpResp = await fetch(`https://xmpayment.my.id/api/v1/status/${transactionId}`, {
              headers: { 'Authorization': 'Bearer xmp_live_8YN23PFQXc31HocRExuMHSFgTAnAEaj2' },
            });
            const xmpData = await xmpResp.json();
            if (xmpData && xmpData.data) {
              if (xmpData.data.is_paid || xmpData.data.status === 'SETTLED' || xmpData.data.status === 'SUCCESS') {
                isPaid = true;
              } else if (xmpData.data.status === 'CANCELLED') {
                cancelled = true;
              }
            }
          } catch (e) {
            console.warn('XMPayment status check error:', e);
          }
        }

        if (cancelled) {
          await pool.query("UPDATE transactions SET status = 'cancelled' WHERE transaction_id = $1", [transactionId]);
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: false, paid: false, cancelled: true }));
        }

        if (isPaid) {
          await fulfillTransaction(transaction);
          transaction.status = 'claimed';
          transaction.paid_at = new Date().toISOString();

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, paid: true, transaction }));
        }

        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, paid: false, transaction }));
      }

      if (funcName === 'payment-webhook') {
        const refId = body?.data?.referenceId || body?.data?.id || body?.referenceId || body?.id || body?.order_id;
        const isPaidEvent = body?.type === 'invoice.paid' || body?.event === 'invoice.paid' || body?.data?.status === 'paid' || body?.status === 'SETTLED' || body?.status === 'SUCCESS';

        if (refId && isPaidEvent) {
          const txRes = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1 OR id = $1 LIMIT 1', [refId]);
          if (txRes.rows[0]) {
            await fulfillTransaction(txRes.rows[0]);
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, message: 'Webhook processed successfully' }));
      }

      if (funcName === 'test-poketo') {
        const key = body.apiKey || 'sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ';
        try {
          const resp = await fetch('https://poketo.id/api/v1/invoices?limit=1', {
            headers: { 'Authorization': `Bearer ${key}` }
          });
          const pData = await resp.json();
          if (resp.ok) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: true,
              merchantName: pData?.data?.[0]?.merchantName || 'AREXANS',
              message: 'Koneksi ke Poketo.id berhasil! API Key Valid & Siap Digunakan.'
            }));
          } else {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              error: pData.message || 'API Key Poketo tidak valid'
            }));
          }
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            success: false,
            error: e.message || 'Gagal menghubungi server Poketo.id'
          }));
        }
      }

      if (funcName === 'cancel-payment') {
        const { transactionId } = body;
        try {
          await fetch(`https://xmpayment.my.id/api/v1/cancel/${transactionId}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer xmp_live_8YN23PFQXc31HocRExuMHSFgTAnAEaj2' },
          });
        } catch {}
        await pool.query("UPDATE transactions SET status = 'cancelled' WHERE transaction_id = $1", [transactionId]);
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true }));
      }

      if (funcName === 'validate-key') {
        const { key: rawKey, productId, hwid, robloxUsername } = body;
        const key = (rawKey || '').trim().toUpperCase();

        // 1. Check toko_scripts_keys_data
        const tokoKeysRes = await pool.query("SELECT value FROM app_settings WHERE key = 'toko_scripts_keys_data' LIMIT 1");
        let tokoKeys: any[] = [];
        if (tokoKeysRes.rows[0]?.value) {
          try { tokoKeys = JSON.parse(tokoKeysRes.rows[0].value); } catch {}
        }

        const foundToko = tokoKeys.find((k: any) => (k.key || '').toUpperCase() === key);
        if (foundToko) {
          if (productId) {
            const target = productId.toLowerCase();
            const keyProd = (foundToko.productId || '').toLowerCase();
            const keyRaw = (foundToko.productRawId || '').toLowerCase();
            if (keyProd !== target && keyRaw !== target) {
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                valid: false,
                error: `Akses Ditolak: Key "${key}" hanya berlaku untuk "${foundToko.productTitle}".`
              }));
            }
          }

          if (foundToko.frozenUntil) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              valid: false,
              frozen: true,
              error: 'Key sedang dibekukan sementara karena maintenance.'
            }));
          }

          if (!foundToko.isLifetime && new Date(foundToko.expired) < new Date()) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              valid: false,
              expired: true,
              error: `Key untuk "${foundToko.productTitle}" telah kedaluwarsa.`
            }));
          }

          const maxHwid = foundToko.maxHwid || 1;
          const hwids = foundToko.hwids || [];
          if (hwid && !hwids.includes(hwid)) {
            if (hwids.length >= maxHwid) {
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: false,
                valid: false,
                hwid_limit_reached: true,
                error: `Batas perangkat tercapai (${hwids.length}/${maxHwid} HWID).`
              }));
            }
            hwids.push(hwid);
            foundToko.hwids = hwids;
            await pool.query(
              "UPDATE app_settings SET value = $1, updated_at = now() WHERE key = 'toko_scripts_keys_data'",
              [JSON.stringify(tokoKeys)]
            );
          }

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            success: true,
            valid: true,
            role: foundToko.role || 'Member',
            productTitle: foundToko.productTitle,
          }));
        }

        // 2. Check license_keys
        const licRes = await pool.query("SELECT value FROM app_settings WHERE key = 'license_keys' LIMIT 1");
        let licKeys: any[] = [];
        if (licRes.rows[0]?.value) {
          try { licKeys = JSON.parse(licRes.rows[0].value); } catch {}
        }

        const foundLic = licKeys.find((k: any) => (k.key || '').toUpperCase() === key);
        if (foundLic) {
          if (productId) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              valid: false,
              error: 'Key Arexans Tools tidak dapat digunakan pada Toko Script.'
            }));
          }

          if (!foundLic.isLifetime && new Date(foundLic.expired) < new Date()) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: false,
              valid: false,
              expired: true,
              error: 'Key Arexans Tools telah kedaluwarsa.'
            }));
          }

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            success: true,
            valid: true,
            role: foundLic.role || 'NORMAL',
            productTitle: 'Arexans Tools',
          }));
        }

        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: false, valid: false, error: 'Key tidak terdaftar di sistem.' }));
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Function '${funcName}' not implemented` }));
      return true;
    } catch (e: any) {
      console.error(`Error in function ${funcName}:`, e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
      return true;
    }
}

