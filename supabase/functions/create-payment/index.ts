import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders, jsonHeaders, loadPaymentConfig, resolveGateway,
  arexansCreateQris, xmpaymentCreateQris, pakasirCreateQris, qrImageUrl, saveGatewayTxId,
} from "../_shared/payment.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = await loadPaymentConfig(supabase);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    const body = await req.json();
    const {
      amount, customerName, packageName, packageDuration,
      licenseKey: customerLicenseKey, customerWhatsapp, deviceId, gateway: requestedGateway,
    } = body;

    if (!amount || amount < 1000) {
      return new Response(JSON.stringify({ error: "Amount must be at least 1000" }), { status: 400, headers: jsonHeaders });
    }

    const gateway = resolveGateway(cfg, requestedGateway);
    const orderId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let qrString = "";
    let qrisUrl = "";
    let totalAmount = amount;
    let gatewayTxId = "";

    if (gateway === "arexanspay") {
      const result = await arexansCreateQris(cfg, amount);
      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, fallback: true, error: result.error }),
          { status: 200, headers: jsonHeaders });
      }
      qrString = result.qrString || "";
      totalAmount = result.totalAmount || amount;
      qrisUrl = qrImageUrl(qrString);
      gatewayTxId = result.gatewayTxId || "";
      if (gatewayTxId) await saveGatewayTxId(supabase, orderId, gatewayTxId);
    } else if (gateway === "xmpayment" || cfg.xmpayment.configured) {
      const cleanCustName = customerName || customerLicenseKey || "Customer";
      const cleanEmail = `${cleanCustName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'buyer'}@arexans.my.id`;
      const result = await xmpaymentCreateQris(cfg, orderId, amount, {
        customerName: cleanCustName,
        customerEmail: cleanEmail,
        redirectUrl: "https://tools.arexans.my.id",
      });

      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: jsonHeaders });
      }
      qrString = result.qrString || "";
      totalAmount = result.totalAmount || amount;
      qrisUrl = result.qrCodeUrl || (qrString ? qrImageUrl(qrString) : "");
      gatewayTxId = result.gatewayTxId || orderId;
      if (gatewayTxId) await saveGatewayTxId(supabase, orderId, gatewayTxId);
    } else if (cfg.pakasir.mode === "live" && cfg.pakasir.configured) {
      const result = await pakasirCreateQris(cfg, orderId, amount);
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 400, headers: jsonHeaders });
      }
      qrString = result.qrString || "";
      totalAmount = result.totalAmount || amount;
      qrisUrl = qrImageUrl(qrString);
    } else {
      // Demo / sandbox mode
      qrString = `DEMO-${orderId}`;
      qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=DEMO-${orderId}`;
    }

    await supabase.from("transactions").insert({
      transaction_id: orderId,
      customer_name: customerName || "Customer",
      customer_whatsapp: customerWhatsapp || null,
      package_name: packageName || "NORMAL",
      package_duration: packageDuration || 1,
      original_amount: amount,
      total_amount: totalAmount,
      status: "pending",
      qr_string: qrString,
      license_key: customerLicenseKey || null,
      expires_at: expiresAt.toISOString(),
      device_id: deviceId || null,
      ip_address: clientIp,
    });

    return new Response(JSON.stringify({
      success: true,
      transactionId: orderId,
      qr_string: qrString,
      qris_url: qrisUrl,
      originalAmount: amount,
      totalAmount,
      expiresAt: expiresAt.toISOString(),
      mode: gateway === "arexanspay" ? "live" : (gateway === "xmpayment" ? cfg.xmpayment.mode : cfg.pakasir.mode),
      gateway,
    }), { status: 200, headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("create-payment error:", error);
    return new Response(JSON.stringify({ error: "Gagal membuat pembayaran. Silakan coba lagi." }),
      { status: 500, headers: jsonHeaders });
  }
});
