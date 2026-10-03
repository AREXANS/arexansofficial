import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Valid columns per table (must match current DB schema)
const TABLE_COLUMNS: Record<string, string[]> = {
  app_settings: ["id", "created_at", "updated_at", "key", "value", "description"],
  packages: ["id", "name", "display_name", "price_per_day", "description", "features", "is_active", "sort_order", "created_at", "updated_at"],
  ads: ["id", "title", "media_url", "media_type", "link", "link_url", "is_active", "sort_order", "created_at"],
  backgrounds: ["id", "title", "background_type", "background_url", "is_active", "is_muted", "sort_order", "created_at"],
  transactions: ["id", "transaction_id", "customer_name", "customer_whatsapp", "package_name", "package_duration", "original_amount", "total_amount", "status", "license_key", "qr_string", "device_id", "paid_at", "expires_at", "created_at"],
  social_links: ["id", "name", "icon_type", "url", "label", "link_location", "is_active", "sort_order", "created_at"],
  admin_sessions: ["id", "device_id", "device_name", "device_info", "login_time", "is_current", "is_approved"],
  lua_scripts: ["id", "name", "display_name", "description", "content", "script_type", "is_active", "created_at", "updated_at"],
  package_discounts: ["id", "discount_type", "package_name", "min_days", "max_days", "discount_percent", "promo_code", "description", "is_active", "start_date", "end_date", "notify_users", "created_at", "updated_at"],
  xcoins_balances: ["id", "phone", "pin_hash", "display_name", "balance", "is_active", "created_at", "updated_at"],
  xcoins_otp: ["id", "phone", "otp_code", "is_used", "expires_at", "created_at"],
  xcoins_transactions: ["id", "user_id", "type", "amount", "balance_after", "description", "reference_id", "created_at"],
};

// Order matters for foreign key dependencies
const RESTORE_ORDER = [
  "app_settings",
  "packages",
  "ads",
  "backgrounds",
  "social_links",
  "admin_sessions",
  "lua_scripts",
  "package_discounts",
  "xcoins_balances",
  "xcoins_otp",
  "xcoins_transactions",
  "transactions",
];

const normalizePhone = (phone: unknown): string | null => {
  if (typeof phone !== "string" || !phone.trim()) return null;
  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (!cleanPhone) return null;
  if (cleanPhone.startsWith("0")) cleanPhone = `62${cleanPhone.slice(1)}`;
  if (!cleanPhone.startsWith("62")) cleanPhone = `62${cleanPhone}`;
  return cleanPhone;
};

const toNumber = (value: unknown, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const isSha256Hex = (value: unknown): value is string =>
  typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

// Strip unknown columns from row based on table schema
function filterColumns(table: string, row: Record<string, any>): Record<string, any> | null {
  const validCols = TABLE_COLUMNS[table];
  if (!validCols) return null;

  const filtered: Record<string, any> = {};
  let hasId = false;
  for (const col of validCols) {
    if (col in row && row[col] !== undefined) {
      filtered[col] = row[col];
      if (col === "id") hasId = true;
    }
  }

  // Must have id for upsert
  if (!hasId) return null;
  return filtered;
}

async function transformLegacyRow(
  table: string,
  row: Record<string, any>,
  phoneToUserId: Map<string, string>
): Promise<Record<string, any> | null> {
  if (table === "app_settings") {
    return {
      ...row,
      key: row.key ?? row.setting_key,
      value: row.value ?? row.setting_value,
      created_at: row.created_at ?? row.updated_at,
    };
  }

  if (table === "transactions") {
    return {
      ...row,
      customer_name: row.customer_name ?? row.key_name ?? "Restored User",
      package_name: row.package_name ?? row.package_type ?? "unknown",
      package_duration: toNumber(row.package_duration ?? row.duration_days, 0),
      original_amount: toNumber(row.original_amount ?? row.amount ?? row.total_amount, 0),
      license_key: row.license_key ?? row.key_name ?? null,
      expires_at: row.expires_at ?? row.expired_at ?? null,
      paid_at: row.paid_at ?? (row.status === "paid" ? row.updated_at ?? row.created_at ?? null : null),
    };
  }

  if (table === "xcoins_balances") {
    const normalizedPhone = normalizePhone(row.phone ?? row.phone_number);
    const rawPin = row.pin;

    let pinHash = row.pin_hash;
    if (!pinHash && typeof rawPin === "string" && rawPin.trim()) {
      pinHash = isSha256Hex(rawPin) ? rawPin : await hashPin(rawPin);
    }

    if (!pinHash) {
      // fallback supaya row tetap bisa direstore (PIN default: 000000)
      pinHash = await hashPin("000000");
    }

    return {
      ...row,
      phone: normalizedPhone,
      pin_hash: pinHash,
      display_name: row.display_name ?? normalizedPhone?.slice(-4) ?? null,
      is_active: row.is_active ?? true,
    };
  }

  if (table === "xcoins_transactions") {
    const normalizedPhone = normalizePhone(row.phone ?? row.phone_number);
    const userId = row.user_id ?? (normalizedPhone ? phoneToUserId.get(normalizedPhone) : null);

    if (!userId) return null;

    return {
      ...row,
      user_id: userId,
      reference_id: row.reference_id ?? row.transaction_id ?? null,
      amount: toNumber(row.amount, 0),
    };
  }

  if (table === "xcoins_otp") {
    return {
      ...row,
      phone: normalizePhone(row.phone ?? row.phone_number),
      is_used: row.is_used ?? Boolean(row.verified),
    };
  }

  return row;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const tables = body.tables ?? body.data;
    const mode = (body.mode ?? "merge") as "merge" | "replace";

    if (!tables || typeof tables !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid backup format. Expected { tables: { ... } } or { data: { ... } }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, { inserted: number; skipped: number; errors: string[] }> = {};

    for (const table of RESTORE_ORDER) {
      if (!tables[table] || !Array.isArray(tables[table]) || tables[table].length === 0) continue;

      const tableResults = { inserted: 0, skipped: 0, errors: [] as string[] };

      // In replace mode, clear existing data first
      if (mode === "replace") {
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (deleteError) {
          tableResults.errors.push(`Clear failed: ${deleteError.message}`);
        }
      }

      let phoneToUserId = new Map<string, string>();
      if (table === "xcoins_transactions") {
        const phones = Array.from(
          new Set(
            tables[table]
              .map((r: Record<string, any>) => normalizePhone(r.phone ?? r.phone_number))
              .filter(Boolean)
          )
        ) as string[];

        if (phones.length > 0) {
          const { data: users, error } = await supabase
            .from("xcoins_balances")
            .select("id, phone")
            .in("phone", phones);

          if (error) {
            tableResults.errors.push(`User mapping failed: ${error.message}`);
          } else {
            for (const user of users ?? []) {
              phoneToUserId.set(user.phone, user.id);
            }
          }
        }
      }

      // Transform legacy rows + filter valid columns
      const validRows: Record<string, any>[] = [];
      for (const row of tables[table]) {
        const transformed = await transformLegacyRow(table, row, phoneToUserId);

        if (!transformed) {
          tableResults.skipped++;
          continue;
        }

        const filtered = filterColumns(table, transformed);
        if (!filtered) {
          tableResults.skipped++;
          continue;
        }

        validRows.push(filtered);
      }

      if (validRows.length === 0) {
        tableResults.errors.push(`All ${tables[table].length} rows skipped - incompatible columns or missing references`);
        results[table] = tableResults;
        continue;
      }

      // Insert in batches of 100
      for (let i = 0; i < validRows.length; i += 100) {
        const batch = validRows.slice(i, i + 100);

        const { error } = await supabase.from(table).upsert(batch, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

        if (error) {
          tableResults.errors.push(`Batch ${Math.floor(i / 100) + 1}: ${error.message}`);
        } else {
          tableResults.inserted += batch.length;
        }
      }

      results[table] = tableResults;
    }

    // Handle any tables not in RESTORE_ORDER
    for (const table of Object.keys(tables)) {
      if (RESTORE_ORDER.includes(table)) continue;
      results[table] = { inserted: 0, skipped: 0, errors: [`Table "${table}" not supported for restore`] };
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        restoredAt: new Date().toISOString(),
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
