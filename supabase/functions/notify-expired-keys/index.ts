import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KeyData {
  key: string;
  expired: string;
  role: string;
  maxHwid: number;
  frozenUntil: string | null;
  hwids: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Fonnte token
    const { data: tokenSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "fonnte_token")
      .maybeSingle();

    if (!tokenSetting?.value) {
      return new Response(
        JSON.stringify({ error: "Fonnte token belum dikonfigurasi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all license keys
    const { data: keyData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "license_keys")
      .maybeSingle();

    if (!keyData?.value) {
      return new Response(
        JSON.stringify({ success: true, message: "No keys found", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let keys: KeyData[] = [];
    try {
      keys = JSON.parse(keyData.value);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid key database format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    // Find keys that expired within last 24 hours
    const recentlyExpired = keys.filter((k) => {
      if (k.frozenUntil) return false;
      const expDate = new Date(k.expired);
      if (expDate >= now) return false; // not expired yet
      const diffMs = now.getTime() - expDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours <= 24; // expired within last 24 hours
    });

    if (recentlyExpired.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No recently expired keys", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the key names to look up in transactions
    const expiredKeyNames = recentlyExpired.map((k) => k.key);

    // Find transactions with these keys that have customer_whatsapp
    const { data: transactions } = await supabase
      .from("transactions")
      .select("license_key, customer_name, customer_whatsapp, package_name")
      .in("license_key", expiredKeyNames)
      .eq("status", "paid")
      .not("customer_whatsapp", "is", null);

    // Also check XCoins transactions (keys purchased via XCoins have transaction_id starting with "XC-")
    // Look up via transactions table which stores the key and link to xcoins user
    const xcoinsTxIds = (transactions || [])
      .filter((t) => t.license_key && expiredKeyNames.includes(t.license_key))
      .map((t) => t.license_key);

    // Build a map of key → phone numbers to notify
    const keyPhoneMap = new Map<string, Set<string>>();

    // From direct transactions with customer_whatsapp
    for (const tx of transactions || []) {
      if (!tx.license_key || !tx.customer_whatsapp) continue;
      if (!keyPhoneMap.has(tx.license_key)) keyPhoneMap.set(tx.license_key, new Set());
      let phone = tx.customer_whatsapp.replace(/[^0-9]/g, "");
      if (phone.startsWith("0")) phone = "62" + phone.slice(1);
      if (!phone.startsWith("62")) phone = "62" + phone;
      keyPhoneMap.get(tx.license_key)!.add(phone);
    }

    // Also check XCoins: find transactions with XC- prefix that match expired keys
    const { data: xcTransactions } = await supabase
      .from("transactions")
      .select("transaction_id, license_key, customer_name")
      .in("license_key", expiredKeyNames)
      .eq("status", "paid")
      .like("transaction_id", "XC-%");

    if (xcTransactions && xcTransactions.length > 0) {
      // For XCoins purchases, the customer_name is often the key itself
      // We need to find the xcoins user who made the purchase
      // XCoins transactions in xcoins_transactions table have reference_id matching transaction_id
      const xcTxIds = xcTransactions.map((t) => t.transaction_id);
      
      const { data: xcoinsTxs } = await supabase
        .from("xcoins_transactions")
        .select("user_id, reference_id")
        .in("reference_id", xcTxIds);

      if (xcoinsTxs && xcoinsTxs.length > 0) {
        const userIds = [...new Set(xcoinsTxs.map((t) => t.user_id))];
        
        const { data: users } = await supabase
          .from("xcoins_balances")
          .select("id, phone")
          .in("id", userIds);

        if (users) {
          for (const xcTx of xcoinsTxs) {
            const user = users.find((u) => u.id === xcTx.user_id);
            if (!user?.phone) continue;
            
            const matchingTx = xcTransactions.find((t) => t.transaction_id === xcTx.reference_id);
            if (!matchingTx?.license_key) continue;
            
            if (!keyPhoneMap.has(matchingTx.license_key)) {
              keyPhoneMap.set(matchingTx.license_key, new Set());
            }
            keyPhoneMap.get(matchingTx.license_key)!.add(user.phone);
          }
        }
      }
    }

    // Track already notified keys (using app_settings to avoid duplicate notifications)
    const { data: notifiedSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "notified_expired_keys")
      .maybeSingle();

    let alreadyNotified: string[] = [];
    try {
      alreadyNotified = notifiedSetting?.value ? JSON.parse(notifiedSetting.value) : [];
    } catch {
      alreadyNotified = [];
    }

    let notifiedCount = 0;
    const errors: string[] = [];
    const newlyNotified: string[] = [];

    for (const [keyName, phones] of keyPhoneMap.entries()) {
      // Skip if already notified
      if (alreadyNotified.includes(keyName)) continue;

      const keyInfo = recentlyExpired.find((k) => k.key === keyName);
      if (!keyInfo) continue;

      const expiredDate = new Date(keyInfo.expired);
      const expiredText = expiredDate.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      for (const phone of phones) {
        const message = `⚠️ *Key Sistem Expired*\n\nKey: *${keyName}*\nPaket: *${keyInfo.role.toUpperCase()}*\nExpired: ${expiredText}\n\nKey kamu sudah expired! Segera perpanjang untuk melanjutkan akses.\n\n🔗 Beli lagi di:\nhttps://tools.arexans.my.id\n\n> _Sent via tools.arexans.my.id_`;

        try {
          const formData = new FormData();
          formData.append("target", phone);
          formData.append("message", message);

          const res = await fetch("https://api.fonnte.com/send", {
            method: "POST",
            headers: { Authorization: tokenSetting.value },
            body: formData,
          });

          const resData = await res.json();
          console.log(`Notify ${phone} for key ${keyName}:`, JSON.stringify(resData));

          if (resData.status) {
            notifiedCount++;
          } else {
            errors.push(`${phone}: ${resData.reason || "Failed"}`);
          }
        } catch (err) {
          errors.push(`${phone}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      newlyNotified.push(keyName);
    }

    // Update notified keys list (keep last 500 entries to prevent bloat)
    const updatedNotified = [...alreadyNotified, ...newlyNotified].slice(-500);
    await supabase.from("app_settings").upsert(
      {
        key: "notified_expired_keys",
        value: JSON.stringify(updatedNotified),
        description: "Keys yang sudah dikirim notifikasi expired",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        expiredKeys: expiredKeyNames.length,
        keysWithPhone: keyPhoneMap.size,
        notified: notifiedCount,
        skippedAlreadyNotified: alreadyNotified.filter((k) => expiredKeyNames.includes(k)).length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
