import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders, jsonHeaders, loadPaymentConfig,
  arexansCheckStatus, clearGatewayTxId, getGatewayTxId, xmpaymentCheckStatus, pakasirIsPaid,
  sendDiscordNotification,
} from "../_shared/payment.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { transactionId, userId } = await req.json();

    if (!transactionId || !userId) {
      return new Response(JSON.stringify({ error: "Missing data" }), { status: 400, headers: jsonHeaders });
    }

    const { data: tx } = await supabase.from("transactions")
      .select("*").eq("transaction_id", transactionId).maybeSingle();

    if (!tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), { status: 404, headers: jsonHeaders });
    }

    if (tx.expires_at && new Date(tx.expires_at) < new Date() && tx.status === "pending") {
      await supabase.from("transactions").update({ status: "expired" }).eq("id", tx.id);
      return new Response(JSON.stringify({ expired: true }), { status: 200, headers: jsonHeaders });
    }

    if (tx.status === "paid") {
      const { data: user } = await supabase.from("xcoins_balances").select("balance").eq("id", userId).single();
      return new Response(JSON.stringify({ paid: true, balance: user?.balance || 0 }), { status: 200, headers: jsonHeaders });
    }

    const cfg = await loadPaymentConfig(supabase);
    let isPaid = false;

    if (cfg.simulation) {
      isPaid = true;
    } else {
      // 1. Check XMPayment
      if (cfg.xmpayment.configured) {
        const xmpRes = await xmpaymentCheckStatus(cfg, transactionId);
        if (xmpRes.isPaid) isPaid = true;
      }

      // 2. Check ArexansPay
      const gatewayTxId = await getGatewayTxId(supabase, transactionId);
      if (!isPaid && gatewayTxId && cfg.arexanspay.configured) {
        const st = await arexansCheckStatus(cfg, gatewayTxId);
        if (st === "cancel" || st === "cancelled") {
          await supabase.from("transactions").update({ status: "cancelled" }).eq("id", tx.id);
          await clearGatewayTxId(supabase, transactionId);
          return new Response(JSON.stringify({ cancelled: true }), { status: 200, headers: jsonHeaders });
        }
        if (["paid", "success", "completed", "settled"].includes(st)) isPaid = true;
      } else if (!isPaid && cfg.pakasir.configured && cfg.pakasir.mode === "live") {
        const pkPaid = await pakasirIsPaid(cfg, transactionId, [tx.total_amount, tx.original_amount]);
        if (pkPaid) isPaid = true;
      } else if (!isPaid && (cfg.xmpayment.mode === "sandbox" || cfg.pakasir.mode === "demo" || cfg.pakasir.mode === "sandbox")) {
        if (Date.now() - new Date(tx.created_at).getTime() > 5000) isPaid = true;
      }
    }

    if (isPaid) {
      await supabase.from("transactions").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", tx.id);
      await clearGatewayTxId(supabase, transactionId);

      const { data: user } = await supabase.from("xcoins_balances").select("balance").eq("id", userId).single();
      const xcoinsAmount = tx.original_amount;
      const newBalance = (user?.balance || 0) + xcoinsAmount;

      await supabase.from("xcoins_balances").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", userId);

      await supabase.from("xcoins_transactions").insert({
        user_id: userId, type: "topup", amount: xcoinsAmount,
        balance_after: newBalance, description: `Deposit ${xcoinsAmount} XCoins`,
        reference_id: transactionId
      });

      sendDiscordNotification(cfg, {
        orderId: transactionId,
        packageName: "Deposit XCoins",
        customerName: tx.customer_name || "User",
        licenseKey: userId,
        amount: tx.total_amount || xcoinsAmount,
        gateway: "QRIS",
        status: "success",
      });

      return new Response(JSON.stringify({ paid: true, balance: newBalance, added: xcoinsAmount }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ paid: false, status: tx.status }), { status: 200, headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("xcoins-check-topup error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});