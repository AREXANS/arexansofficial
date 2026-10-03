import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "log");

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    if (action === "log") {
      const event = ["visit", "login_success", "login_failed"].includes(String(body?.event))
        ? String(body.event)
        : "visit";

      let geo: Record<string, unknown> | null = null;
      try {
        const r = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,query`,
        );
        const g = await r.json();
        if (g?.status === "success") geo = g;
      } catch { /* ignore */ }

      const { error } = await supabase.from("developer_access_logs").insert({
        ip_address: ip,
        event,
        device_id: body?.deviceId ? String(body.deviceId).slice(0, 120) : null,
        device_name: body?.deviceName ? String(body.deviceName).slice(0, 200) : null,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 500),
        device_info: body?.deviceInfo ?? null,
        geo_info: geo,
        is_approved_device: body?.isApprovedDevice === true,
      });
      if (error) console.error("insert error", error.message);
      return json({ ok: true, ip });
    }

    // Admin-only actions
    const adminKey = String(body?.adminKey || "");
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "admin_key").maybeSingle();
    if (!adminKey || !setting?.value || adminKey !== setting.value) {
      return json({ error: "unauthorized" }, 401);
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("developer_access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json({ error: "failed" }, 500);
      return json({ logs: data ?? [] });
    }

    if (action === "clear") {
      await supabase.from("developer_access_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body?.id || "");
      if (!id) return json({ error: "invalid" }, 400);
      await supabase.from("developer_access_logs").delete().eq("id", id);
      return json({ ok: true });
    }

    return json({ error: "invalid action" }, 400);
  } catch (e) {
    console.error("dev-access-log error", e);
    return json({ error: "internal" }, 500);
  }
});
