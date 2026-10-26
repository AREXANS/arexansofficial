import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key, x-webhook-signature",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// Generic client-facing error to prevent enumeration / info leakage
function genericError(status = 400) {
  return new Response(JSON.stringify({ success: false, error: "Invalid request" }), { status, headers: jsonHeaders });
}
function okAck() {
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let rawBodyText = "";
    let body: Record<string, unknown> = {};
    try {
      rawBodyText = await req.text();
      body = JSON.parse(rawBodyText);
    } catch {
      return genericError(400);
    }

    const url = new URL(req.url);
    const queryKey = url.searchParams.get("key") || url.searchParams.get("webhook_key") || "";

    // Detect source
    const xmpSigHeader = req.headers.get("x-xmp-signature") || "";
    const xmpEventHeader = req.headers.get("x-xmp-event") || "";
    const isXMPayment = !!xmpSigHeader || !!xmpEventHeader || (body.event && typeof body.event === "string" && (body.event.startsWith("invoice.") || body.event === "test.ping")) || (body.data && (body.data as any).order_id && !body.project);
    const isPakasir = !isXMPayment && !!body.order_id && !!body.project;
    const isArexans = !isXMPayment && (!body.project && (!!body.transactionId || !!body.transaction_id || !!body.secret
      || !!req.headers.get("x-arexanspay-signature") || !!req.headers.get("x-casaku-signature")
      || !!req.headers.get("x-webhook-key") || !!body.webhook_key));

    if (isXMPayment) {
      // === XMPAYMENT (https://xmpayment.my.id/dashboard/docs) ===
      const event = String(body.event || xmpEventHeader || "");
      if (event === "test.ping") {
        return new Response(JSON.stringify({ received: true, pong: true }), { status: 200, headers: jsonHeaders });
      }

      const xmpData = (body.data as any) || body;
      const orderId = String(xmpData.order_id || body.order_id || "");
      if (!orderId) {
        console.warn("[payment-webhook] xmpayment missing order_id");
        return genericError(400);
      }

      // Check webhook secret
      const { data: whSettings } = await supabase
        .from("app_settings").select("key, value")
        .in("key", ["xmpayment_webhook_secret", "xmp_webhook_secret", "xmpayment_api_key", "xmp_api_key"]);
      const s = Object.fromEntries((whSettings || []).map((r: any) => [r.key, (r.value ?? "").toString().trim()]));
      const secret = s.xmpayment_webhook_secret || s.xmp_webhook_secret || "whsec_bYGhuiJpREZP4N5zB0bCMOP6LrDAQ3wsOJzOThgNZKY";
      const apiKey = s.xmpayment_api_key || s.xmp_api_key || "xmp_live_d2b8ea709d5d7a57ff974cd771435e0f58d4da888593350b";

      let verified = false;

      // 1. Verify HMAC-SHA256 signature if provided
      if (xmpSigHeader && secret) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
          );
          const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBodyText));
          const expectedSig = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
          verified = await timingSafeEqual(xmpSigHeader.toLowerCase().trim(), expectedSig.toLowerCase().trim());
        } catch (err) {
          console.error("[payment-webhook] xmp signature error:", err);
        }
      }

      // 2. Fallback: Verify via XMPayment status API directly (100% reliable)
      if (!verified && apiKey) {
        try {
          const checkRes = await fetch(`https://xmpayment.my.id/api/v1/status/${encodeURIComponent(orderId)}`, {
            headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey }
          });
          const checkJson = await checkRes.json();
          const st = String(checkJson?.data?.status || "").toUpperCase();
          if (st === "SETTLED" || checkJson?.data?.is_paid === true) {
            verified = true;
          }
        } catch (err) {
          console.error("[payment-webhook] xmp verify api call error:", err);
        }
      }

      if (!verified) {
        console.warn("[payment-webhook] xmp verification failed for", orderId);
        return genericError(401);
      }

      const status = String(xmpData.status || "").toLowerCase();
      const okStatuses = ["settled", "paid", "success", "completed"];
      if (event === "invoice.paid" || okStatuses.includes(status)) {
        const { data: tx } = await supabase
          .from("transactions").select("*").eq("transaction_id", orderId).maybeSingle();

        if (tx && tx.status !== "paid" && tx.status !== "claimed") {
          await supabase.from("transactions").update({
            status: "claimed",
            paid_at: new Date().toISOString()
          }).eq("id", tx.id);
          await handlePostPayment(supabase, tx);
        }
      }

      return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
    }

    if (isPakasir) {
      // === PAKASIR ===
      // Pakasir does NOT send a signature/webhook_key in the payload (see docs section D).
      // Per Pakasir's own recommendation, we authenticate by calling back the
      // Transaction Detail API with our secret api_key. If Pakasir confirms the
      // status is "completed" for this project+order_id+amount, the webhook is genuine.
      const transactionId = String(body.order_id || "");
      const webhookAmount = Number(body.amount || 0);
      const webhookProject = String(body.project || "");
      if (!transactionId || !webhookAmount) return genericError(400);

      const status = String(body.status || "").toLowerCase();
      const okStatuses = ["completed", "paid", "success", "settled"];
      if (!okStatuses.includes(status)) return okAck();

      const { data: transaction } = await supabase
        .from("transactions").select("*").eq("transaction_id", transactionId).maybeSingle();
      if (!transaction) return okAck();
      if (transaction.status === "paid" || transaction.status === "claimed") return okAck();

      // Verify by calling Pakasir back
      const { data: settings } = await supabase
        .from("app_settings").select("key, value").in("key", ["pakasir_slug", "pakasir_api_key"]);
      const s = Object.fromEntries((settings || []).map((r: any) => [r.key, r.value]));
      if (!s.pakasir_slug || !s.pakasir_api_key) {
        console.error("[payment-webhook] pakasir credentials missing");
        return genericError(503);
      }
      if (webhookProject && webhookProject !== s.pakasir_slug) {
        console.warn("[payment-webhook] pakasir project mismatch");
        return genericError(401);
      }

      // Use the amount the webhook reports (Pakasir matches on that value).
      // Fall back to our stored original_amount for the callback verification.
      const verifyAmount = webhookAmount || transaction.original_amount || transaction.total_amount;
      const verifyUrl = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(s.pakasir_slug)}&amount=${verifyAmount}&order_id=${encodeURIComponent(transactionId)}&api_key=${encodeURIComponent(s.pakasir_api_key)}`;
      let verified = false;
      try {
        const res = await fetch(verifyUrl);
        const data = await res.json();
        const pkStatus = String(data?.transaction?.status || "").toLowerCase();
        verified = okStatuses.includes(pkStatus);
        console.log("[payment-webhook] pakasir verify", transactionId, pkStatus);
      } catch (err) {
        console.error("[payment-webhook] pakasir verify failed", err);
      }
      if (!verified) return genericError(401);

      await supabase.from("transactions").update({ status: "claimed", paid_at: new Date().toISOString() }).eq("id", transaction.id);
      await handlePostPayment(supabase, transaction);
      return okAck();
    }

    if (isArexans) {
      // === AREXANSPAY (https://www.arexanspay.my.id/docs) ===
      const { data: whSettings } = await supabase
        .from("app_settings").select("key, value")
        .in("key", ["arexanspay_webhook_key", "casaku_webhook_key", "casaku_webhook_secret", "cashify_webhook_key"]);
      const s = Object.fromEntries((whSettings || []).map((r: any) => [r.key, (r.value ?? "").toString().trim()]));
      const expected = s.arexanspay_webhook_key || s.casaku_webhook_key || s.casaku_webhook_secret || s.cashify_webhook_key || "";
      if (!expected) {
        console.error("[payment-webhook] arexanspay_webhook_key not configured");
        return genericError(503);
      }

      const provided = (body.secret || body.webhook_key || body.key || req.headers.get("x-webhook-key") || queryKey || "").toString().trim();
      let keyMatches = false;
      if (provided) {
        keyMatches = await timingSafeEqual(provided, expected);
      }

      // Check HMAC signature if a signature header is present
      const signature = req.headers.get("x-arexanspay-signature") || req.headers.get("x-casaku-signature") || req.headers.get("x-signature") || "";
      if (!keyMatches && signature) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", enc.encode(expected), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
          );
          const rawSig = signature.trim().toLowerCase();
          const sigBytes = new Uint8Array(rawSig.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
          keyMatches = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(rawBodyText));
        } catch (e) {
          console.error("[payment-webhook] arexanspay signature verify failed", e);
        }
      }

      if (!keyMatches) {
        console.warn("[payment-webhook] arexanspay webhook key mismatch");
        return genericError(401);
      }

      const gatewayTxId = String(body.transactionId || body.transaction_id || "");
      const status = String(body.status || "").toLowerCase();
      const okStatuses = ["paid", "success", "completed", "settled"];
      if (!okStatuses.includes(status)) return okAck();

      // Look up our internal transaction mapped to gatewayTxId
      const { data: mappings } = await supabase
        .from("app_settings").select("key, value").eq("value", gatewayTxId);

      const matchedMappings = (mappings || []).filter((m: any) =>
        m.key?.startsWith("arexanspay_tx_") || m.key?.startsWith("casaku_tx_") || m.key?.startsWith("cashify_tx_")
      );

      if (matchedMappings.length === 0) {
        // Fallback: match by reference / order_id / transactionId directly if available
        const ref = body.ref || body.reference || body.order_id || body.orderId || gatewayTxId;
        if (ref) {
          const { data: tx } = await supabase.from("transactions").select("*").eq("transaction_id", String(ref)).maybeSingle();
          if (tx && tx.status !== "paid" && tx.status !== "claimed") {
            await supabase.from("transactions").update({ status: "claimed", paid_at: new Date().toISOString() }).eq("id", tx.id);
            await handlePostPayment(supabase, tx);
          }
        }
        return okAck();
      }

      for (const mapping of matchedMappings) {
        const ourTxId = String(mapping.key).replace(/^arexanspay_tx_|^casaku_tx_|^cashify_tx_/, "");
        const { data: transaction } = await supabase
          .from("transactions").select("*").eq("transaction_id", ourTxId).maybeSingle();
        if (transaction && transaction.status !== "paid" && transaction.status !== "claimed") {
          await supabase.from("transactions").update({ status: "claimed", paid_at: new Date().toISOString() }).eq("id", transaction.id);
          await handlePostPayment(supabase, transaction);
        }
        await supabase.from("app_settings").delete().eq("key", mapping.key);
      }
      return okAck();
    }

    // Generic fallback: REQUIRE explicit transaction identifier AND shared secret; NEVER match by amount.
    const { data: genSetting } = await supabase
      .from("app_settings").select("value").eq("key", "generic_webhook_key").maybeSingle();
    const expected = (genSetting?.value || "").toString().trim();
    if (!expected) return genericError(503);
    const provided = (body.webhook_key || body.key || req.headers.get("x-webhook-key") || "").toString();
    if (!(await timingSafeEqual(provided, expected))) return genericError(401);

    const transactionId = String(body.ref || body.transaction_id || body.reference || body.order_id || "");
    if (!transactionId) return genericError(400);

    const { data: transaction } = await supabase
      .from("transactions").select("*").eq("transaction_id", transactionId).maybeSingle();
    if (!transaction) return okAck();
    if (transaction.status !== "paid" && transaction.status !== "claimed") {
      await supabase.from("transactions").update({ status: "claimed", paid_at: new Date().toISOString() }).eq("id", transaction.id);
      await handlePostPayment(supabase, transaction);
    }
    return okAck();
  } catch (error: unknown) {
    // Log details server-side only; return generic message to caller.
    console.error("[payment-webhook] internal error", error);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

async function handlePostPayment(supabase: any, transaction: any) {
  if (transaction.package_name === "XCOINS_TOPUP" && transaction.license_key) {
    const userId = transaction.license_key;
    const { data: user } = await supabase.from("xcoins_balances").select("balance").eq("id", userId).single();
    if (user) {
      const newBalance = (user.balance || 0) + transaction.original_amount;
      await supabase.from("xcoins_balances").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", userId);
      await supabase.from("xcoins_transactions").insert({
        user_id: userId, type: "topup", amount: transaction.original_amount,
        balance_after: newBalance, description: `Deposit ${transaction.original_amount} XCoins`, reference_id: transaction.transaction_id,
      });
    }
  } else if (transaction.license_key) {
    await createLicenseKey(supabase, transaction);
  }

  try {
    const { data: discordSetting } = await supabase
      .from("app_settings").select("value").eq("key", "discord_webhook_url").maybeSingle();
    if (discordSetting?.value) {
      const embed = {
        title: "💰 Pembayaran Berhasil!",
        color: 0x00ff00,
        fields: [
          { name: "Transaction ID", value: transaction.transaction_id, inline: true },
          { name: "Customer", value: transaction.customer_name, inline: true },
          { name: "Package", value: `${transaction.package_name} (${transaction.package_duration} hari)`, inline: true },
          { name: "Amount", value: `Rp ${transaction.total_amount?.toLocaleString("id-ID") || 0}`, inline: true },
          { name: "License Key", value: transaction.license_key || "-", inline: false },
        ],
        timestamp: new Date().toISOString(),
      };
      await fetch(discordSetting.value, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }
  } catch (e) {
    console.error("[payment-webhook] discord notify failed");
  }
}

async function createLicenseKey(supabase: any, transaction: any) {
  try {
    const key = transaction.license_key;
    if (!key) return;
    const { data } = await supabase.from("app_settings").select("value").eq("key", "license_keys").maybeSingle();
    let keys: any[] = [];
    if (data) { try { keys = JSON.parse(data.value || "[]"); } catch { keys = []; } }

    const existingIdx = keys.findIndex((k: any) => k.key === key);
    const isLifetime = transaction.package_name === "LIFETIME";

    if (isLifetime) {
      const permanentExpiry = new Date("2099-12-31T23:59:59.000Z");
      if (existingIdx >= 0) {
        keys[existingIdx].expired = permanentExpiry.toISOString();
        keys[existingIdx].role = "ADMIN";
      } else {
        keys.push({ key, expired: permanentExpiry.toISOString(), created: new Date().toISOString(), role: "ADMIN", maxHwid: 1, frozenUntil: null, frozenRemainingMs: null, hwids: [], robloxUsers: [] });
      }
    } else {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (Number(transaction.package_duration) || 30));
      if (existingIdx >= 0) {
        const existing = keys[existingIdx];
        const currentExpiry = new Date(existing.expired);
        const now = new Date();
        const baseDate = currentExpiry > now ? currentExpiry : now;
        baseDate.setDate(baseDate.getDate() + (Number(transaction.package_duration) || 30));
        keys[existingIdx].expired = baseDate.toISOString();
        keys[existingIdx].role = transaction.package_name || existing.role;
      } else {
        keys.push({ key, expired: expiryDate.toISOString(), created: new Date().toISOString(), role: transaction.package_name || "NORMAL", maxHwid: 1, frozenUntil: null, frozenRemainingMs: null, hwids: [], robloxUsers: [] });
      }
    }

    await supabase.from("app_settings").upsert({
      key: "license_keys", value: JSON.stringify(keys), updated_at: new Date().toISOString(), description: "License keys database"
    }, { onConflict: "key" });
  } catch (error) {
    console.error("[payment-webhook] createLicenseKey failed");
  }
}
