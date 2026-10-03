import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertStorageWritable } from "../_shared/storage-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

type KeyRecord = { key: string; expired: string; role?: string; frozenUntil?: string | null };

function sanitize(r: Record<string, unknown>, requesterKey?: string | null) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    owner_username: r.owner_username,
    game_id: r.game_id,
    teleport_data: r.teleport_data,
    is_public: r.is_public,
    source: r.source,
    created_at: r.created_at,
    updated_at: r.updated_at,
    owned: Boolean(requesterKey && r.owner_key === requesterKey),
  };
}

async function validateKey(supabase: ReturnType<typeof createClient>, key?: string | null) {
  if (!key) return { ok: false, error: "Key wajib diisi" };
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "license_keys").maybeSingle();
  if (error || !data) return { ok: false, error: "Database key tidak ditemukan" };
  let keys: KeyRecord[] = [];
  try { keys = JSON.parse(String(data.value || "[]")); } catch { return { ok: false, error: "Format database key rusak" }; }
  const found = keys.find((i) => i.key === key);
  if (!found) return { ok: false, error: "Key tidak valid" };
  const now = Date.now();
  if (found.frozenUntil && new Date(found.frozenUntil).getTime() > now) return { ok: false, error: "Key sedang frozen" };
  if (new Date(found.expired).getTime() < now) return { ok: false, error: "Key sudah expired" };
  return { ok: true, role: found.role || "FREE" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const scope = (url.searchParams.get("scope") || "public").toLowerCase();
      const key = url.searchParams.get("key");
      const gameId = url.searchParams.get("gameId") || url.searchParams.get("game_id");
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

      let query = supabase
        .from("lua_teleports")
        .select("id,title,description,owner_username,owner_key,game_id,teleport_data,is_public,source,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (scope === "mine") {
        const v = await validateKey(supabase, key);
        if (!v.ok) return new Response(JSON.stringify({ success: false, error: v.error }), { status: 401, headers: jsonHeaders });
        query = query.eq("owner_key", key);
      } else if (scope === "all" && key) {
        const v = await validateKey(supabase, key);
        if (!v.ok) return new Response(JSON.stringify({ success: false, error: v.error }), { status: 401, headers: jsonHeaders });
        query = query.or(`is_public.eq.true,owner_key.eq.${encodeURIComponent(key)}`);
      } else {
        query = query.eq("is_public", true);
      }
      if (gameId) query = query.eq("game_id", String(gameId));

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, teleports: (data || []).map((r) => sanitize(r, key)) }), { headers: jsonHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "export").toLowerCase();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const adminKey = typeof body.adminKey === "string" ? body.adminKey.trim() : "";

    if (action === "admin_delete") {
      const id = String(body.id || "");
      if (!id) return new Response(JSON.stringify({ success: false, error: "ID wajib diisi" }), { status: 400, headers: jsonHeaders });
      const { data: adminRow } = await supabase.from("app_settings").select("value").eq("key", "admin_key").maybeSingle();
      if (!adminRow || String(adminRow.value || "") !== adminKey) {
        return new Response(JSON.stringify({ success: false, error: "Admin key salah" }), { status: 401, headers: jsonHeaders });
      }
      const { error } = await supabase.from("lua_teleports").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
    }

    const valid = await validateKey(supabase, key);
    if (!valid.ok) return new Response(JSON.stringify({ success: false, error: valid.error }), { status: 401, headers: jsonHeaders });

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) return new Response(JSON.stringify({ success: false, error: "ID wajib diisi" }), { status: 400, headers: jsonHeaders });
      const { error } = await supabase.from("lua_teleports").delete().eq("id", id).eq("owner_key", key);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
    }

    // upsert: replace all rows for this owner+game_id with one new row (bundle save)
    if (action === "upsert" || action === "bundle") {
      const gameId = body.gameId || body.game_id ? String(body.gameId || body.game_id).slice(0, 80) : null;
      const title = String(body.title || (gameId ? `Teleports ${gameId}` : "Teleports")).trim().slice(0, 120);
      const teleportData = body.teleportData ?? body.teleport_data ?? body.data;
      if (teleportData === undefined || teleportData === null) {
        return new Response(JSON.stringify({ success: false, error: "Data teleport kosong" }), { status: 400, headers: jsonHeaders });
      }
      const blockMsg = await assertStorageWritable(supabase);
      if (blockMsg) {
        return new Response(JSON.stringify({ success: false, error: blockMsg, storageFull: true }), { status: 507, headers: jsonHeaders });
      }
      if (gameId) {
        await supabase.from("lua_teleports").delete().eq("owner_key", key).eq("game_id", gameId).eq("source", "main_lua_bundle");
      }
      const row = {
        title,
        description: null,
        owner_username: typeof body.username === "string" ? body.username.slice(0, 80) : null,
        owner_key: key,
        owner_hwid: typeof body.hwid === "string" ? body.hwid.slice(0, 180) : null,
        game_id: gameId,
        teleport_data: teleportData,
        is_public: Boolean(body.isPublic ?? body.is_public),
        source: "main_lua_bundle",
      };
      const { data, error } = await supabase.from("lua_teleports").insert(row)
        .select("id,title,description,owner_username,owner_key,game_id,teleport_data,is_public,source,created_at,updated_at").single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, teleport: sanitize(data, key) }), { headers: jsonHeaders });
    }

    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) return new Response(JSON.stringify({ success: false, error: "Judul teleport wajib diisi" }), { status: 400, headers: jsonHeaders });
    const teleportData = body.teleportData ?? body.teleport_data ?? body.data;
    if (teleportData === undefined || teleportData === null) {
      return new Response(JSON.stringify({ success: false, error: "Data teleport kosong" }), { status: 400, headers: jsonHeaders });
    }

    const blockMsg2 = await assertStorageWritable(supabase);
    if (blockMsg2) {
      return new Response(JSON.stringify({ success: false, error: blockMsg2, storageFull: true }), { status: 507, headers: jsonHeaders });
    }


    const row = {
      title,
      description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
      owner_username: typeof body.username === "string" ? body.username.slice(0, 80) : null,
      owner_key: key,
      owner_hwid: typeof body.hwid === "string" ? body.hwid.slice(0, 180) : null,
      game_id: body.gameId || body.game_id ? String(body.gameId || body.game_id).slice(0, 80) : null,
      teleport_data: teleportData,
      is_public: Boolean(body.isPublic ?? body.is_public),
      source: "main_lua",
    };

    const { data, error } = await supabase
      .from("lua_teleports")
      .insert(row)
      .select("id,title,description,owner_username,owner_key,game_id,teleport_data,is_public,source,created_at,updated_at")
      .single();
    if (error) throw error;
    return new Response(JSON.stringify({ success: true, teleport: sanitize(data, key) }), { headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("sync-teleports error", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
