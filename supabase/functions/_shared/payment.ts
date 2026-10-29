// Shared payment-gateway helpers.
// ArexansPay docs: https://www.arexanspay.my.id/docs  |  Pakasir docs: https://pakasir.com/p/docs
// All credentials are read from the `app_settings` table on EVERY call,
// so changing them in /developer settings takes effect immediately (realtime).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-key, x-signature, x-arexanspay-signature, x-casaku-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

export const AREXANSPAY_BASE = "https://www.arexanspay.my.id";
export const PAKASIR_BASE = "https://app.pakasir.com";
export const XMPAYMENT_BASE = "https://xmpayment.my.id";

export const DEFAULT_XMP_API_KEY = "xmp_live_d2b8ea709d5d7a57ff974cd771435e0f58d4da888593350b";
export const DEFAULT_XMP_WEBHOOK_SECRET = "whsec_bYGhuiJpREZP4N5zB0bCMOP6LrDAQ3wsOJzOThgNZKY";

export const DEFAULT_POKETO_API_KEY = "sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ";
export const DEFAULT_POKETO_WEBHOOK_SECRET = "whsec_b71_8KfymmRPeNNQP2wigV2jshWTrC-X";

export const PAID_STATUSES = ["paid", "success", "completed", "settled"];

export interface PaymentConfig {
  gateway: string; // "xmpayment" | "arexanspay" | "poketo" | "both"
  simulation: boolean;
  discordWebhookUrl: string;
  arexanspay: {
    apiKey: string;
    qrisId: string;
    webhookKey: string;
    numberId: string;
    configured: boolean;
  };
  xmpayment: {
    apiKey: string;
    webhookSecret: string;
    mode: string; // "live" | "sandbox"
    configured: boolean;
  };
  poketo: {
    apiKey: string;
    webhookSecret: string;
    configured: boolean;
  };
  pakasir: {
    slug: string;
    apiKey: string;
    mode: string;
    configured: boolean;
  };
}

const SETTING_KEYS = [
  "payment_gateway", "payment_simulation", "discord_webhook_url",
  "xmpayment_api_key", "xmp_api_key", "xmpayment_webhook_secret", "xmp_webhook_secret", "xmpayment_mode",
  "poketo_api_key", "poketo_webhook_key", "poketo_webhook_secret",
  "arexanspay_api_key", "arexanspay_license_key", "arexanspay_qris_id",
  "arexanspay_webhook_key", "arexanspay_number_id",
  // legacy aliases for seamless backward compatibility
  "casaku_license_key", "casaku_qris_id", "casaku_webhook_key", "casaku_webhook_secret",
  "cashify_license_key", "cashify_qris_id", "cashify_webhook_key",
  "pakasir_slug", "pakasir_api_key", "pakasir_mode",
];

export async function loadPaymentConfig(supabase: any): Promise<PaymentConfig> {
  const { data } = await supabase.from("app_settings").select("key, value").in("key", SETTING_KEYS);
  const s: Record<string, string> = Object.fromEntries(
    (data || []).map((r: any) => [r.key, (r.value ?? "").toString().trim()])
  );

  const pick = (...keys: string[]) => {
    for (const k of keys) if (s[k]) return s[k];
    return "";
  };

  const rawGateway = (pick("payment_gateway") || "xmpayment").toLowerCase();
  let gateway = rawGateway;
  if (gateway === "cashify" || gateway === "casaku") gateway = "arexanspay";
  if (gateway === "pakasir") gateway = "xmpayment"; // seamless migration

  const apiKey = pick("arexanspay_api_key", "arexanspay_license_key", "casaku_license_key", "cashify_license_key");
  const qrisId = pick("arexanspay_qris_id", "casaku_qris_id", "cashify_qris_id");
  const webhookKey = pick("arexanspay_webhook_key", "casaku_webhook_key", "casaku_webhook_secret", "cashify_webhook_key");

  const xmpApiKey = pick("xmpayment_api_key", "xmp_api_key") || DEFAULT_XMP_API_KEY;
  const xmpWebhookSecret = pick("xmpayment_webhook_secret", "xmp_webhook_secret") || DEFAULT_XMP_WEBHOOK_SECRET;
  const xmpMode = (pick("xmpayment_mode") || "live").toLowerCase();

  return {
    gateway,
    simulation: pick("payment_simulation") === "on",
    discordWebhookUrl: pick("discord_webhook_url"),
    arexanspay: {
      apiKey,
      qrisId,
      webhookKey,
      numberId: pick("arexanspay_number_id"),
      configured: !!apiKey && (!!qrisId || !!pick("arexanspay_number_id")),
    },
    xmpayment: {
      apiKey: xmpApiKey,
      webhookSecret: xmpWebhookSecret,
      mode: xmpMode,
      configured: !!xmpApiKey,
    },
    poketo: {
      apiKey: pick("poketo_api_key") || DEFAULT_POKETO_API_KEY,
      webhookSecret: pick("poketo_webhook_key", "poketo_webhook_secret") || DEFAULT_POKETO_WEBHOOK_SECRET,
      configured: true,
    },
    pakasir: {
      slug: pick("pakasir_slug"),
      apiKey: pick("pakasir_api_key"),
      mode: (pick("pakasir_mode") || "live").toLowerCase(),
      configured: !!pick("pakasir_slug") && !!pick("pakasir_api_key"),
    },
  };
}

/** Resolve which gateway to use for a NEW transaction. */
export function resolveGateway(cfg: PaymentConfig, requested?: string): "arexanspay" | "xmpayment" | "poketo" {
  const norm = (v?: string) => {
    if (!v) return "";
    const l = v.toLowerCase();
    if (l === "cashify" || l === "casaku") return "arexanspay";
    if (l === "pakasir") return "xmpayment";
    return l;
  };

  const req = norm(requested);
  if (req === "poketo" || req === "arexanspay" || req === "xmpayment") return req as any;
  if (cfg.gateway === "poketo") return "poketo";
  if (cfg.gateway === "both") {
    return cfg.xmpayment.configured ? "xmpayment" : "arexanspay";
  }
  return cfg.gateway === "arexanspay" ? "arexanspay" : "xmpayment";
}

export function qrImageUrl(qrString: string) {
  return `https://larabert-qrgen.hf.space/v1/create-qr-code?size=500x500&style=2&color=0D8BA5&data=${encodeURIComponent(qrString)}`;
}

/** Look up the ArexansPay transaction id we stored for one of our order ids. */
export async function getGatewayTxId(supabase: any, orderId: string): Promise<string> {
  const { data } = await supabase
    .from("app_settings").select("key, value")
    .in("key", [`arexanspay_tx_${orderId}`, `casaku_tx_${orderId}`, `cashify_tx_${orderId}`]);
  const row = (data || []).find((r: any) => r.value);
  return row?.value ? String(row.value) : "";
}

export async function saveGatewayTxId(supabase: any, orderId: string, gatewayTxId: string) {
  await supabase.from("app_settings").upsert({
    key: `arexanspay_tx_${orderId}`,
    value: gatewayTxId,
    description: "ArexansPay transaction mapping",
  }, { onConflict: "key" });
}

export async function clearGatewayTxId(supabase: any, orderId: string) {
  await supabase.from("app_settings").delete()
    .in("key", [`arexanspay_tx_${orderId}`, `casaku_tx_${orderId}`, `cashify_tx_${orderId}`]);
}

async function arexansFetch(cfg: PaymentConfig, path: string, init: RequestInit = {}) {
  const res = await fetch(`${AREXANSPAY_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.arexanspay.apiKey,
      "X-License-Key": cfg.arexanspay.apiKey,
      ...(cfg.arexanspay.qrisId ? { "X-QRIS-ID": cfg.arexanspay.qrisId } : {}),
      ...(init.headers || {}),
    },
  });
  const raw = await res.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch { /* html / error page */ }
  return { res, raw, json };
}

/** Lightweight availability check: public merchant info by QRIS ID. */
export async function arexansMerchantOnline(cfg: PaymentConfig): Promise<boolean | null> {
  if (!cfg.arexanspay.qrisId) return null;
  try {
    const res = await fetch(`${AREXANSPAY_BASE}/api/qris/${encodeURIComponent(cfg.arexanspay.qrisId)}`);
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    const d = json.data ?? json;
    if (typeof d?.active === "boolean") return d.active;
    if (typeof d?.is_active === "boolean") return d.is_active;
    return true;
  } catch {
    return null;
  }
}

export interface QrisResult {
  ok: boolean;
  qrString?: string;
  qrBase64?: string;
  totalAmount?: number;
  gatewayTxId?: string;
  expiredAt?: string;
  error?: string;
  fallback?: boolean;
}

/**
 * POST /api/v1/create (or /api/qris/:numberId/create when a QRIS slot is set).
 * ArexansPay adds a unique code to the base amount and returns a QRIS payload.
 */
export async function arexansCreateQris(cfg: PaymentConfig, amount: number): Promise<QrisResult> {
  if (!cfg.arexanspay.apiKey) {
    return { ok: false, fallback: true, error: "Qris 1 (ArexansPay) belum dikonfigurasi. Isi API Key di pengaturan developer." };
  }
  if (!cfg.arexanspay.qrisId && !cfg.arexanspay.numberId) {
    return { ok: false, fallback: true, error: "Qris 1 (ArexansPay) belum dikonfigurasi. Isi QRIS ID atau Number ID Slot di pengaturan developer." };
  }

  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [];
  if (cfg.arexanspay.numberId) {
    attempts.push({
      path: `/api/qris/${encodeURIComponent(cfg.arexanspay.numberId)}/create`,
      body: { base_amount: amount, qris_label: "Arexans Store" },
    });
  }
  attempts.push({
    path: "/api/v1/create",
    body: {
      base_amount: amount,
      payment_channel: "qris",
      ...(cfg.arexanspay.qrisId ? { qris_id: cfg.arexanspay.qrisId } : {}),
      ...(cfg.arexanspay.numberId ? { number_id: Number(cfg.arexanspay.numberId) } : {}),
    },
  });

  let lastError = "";
  for (const attempt of attempts) {
    try {
      const { res, raw, json } = await arexansFetch(cfg, attempt.path, {
        method: "POST", body: JSON.stringify(attempt.body),
      });
      console.log(`ArexansPay ${attempt.path} -> ${res.status}: ${raw.slice(0, 200)}`);

      if (json && (json.success === true || res.ok)) {
        const d = json.data ?? json;
        const qrString = d.qr_payload || d.qrPayload || d.qr_string || d.qrString || "";
        if (qrString) {
          return {
            ok: true,
            qrString,
            qrBase64: d.qr_base64 || d.qrBase64 || "",
            totalAmount: Number(d.unique_amount ?? d.uniqueAmount ?? d.total_amount ?? d.base_amount ?? amount),
            gatewayTxId: d.transaction_id || d.transactionId || "",
            expiredAt: d.expired_at || d.expiredAt || "",
          };
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false, fallback: true,
          error: "API Key ArexansPay tidak valid atau toko sedang nonaktif. Periksa dashboard ArexansPay.",
        };
      }

      lastError = (json && (json.message || json.error)) || `ArexansPay tidak merespon (HTTP ${res.status})`;
      if (!json && /<!doctype|<html/i.test(raw)) {
        lastError = "Layanan ArexansPay sedang tidak aktif (kredensial bermasalah).";
      }
      if (res.status !== 404 && res.status !== 405) break;
    } catch (err) {
      console.error("ArexansPay request failed:", err);
      lastError = "Gagal menghubungi server ArexansPay.";
      break;
    }
  }

  return { ok: false, fallback: true, error: lastError || "Gagal membuat QRIS ArexansPay." };
}

/** GET /api/status/:transaction_id -> pending | success | expired */
export async function arexansCheckStatus(cfg: PaymentConfig, gatewayTxId: string): Promise<string> {
  if (!gatewayTxId) return "";
  try {
    const res = await fetch(`${AREXANSPAY_BASE}/api/status/${encodeURIComponent(gatewayTxId)}`, {
      headers: cfg.arexanspay.apiKey ? { "X-API-Key": cfg.arexanspay.apiKey } : {},
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    console.log(`ArexansPay status ${gatewayTxId} -> ${res.status}: ${raw.slice(0, 200)}`);
    const st = json?.data?.status ?? json?.status;
    return typeof st === "string" ? st.toLowerCase() : "";
  } catch (err) {
    console.error("ArexansPay check-status error:", err);
    return "";
  }
}

/** POST /api/transactions/:id/cancel */
export async function arexansCancel(cfg: PaymentConfig, gatewayTxId: string) {
  if (!cfg.arexanspay.apiKey || !gatewayTxId) return;
  try {
    await arexansFetch(cfg, `/api/transactions/${encodeURIComponent(gatewayTxId)}/cancel`, { method: "POST" });
  } catch (err) {
    console.error("ArexansPay cancel error:", err);
  }
}

/**
 * XMPAYMENT GATEWAY INTEGRATION (https://xmpayment.my.id/dashboard/docs)
 * REST API for dynamic QRIS, status check, transaction cancellation, and balance check.
 */

export interface XmPaymentCreateOptions {
  customerName?: string;
  customerEmail?: string;
  redirectUrl?: string;
}

/** POST https://xmpayment.my.id/api/v1/create */
export async function xmpaymentCreateQris(
  cfg: PaymentConfig,
  orderId: string,
  amount: number,
  opts: XmPaymentCreateOptions = {}
): Promise<QrisResult> {
  const apiKey = cfg.xmpayment?.apiKey || DEFAULT_XMP_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "API Key XMPayment belum dikonfigurasi. Isi API Key di menu Developer Settings." };
  }

  const payload = {
    order_id: orderId,
    amount: Math.round(Number(amount)),
    customer_name: (opts.customerName || "Customer").trim(),
    customer_email: (opts.customerEmail || "customer@example.com").trim(),
    redirect_url: (opts.redirectUrl || "https://tools.arexans.my.id").trim(),
  };

  try {
    const res = await fetch(`${XMPAYMENT_BASE}/api/v1/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    console.log(`XMPayment create -> ${res.status}: ${raw.slice(0, 300)}`);

    if (json && (json.success === true || res.status === 201 || res.status === 200)) {
      const d = json.data ?? json;
      const qrString = d.qr_string || d.qr_code || d.qrString || "";
      const totalAmount = Number(d.total_amount ?? d.base_amount ?? amount);
      const qrCodeUrl = d.qr_code_url || (qrString ? qrImageUrl(qrString) : "");

      return {
        ok: true,
        qrString,
        qrBase64: d.qr_base64 || "",
        totalAmount,
        gatewayTxId: d.transaction_id || d.order_id || orderId,
        expiredAt: d.expires_at || "",
        fallback: false,
      };
    }

    const errMsg = json?.message || json?.error?.message || json?.error || `Gagal membuat transaksi XMPayment (HTTP ${res.status})`;
    return { ok: false, error: errMsg };
  } catch (err: any) {
    console.error("XMPayment create error:", err);
    return { ok: false, error: `Gagal menghubungi server XMPayment: ${err?.message || err}` };
  }
}

/** GET https://xmpayment.my.id/api/v1/status/:order_id */
export async function xmpaymentCheckStatus(
  cfg: PaymentConfig,
  orderId: string
): Promise<{ status: string; isPaid: boolean; totalAmount?: number; raw?: any }> {
  const apiKey = cfg.xmpayment?.apiKey || DEFAULT_XMP_API_KEY;
  if (!apiKey || !orderId) return { status: "", isPaid: false };

  try {
    const res = await fetch(`${XMPAYMENT_BASE}/api/v1/status/${encodeURIComponent(orderId)}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });

    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    console.log(`XMPayment status ${orderId} -> ${res.status}: ${raw.slice(0, 300)}`);

    if (json && (json.success === true || res.ok)) {
      const d = json.data ?? json;
      const st = String(d.status || "").toLowerCase();
      const isPaid = !!d.is_paid || PAID_STATUSES.includes(st);
      return {
        status: st,
        isPaid,
        totalAmount: Number(d.total_amount ?? d.base_amount ?? 0),
        raw: d,
      };
    }

    return { status: "", isPaid: false };
  } catch (err) {
    console.error("XMPayment check-status error:", err);
    return { status: "", isPaid: false };
  }
}

/** POST https://xmpayment.my.id/api/v1/cancel/:order_id */
export async function xmpaymentCancel(cfg: PaymentConfig, orderId: string): Promise<boolean> {
  const apiKey = cfg.xmpayment?.apiKey || DEFAULT_XMP_API_KEY;
  if (!apiKey || !orderId) return false;

  try {
    const res = await fetch(`${XMPAYMENT_BASE}/api/v1/cancel/${encodeURIComponent(orderId)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });
    const text = await res.text();
    console.log(`XMPayment cancel ${orderId} -> ${res.status}: ${text.slice(0, 200)}`);
    return res.ok;
  } catch (err) {
    console.error("XMPayment cancel error:", err);
    return false;
  }
}

/** GET https://xmpayment.my.id/api/v1/balance (Live Only) */
export async function xmpaymentGetBalance(cfg: PaymentConfig): Promise<any> {
  const apiKey = cfg.xmpayment?.apiKey || DEFAULT_XMP_API_KEY;
  if (!apiKey) return { success: false, error: "API Key kosong" };

  try {
    const res = await fetch(`${XMPAYMENT_BASE}/api/v1/balance`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || err };
  }
}

/** POST https://app.pakasir.com/api/transactioncreate/qris */
export async function pakasirCreateQris(cfg: PaymentConfig, orderId: string, amount: number): Promise<QrisResult> {
  if (!cfg.pakasir.configured) {
    return { ok: false, error: "Qris 2 (Pakasir) belum dikonfigurasi. Isi Slug & API Key di pengaturan developer." };
  }
  try {
    const res = await fetch(`${PAKASIR_BASE}/api/transactioncreate/qris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: cfg.pakasir.slug, order_id: orderId, amount, api_key: cfg.pakasir.apiKey }),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    console.log(`Pakasir transactioncreate -> ${res.status}: ${raw.slice(0, 200)}`);

    if (json?.payment?.payment_number) {
      return {
        ok: true,
        qrString: json.payment.payment_number,
        totalAmount: Number(json.payment.total_payment ?? amount),
        expiredAt: json.payment.expired_at || "",
      };
    }
    return { ok: false, error: json?.message || `Gagal membuat transaksi Pakasir (HTTP ${res.status})` };
  } catch (err) {
    console.error("Pakasir create error:", err);
    return { ok: false, error: "Gagal menghubungi Pakasir." };
  }
}

/** GET https://app.pakasir.com/api/transactiondetail */
export async function pakasirTransactionDetail(cfg: PaymentConfig, orderId: string, amount: number): Promise<string> {
  if (!cfg.pakasir.configured) return "";
  try {
    const url = `${PAKASIR_BASE}/api/transactiondetail?project=${encodeURIComponent(cfg.pakasir.slug)}&amount=${amount}&order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(cfg.pakasir.apiKey)}`;
    const res = await fetch(url);
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    console.log(`Pakasir transactiondetail -> ${res.status}: ${raw.slice(0, 200)}`);
    return String(json?.transaction?.status || "").toLowerCase();
  } catch (err) {
    console.error("Pakasir detail error:", err);
    return "";
  }
}

/**
 * Pakasir matches a transaction by project + order_id + amount. We store both
 * the base amount and the total (incl. fee), so try both before giving up.
 */
export async function pakasirIsPaid(cfg: PaymentConfig, orderId: string, amounts: number[]): Promise<boolean> {
  const tried = new Set<number>();
  for (const amount of amounts) {
    const a = Number(amount);
    if (!a || tried.has(a)) continue;
    tried.add(a);
    const status = await pakasirTransactionDetail(cfg, orderId, a);
    if (PAID_STATUSES.includes(status)) return true;
  }
  return false;
}

/** POST https://app.pakasir.com/api/transactioncancel */
export async function pakasirCancel(cfg: PaymentConfig, orderId: string, amount: number) {
  if (!cfg.pakasir.configured) return;
  try {
    await fetch(`${PAKASIR_BASE}/api/transactioncancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: cfg.pakasir.slug, order_id: orderId, amount, api_key: cfg.pakasir.apiKey }),
    });
  } catch (err) {
    console.error("Pakasir cancel error:", err);
  }
}

/** HMAC-SHA256 hex of rawBody using secret (webhook signature). */
export async function hmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * POKETO PAYMENT GATEWAY INTEGRATION (https://poketo.id/docs)
 * REST API for invoice creation, public channel pay (QRIS, VA Bank, PayLater, Card), and status check.
 */
export const POKETO_API_BASE = "https://poketo.id";
export const POKETO_PAY_BASE = "https://pay.poketo.id";

export interface PoketoInvoiceResult {
  ok: boolean;
  id?: string;
  slug?: string;
  paymentUrl?: string;
  qrString?: string;
  totalAmount?: number;
  vaBanks?: Array<{ code: string; name: string }>;
  quotes?: any;
  selectedChannel?: string;
  selectedBank?: string;
  vaData?: any;
  akulakuData?: any;
  cardData?: any;
  error?: string;
}

export async function poketoCreateInvoice(
  cfg: PaymentConfig,
  orderId: string,
  amount: number,
  opts: {
    customerName?: string;
    customerWhatsapp?: string;
    title?: string;
    channel?: string;
    bank?: string;
    payer?: any;
  } = {}
): Promise<PoketoInvoiceResult> {
  const apiKey = cfg.poketo?.apiKey || DEFAULT_POKETO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "API Key Poketo belum dikonfigurasi." };
  }

  const requestedChannel = (opts.channel || "QRIS").toUpperCase();
  const requestedBank = (opts.bank || "BRI").toUpperCase();
  const cleanName = opts.customerName || "Customer Arexans";

  try {
    const res = await fetch(`${POKETO_API_BASE}/api/v1/invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": orderId,
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount)),
        title: opts.title || `Arexans Store - ${orderId}`,
        referenceId: orderId,
        customer: {
          name: cleanName,
          email: "customer@arexans.my.id",
          phone: opts.customerWhatsapp || null,
        },
      }),
    });

    const json = await res.json().catch(() => null);
    if (!json || !json.data) {
      return { ok: false, error: json?.message || `Gagal membuat invoice Poketo (HTTP ${res.status})` };
    }

    const inv = json.data;
    const paymentUrl = inv.paymentUrl || `https://pay.poketo.id/inv/${inv.id}`;
    let totalAmount = inv.totalAmount || amount;
    const matchSlug = (paymentUrl || "").match(/\/inv\/([a-zA-Z0-9_\-]+)/);
    const slug = matchSlug ? matchSlug[1] : (inv.id || "");

    let qrString = "";
    let vaBanks: any[] = [];
    let quotes: any = null;
    let initialVaData: any = null;
    let initialAkulakuData: any = null;
    let initialCardData: any = null;

    // Fetch public invoice details (vaBanks, quotes)
    try {
      const pubRes = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(slug)}`);
      const pubData = await pubRes.json().catch(() => null);
      if (pubData?.invoice) {
        vaBanks = pubData.invoice.vaBanks || [];
        quotes = pubData.invoice.quotes || null;
      }

      // Default initiate QRIS
      const qrisRes = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "QRIS" }),
      });
      const qrisData = await qrisRes.json().catch(() => null);
      if (qrisData?.payment?.qrContent) {
        qrString = qrisData.payment.qrContent;
        if (requestedChannel === "QRIS") {
          totalAmount = qrisData.payment.amount || quotes?.QRIS?.totalAmount || totalAmount;
        }
      }

      // If user selected VA, initiate immediately
      if (requestedChannel === "VA") {
        const vaRes = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(slug)}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "VA", bank: requestedBank }),
        });
        const vaJson = await vaRes.json().catch(() => null);
        if (vaJson?.success && vaJson?.payment) {
          initialVaData = vaJson.payment;
          totalAmount = vaJson.payment.amount || quotes?.VA?.totalAmount || totalAmount;
        }
      } else if (requestedChannel === "AKULAKU") {
        const payer = opts.payer || {
          name: cleanName,
          phone: opts.customerWhatsapp || "08123456789",
          address: "Jl. Merdeka No. 1",
          city: "Jakarta Selatan",
          state: "DKI Jakarta",
          postcode: "12190",
        };
        const akuRes = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(slug)}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "AKULAKU", payer }),
        });
        const akuJson = await akuRes.json().catch(() => null);
        if (akuJson?.success && akuJson?.payment) {
          initialAkulakuData = akuJson.payment;
          totalAmount = akuJson.payment.amount || quotes?.AKULAKU?.totalAmount || totalAmount;
        }
      } else if (requestedChannel === "CARD") {
        const cardRes = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(slug)}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "CARD" }),
        });
        const cardJson = await cardRes.json().catch(() => null);
        if (cardJson?.success && cardJson?.payment) {
          initialCardData = cardJson.payment;
          totalAmount = cardJson.payment.amount || quotes?.CARD?.totalAmount || totalAmount;
        }
      }
    } catch (pubErr) {
      console.warn("Poketo public pay prefetch error:", pubErr);
    }

    return {
      ok: true,
      id: inv.id,
      slug,
      paymentUrl,
      qrString,
      totalAmount,
      vaBanks,
      quotes,
      selectedChannel: requestedChannel,
      selectedBank: requestedBank,
      vaData: initialVaData,
      akulakuData: initialAkulakuData,
      cardData: initialCardData,
    };
  } catch (err: any) {
    console.error("poketoCreateInvoice error:", err);
    return { ok: false, error: `Gagal menghubungi Poketo: ${err?.message || err}` };
  }
}

export async function poketoCheckStatus(
  cfg: PaymentConfig,
  slugOrId: string
): Promise<{ status: string; isPaid: boolean; totalAmount?: number; raw?: any }> {
  if (!slugOrId) return { status: "", isPaid: false };
  const clean = slugOrId.replace(/.*\/inv\//, "").trim();

  // Try public invoice endpoint first
  try {
    const res = await fetch(`${POKETO_PAY_BASE}/api/public/invoices/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const inv = json?.invoice;
      if (inv) {
        const st = String(inv.status || "").toUpperCase();
        const isPaid = st === "PAID" || st === "SETTLED" || st === "SUCCESS";
        return {
          status: st.toLowerCase(),
          isPaid,
          totalAmount: inv.totalAmount || inv.amount,
          raw: inv,
        };
      }
    }
  } catch {}

  // If public failed or 404, try API v1 with API key
  const apiKey = cfg.poketo?.apiKey || DEFAULT_POKETO_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`${POKETO_API_BASE}/api/v1/invoices/${encodeURIComponent(clean)}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const inv = json?.data;
        if (inv) {
          const st = String(inv.status || "").toUpperCase();
          const isPaid = st === "PAID" || st === "SETTLED" || st === "SUCCESS";
          return {
            status: st.toLowerCase(),
            isPaid,
            totalAmount: inv.totalAmount || inv.amount,
            raw: inv,
          };
        }
      }
    } catch {}
  }

  return { status: "", isPaid: false };
}
