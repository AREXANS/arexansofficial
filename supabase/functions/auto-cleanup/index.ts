import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: settings } = await supabase
      .from("app_settings").select("key, value")
      .in("key", [
        "auto_delete_transactions_enabled", "auto_delete_transactions_days",
        "auto_delete_keys_enabled", "auto_delete_keys_days"
      ]);

    const s = Object.fromEntries((settings || []).map((r: any) => [r.key, r.value]));
    const results: string[] = [];

    // Auto-delete old transactions
    if (s.auto_delete_transactions_enabled === "on") {
      const days = parseInt(s.auto_delete_transactions_days) || 30;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { count, error } = await supabase
        .from("transactions")
        .delete()
        .lt("created_at", cutoff)
        .select("id", { count: "exact", head: true });
      
      if (error) {
        console.error("Delete transactions error:", error);
        results.push(`Transactions: error - ${error.message}`);
      } else {
        // Re-run without head to actually delete
        await supabase.from("transactions").delete().lt("created_at", cutoff);
        results.push(`Transactions: deleted older than ${days} days`);
      }
    }

    // Auto-delete expired keys
    if (s.auto_delete_keys_enabled === "on") {
      const days = parseInt(s.auto_delete_keys_days) || 7;
      const cutoff = new Date(Date.now() - days * 86400000);

      const { data: keyData } = await supabase
        .from("app_settings").select("value").eq("key", "license_keys").maybeSingle();

      if (keyData?.value) {
        try {
          const keys = JSON.parse(keyData.value);
          const before = keys.length;
          const filtered = keys.filter((k: any) => {
            if (k.frozenUntil) return true; // keep frozen
            const expDate = new Date(k.expired);
            if (expDate > new Date()) return true; // not expired yet
            // Expired: check if expired for more than X days
            return expDate > cutoff;
          });
          
          if (filtered.length < before) {
            await supabase.from("app_settings").update({
              value: JSON.stringify(filtered),
              updated_at: new Date().toISOString()
            }).eq("key", "license_keys");
            results.push(`Keys: deleted ${before - filtered.length} expired keys (older than ${days} days)`);
          } else {
            results.push(`Keys: no expired keys to delete`);
          }
        } catch {
          results.push("Keys: failed to parse");
        }
      }
    }

    // Notify expired keys via WhatsApp
    try {
      const notifyRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-expired-keys`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({}),
        }
      );
      const notifyData = await notifyRes.json();
      if (notifyData.notified > 0) {
        results.push(`Notifications: sent ${notifyData.notified} expired key alerts`);
      } else {
        results.push(`Notifications: no expired keys to notify`);
      }
    } catch (err) {
      console.error("Notify error:", err);
      results.push(`Notifications: error - ${err instanceof Error ? err.message : "unknown"}`);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: unknown) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
