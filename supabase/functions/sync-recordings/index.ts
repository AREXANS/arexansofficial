import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertStorageWritable } from "../_shared/storage-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

type KeyRecord = {
  key: string;
  expired: string;
  role?: string;
  frozenUntil?: string | null;
};

function sanitize(record: Record<string, unknown>, requesterKey?: string | null) {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    owner_username: record.owner_username,
    game_id: record.game_id,
    recording_data: record.recording_data,
    is_public: record.is_public,
    duration_seconds: record.duration_seconds,
    source: record.source,
    created_at: record.created_at,
    updated_at: record.updated_at,
    owned: Boolean(requesterKey && record.owner_key === requesterKey),
  };
}

async function validateKey(supabase: ReturnType<typeof createClient>, key?: string | null) {
  if (!key) return { ok: false, error: "Key wajib diisi" };
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "license_keys")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Database key tidak ditemukan" };

  let keys: KeyRecord[] = [];
  try {
    keys = JSON.parse(String(data.value || "[]"));
  } catch {
    return { ok: false, error: "Format database key rusak" };
  }

  const found = keys.find((item) => item.key === key);
  if (!found) return { ok: false, error: "Key tidak valid" };

  const now = Date.now();
  if (found.frozenUntil && new Date(found.frozenUntil).getTime() > now) {
    return { ok: false, error: "Key sedang frozen" };
  }
  if (new Date(found.expired).getTime() < now) {
    return { ok: false, error: "Key sudah expired" };
  }

  return { ok: true, role: found.role || "FREE" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const url = new URL(req.url);

    if (req.method === "GET") {
      const scope = (url.searchParams.get("scope") || "public").toLowerCase();
      const key = url.searchParams.get("key");
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);

      let query = supabase
        .from("lua_recordings")
        .select("id,title,description,owner_username,owner_key,game_id,recording_data,is_public,duration_seconds,source,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (scope === "mine") {
        const valid = await validateKey(supabase, key);
        if (!valid.ok) {
          return new Response(JSON.stringify({ success: false, error: valid.error }), { status: 401, headers: jsonHeaders });
        }
        query = query.eq("owner_key", key);
      } else if (scope === "all" && key) {
        const valid = await validateKey(supabase, key);
        if (!valid.ok) {
          return new Response(JSON.stringify({ success: false, error: valid.error }), { status: 401, headers: jsonHeaders });
        }
        query = query.or(`is_public.eq.true,owner_key.eq.${encodeURIComponent(key)}`);
      } else {
        query = query.eq("is_public", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, recordings: (data || []).map((r) => sanitize(r, key)) }), {
        headers: jsonHeaders,
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "export").toLowerCase();
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const adminKey = typeof body.adminKey === "string" ? body.adminKey.trim() : "";

    // Admin delete: bypasses key ownership using admin password stored in app_settings
    if (action === "admin_delete") {
      const id = String(body.id || "");
      if (!id) return new Response(JSON.stringify({ success: false, error: "ID wajib diisi" }), { status: 400, headers: jsonHeaders });
      if (!adminKey) return new Response(JSON.stringify({ success: false, error: "adminKey wajib diisi" }), { status: 401, headers: jsonHeaders });
      const { data: adminRow } = await supabase.from("app_settings").select("value").eq("key", "admin_key").maybeSingle();
      if (!adminRow || String(adminRow.value || "") !== adminKey) {
        return new Response(JSON.stringify({ success: false, error: "Admin key salah" }), { status: 401, headers: jsonHeaders });
      }
      const { error } = await supabase.from("lua_recordings").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
    }

    const valid = await validateKey(supabase, key);
    if (!valid.ok) {
      return new Response(JSON.stringify({ success: false, error: valid.error }), { status: 401, headers: jsonHeaders });
    }

    if (action === "delete" || action === "remove") {
      const id = String(body.id || "");
      if (!id) return new Response(JSON.stringify({ success: false, error: "ID wajib diisi" }), { status: 400, headers: jsonHeaders });
      const isDeveloper = String(valid.role || "").toUpperCase() === "DEVELOPER";
      let del = supabase.from("lua_recordings").delete().eq("id", id);
      if (!isDeveloper) del = del.eq("owner_key", key);
      const { data: deletedRows, error } = await del.select("id");
      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Rekaman tidak ditemukan atau bukan pemilik" }), { status: 404, headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ success: true, deleted: deletedRows.length }), { headers: jsonHeaders });
    }

    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) {
      return new Response(JSON.stringify({ success: false, error: "Judul rekaman wajib diisi" }), { status: 400, headers: jsonHeaders });
    }

    const recordingData = body.recordingData ?? body.recording_data;
    if (recordingData === undefined || recordingData === null) {
      return new Response(JSON.stringify({ success: false, error: "Data rekaman kosong" }), { status: 400, headers: jsonHeaders });
    }

    const storageBlock = await assertStorageWritable(supabase);
    if (storageBlock) {
      return new Response(JSON.stringify({ success: false, error: storageBlock, storageFull: true }), { status: 507, headers: jsonHeaders });
    }


    const row = {
      title,
      description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
      owner_username: typeof body.username === "string" ? body.username.slice(0, 80) : null,
      owner_key: key,
      owner_hwid: typeof body.hwid === "string" ? body.hwid.slice(0, 180) : null,
      game_id: body.gameId || body.game_id ? String(body.gameId || body.game_id).slice(0, 80) : null,
      recording_data: recordingData,
      is_public: Boolean(body.isPublic ?? body.is_public),
      duration_seconds: Number.isFinite(Number(body.durationSeconds ?? body.duration_seconds))
        ? Math.max(0, Math.floor(Number(body.durationSeconds ?? body.duration_seconds)))
        : null,
      source: "main_lua",
    };

    const { data, error } = await supabase
      .from("lua_recordings")
      .insert(row)
      .select("id,title,description,owner_username,owner_key,game_id,recording_data,is_public,duration_seconds,source,created_at,updated_at")
      .single();

    if (error) throw error;
    return new Response(JSON.stringify({ success: true, recording: sanitize(data, key) }), { headers: jsonHeaders });
  } catch (error: unknown) {
    console.error("sync-recordings error", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});