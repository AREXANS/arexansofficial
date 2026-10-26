import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders, jsonHeaders, loadPaymentConfig, PAID_STATUSES,
  arexansCheckStatus, clearGatewayTxId, getGatewayTxId, xmpaymentCheckStatus, pakasirIsPaid,
} from "../_shared/payment.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { transactionId } = await req.json();

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Transaction ID required" }), { status: 400, headers: jsonHeaders });
    }

    const { data: transaction } = await supabase
      .from("transactions").select("*").eq("transaction_id", transactionId).maybeSingle();

    if (!transaction) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), { status: 404, headers: jsonHeaders });
    }

    if (transaction.status === "paid" || transaction.status === "claimed") {
      return new Response(JSON.stringify({ success: true, paid: true, transaction }), { status: 200, headers: jsonHeaders });
    }

    const cfg = await loadPaymentConfig(supabase);
    const gatewayTxId = await getGatewayTxId(supabase, transactionId);

    let isPaid = false;
    let cancelled = false;

    // 1. Check XMPayment first (by order_id / transactionId)
    if (cfg.xmpayment.configured) {
      const xmpRes = await xmpaymentCheckStatus(cfg, transactionId);
      if (xmpRes.isPaid) {
        isPaid = true;
      } else if (xmpRes.status === "cancelled" || xmpRes.status === "cancel") {
        cancelled = true;
      }
    }

    // 2. Check ArexansPay if not yet paid and has mapping
    if (!isPaid && gatewayTxId) {
      const status = await arexansCheckStatus(cfg, gatewayTxId);
      if (PAID_STATUSES.includes(status)) isPaid = true;
      if (status === "cancel" || status === "cancelled" || status === "canceled") cancelled = true;
    }

    // 3. Fallback to Pakasir if configured
    if (!isPaid && cfg.pakasir.mode === "live" && cfg.pakasir.configured) {
      isPaid = await pakasirIsPaid(cfg, transactionId, [transaction.original_amount, transaction.total_amount]);
    }

    if (cfg.simulation) isPaid = true;

    // Demo/sandbox auto-pay after 5s
    if (!isPaid && !gatewayTxId && (cfg.xmpayment.mode === "sandbox" || cfg.pakasir.mode === "sandbox" || cfg.pakasir.mode === "demo")) {
      const elapsed = Date.now() - new Date(transaction.created_at).getTime();
      if (elapsed > 5000) isPaid = true;
    }

    if (!isPaid && transaction.expires_at && new Date(transaction.expires_at) < new Date()) {
      await supabase.from("transactions").update({ status: "expired" }).eq("transaction_id", transactionId);
      await clearGatewayTxId(supabase, transactionId);
      return new Response(JSON.stringify({ success: false, paid: false, expired: true }), { status: 200, headers: jsonHeaders });
    }

    if (!isPaid && cancelled) {
      await supabase.from("transactions").update({ status: "cancelled" }).eq("transaction_id", transactionId);
      await clearGatewayTxId(supabase, transactionId);
      return new Response(JSON.stringify({ success: false, paid: false, cancelled: true }), { status: 200, headers: jsonHeaders });
    }

    if (isPaid) {
      await supabase.from("transactions").update({ status: "claimed", paid_at: new Date().toISOString() })
        .eq("transaction_id", transactionId);

      if (transaction.license_key && transaction.package_name !== "XCOINS_TOPUP") {
        await createLicenseKey(supabase, transaction);
      }

      await clearGatewayTxId(supabase, transactionId);

      if (cfg.discordWebhookUrl) {
        await sendDiscordNotification(transaction, cfg.discordWebhookUrl);
      }

      return new Response(JSON.stringify({ success: true, paid: true, transaction: { ...transaction, status: "claimed" } }),
        { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ success: true, paid: false, transaction }), { status: 200, headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("check-payment error:", error);
    return new Response(JSON.stringify({ error: "Gagal memeriksa pembayaran." }), { status: 500, headers: jsonHeaders });
  }
});

async function createLicenseKey(supabase: any, transaction: any) {
  try {
    const key = transaction.license_key;
    if (!key) return;

    const isTokoScript = (
      (transaction.customer_name || '').includes('Toko Script') ||
      (transaction.package_name || '').startsWith('SCRIPT_')
    );

    if (isTokoScript) {
      // Save specifically to Toko Script Keys
      const { data: tData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "toko_scripts_keys_data")
        .maybeSingle();

      let tKeys = [];
      if (tData) {
        try { tKeys = JSON.parse(tData.value || "[]"); } catch { tKeys = []; }
      }

      const existingTIdx = tKeys.findIndex((k: any) => k.key.toUpperCase() === key.toUpperCase());
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (Number(transaction.package_duration) || 30));

      if (existingTIdx >= 0) {
        const existing = tKeys[existingTIdx];
        const currentExp = new Date(existing.expired);
        const now = new Date();
        const baseDate = currentExp > now ? currentExp : now;
        baseDate.setDate(baseDate.getDate() + (Number(transaction.package_duration) || 30));
        tKeys[existingTIdx].expired = baseDate.toISOString();
        tKeys[existingTIdx].transactionId = transaction.transaction_id;
      } else {
        tKeys.unshift({
          id: 'tsk_' + Math.random().toString(36).slice(2, 10),
          key,
          productId: transaction.package_name || 'unknown_script',
          productTitle: transaction.package_name || 'Toko Script',
          role: transaction.package_name || 'VIP',
          durationDays: Number(transaction.package_duration) || 30,
          createdAt: new Date().toISOString(),
          expired: expiryDate.toISOString(),
          maxHwid: 1,
          hwids: [],
          robloxUsers: [],
          frozenUntil: null,
          frozenRemainingMs: null,
          customerName: transaction.customer_name || 'Buyer',
          transactionId: transaction.transaction_id,
        });
      }

      await supabase
        .from("app_settings")
        .upsert({
          key: "toko_scripts_keys_data",
          value: JSON.stringify(tKeys),
          updated_at: new Date().toISOString(),
          description: "Database License Keys Toko Script",
        }, { onConflict: "key" });

      console.log(`Toko script key ${key} saved successfully`);
      return;
    }

    // Default: Arexans Tools key
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "license_keys")
      .maybeSingle();

    let keys = [];
    if (data) {
      try { keys = JSON.parse(data.value || "[]"); } catch { keys = []; }
    }

    const existingIdx = keys.findIndex((k: any) => k.key === key);
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
      console.log(`Extended key ${key} to ${baseDate.toISOString()}`);
    } else {
      keys.push({
        key,
        expired: expiryDate.toISOString(),
        created: new Date().toISOString(),
        role: transaction.package_name || "NORMAL",
        maxHwid: 1,
        frozenUntil: null,
        frozenRemainingMs: null,
        hwids: [],
        robloxUsers: []
      });
      console.log(`Created new key ${key}, expires ${expiryDate.toISOString()}`);
    }

    await supabase
      .from("app_settings")
      .upsert({
        key: "license_keys",
        value: JSON.stringify(keys),
        updated_at: new Date().toISOString(),
        description: "License keys database"
      }, { onConflict: "key" });

    console.log("License key saved successfully");
  } catch (error) {
    console.error("Create key error:", error);
  }
}

async function sendDiscordNotification(transaction: any, webhookUrl: string) {
  try {
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
    await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [embed] }) });
  } catch (error) {
    console.error("Discord webhook error:", error);
  }
}
