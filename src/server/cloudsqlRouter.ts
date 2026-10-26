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

  const match = pathname.match(/^\/functions\/v1\/([a-zA-Z0-9_\-]+)/);
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

  // POST functions (create-payment, check-payment, cancel-payment, validate-key)
  let bodyStr = '';
  req.on('data', (chunk: any) => { bodyStr += chunk; });
  req.on('end', async () => {
    try {
      const body = JSON.parse(bodyStr || '{}');

      if (funcName === 'create-payment') {
        const {
          amount,
          customerName,
          packageName,
          packageDuration,
          licenseKey: customerLicenseKey,
          customerWhatsapp,
          deviceId,
        } = body;

        const orderId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        let qrString = '';
        let qrisUrl = '';
        let totalAmount = amount;

        // Call XMPayment API
        try {
          const cleanCustName = customerName || customerLicenseKey || 'Customer';
          const xmpResp = await fetch('https://xmpayment.my.id/api/v1/create', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer xmp_live_8YN23PFQXc31HocRExuMHSFgTAnAEaj2',
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

          const xmpData = await xmpResp.json();
          if (xmpData && xmpData.data) {
            qrString = xmpData.data.qr_string || '';
            totalAmount = xmpData.data.total_amount || amount;
            qrisUrl = xmpData.data.checkout_url || xmpData.data.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
          }
        } catch (xmpErr) {
          console.warn('XMPayment create error, fallback:', xmpErr);
        }

        if (!qrString) {
          qrString = `00020101021226670014ID.LINKAJA.WWW01189360091438927000000215${orderId}51440014ID.CO.QRIS.WWW0215ID102002100000052045812530336054${amount}5802ID5912AREXANSTOOLS6007JAKARTA61051011062200116${orderId}6304`;
          qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}`;
        }

        // Insert into Cloud SQL transactions
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        await pool.query(
          `INSERT INTO transactions (id, transaction_id, customer_name, customer_whatsapp, package_name, package_duration, original_amount, total_amount, status, qr_string, license_key, expires_at, device_id, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
          [
            orderId, orderId, customerName || 'Customer', customerWhatsapp || null,
            packageName || 'NORMAL', packageDuration || 1, amount, totalAmount,
            'pending', qrString, customerLicenseKey || null, expiresAt.toISOString(),
            deviceId || null, clientIp
          ]
        );

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          success: true,
          transactionId: orderId,
          qr_string: qrString,
          qris_url: qrisUrl,
          totalAmount,
          expiresAt: expiresAt.toISOString(),
        }));
      }

      if (funcName === 'check-payment') {
        const { transactionId } = body;
        if (!transactionId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Transaction ID required' }));
        }

        const txRes = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1 LIMIT 1', [transactionId]);
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

        // Check XMPayment
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

        if (cancelled) {
          await pool.query("UPDATE transactions SET status = 'cancelled' WHERE transaction_id = $1", [transactionId]);
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: false, paid: false, cancelled: true }));
        }

        if (isPaid) {
          await pool.query("UPDATE transactions SET status = 'claimed', paid_at = now() WHERE transaction_id = $1", [transactionId]);
          transaction.status = 'claimed';
          transaction.paid_at = new Date().toISOString();

          // Auto-generate key in app_settings if key provided
          if (transaction.license_key && transaction.package_name !== 'XCOINS_TOPUP') {
            try {
              const keysRes = await pool.query("SELECT value FROM app_settings WHERE key = 'license_keys' LIMIT 1");
              let allKeys: any[] = [];
              if (keysRes.rows[0]?.value) {
                try { allKeys = JSON.parse(keysRes.rows[0].value); } catch {}
              }

              const cleanKey = transaction.license_key.trim().toUpperCase();
              const existingIdx = allKeys.findIndex((k: any) => (k.key || '').toUpperCase() === cleanKey);

              const days = transaction.package_duration || 30;
              const isLifetime = days >= 9999;
              const expireDate = new Date();
              expireDate.setDate(expireDate.getDate() + days);

              if (existingIdx !== -1) {
                allKeys[existingIdx].expired = expireDate.toISOString();
                allKeys[existingIdx].isLifetime = isLifetime;
                allKeys[existingIdx].role = transaction.package_name;
              } else {
                allKeys.push({
                  key: cleanKey,
                  role: transaction.package_name,
                  created: new Date().toISOString(),
                  expired: expireDate.toISOString(),
                  isLifetime,
                  maxHwid: 1,
                  hwids: [],
                  devices: [],
                  transactionId: transactionId,
                });
              }

              await pool.query(
                "UPDATE app_settings SET value = $1, updated_at = now() WHERE key = 'license_keys'",
                [JSON.stringify(allKeys)]
              );
            } catch (kErr) {
              console.warn('Auto key create error in Cloud SQL:', kErr);
            }
          }

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, paid: true, transaction }));
        }

        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, paid: false, transaction }));
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
    } catch (e: any) {
      console.error(`Error in function ${funcName}:`, e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  return true;
}

