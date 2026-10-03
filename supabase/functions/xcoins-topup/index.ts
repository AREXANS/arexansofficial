import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders, jsonHeaders, loadPaymentConfig, resolveGateway,
  arexansCreateQris, pakasirCreateQris, qrImageUrl, saveGatewayTxId,
} from "../_shared/payment.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { userId, amount, gateway: requestedGateway } = await req.json();

    if (!userId || !amount || amount < 1000) {
      return new Response(JSON.stringify({ error: "Minimal top-up Rp 1.000" }), { status: 400, headers: jsonHeaders });
    }

    const cfg = await loadPaymentConfig(supabase);
    const gateway = resolveGateway(cfg, requestedGateway);

    const orderId = `TOPUP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let qrString = "";
    let qrisUrl = "";
    let totalAmount = amount;

    if (gateway === "arexanspay") {
      const result = await arexansCreateQris(cfg, amount);
      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, fallback: true, error: result.error }),
          { status: 200, headers: jsonHeaders });
      }
      qrString = result.qrString || "";
      totalAmount = result.totalAmount || amount;
      qrisUrl = qrImageUrl(qrString);
      if (result.gatewayTxId) await saveGatewayTxId(supabase, orderId, result.gatewayTxId);
    } else if (cfg.pakasir.mode === "live" && cfg.pakasir.configured) {
      const result = await pakasirCreateQris(cfg, orderId, amount);
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: jsonHeaders });
      }
      qrString = result.qrString || "";
      totalAmount = result.totalAmount || amount;
      qrisUrl = qrImageUrl(qrString);
    } else {
      qrString = `DEMO-${orderId}`;
      qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=DEMO-${orderId}`;
    }

    await supabase.from("transactions").insert({
      transaction_id: orderId,
      customer_name: "Deposit XCoins",
      package_name: "Deposit XCoins",
      package_duration: 0,
      original_amount: amount,
      total_amount: totalAmount,
      status: "pending",
      qr_string: qrString,
      license_key: userId,
      expires_at: expiresAt.toISOString(),
    });

    return new Response(JSON.stringify({
      success: true, transactionId: orderId, qr_string: qrString, qris_url: qrisUrl,
      totalAmount, expiresAt: expiresAt.toISOString(),
      mode: gateway === "arexanspay" ? "live" : cfg.pakasir.mode, gateway,
    }), { status: 200, headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("xcoins-topup error:", error);
    return new Response(JSON.stringify({ error: "Gagal membuat top-up." }), { status: 500, headers: jsonHeaders });
  }
});
