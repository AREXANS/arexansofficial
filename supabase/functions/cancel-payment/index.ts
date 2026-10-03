import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders, jsonHeaders, loadPaymentConfig,
  arexansCancel, clearGatewayTxId, getGatewayTxId, pakasirCancel,
} from "../_shared/payment.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { transactionId } = await req.json();

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Transaction ID required" }), { status: 400, headers: jsonHeaders });
    }

    const cfg = await loadPaymentConfig(supabase);
    const gatewayTxId = await getGatewayTxId(supabase, transactionId);

    if (gatewayTxId) {
      await arexansCancel(cfg, gatewayTxId);
      await clearGatewayTxId(supabase, transactionId);
    } else if (cfg.pakasir.mode === "live" && cfg.pakasir.configured) {
      const { data: tx } = await supabase
        .from("transactions").select("total_amount, original_amount")
        .eq("transaction_id", transactionId).maybeSingle();
      await pakasirCancel(cfg, transactionId, tx?.original_amount || tx?.total_amount || 0);
    }

    await supabase.from("transactions").update({ status: "cancelled" }).eq("transaction_id", transactionId);

    return new Response(JSON.stringify({ success: true, message: "Transaction cancelled" }),
      { status: 200, headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("cancel-payment error:", error);
    return new Response(JSON.stringify({ error: "Gagal membatalkan transaksi." }), { status: 500, headers: jsonHeaders });
  }
});
