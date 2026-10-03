// Shared database-storage quota helper.
// Reads limits from app_settings so they can be changed live from /developer.

export type StorageStats = {
  usedBytes: number;
  limitBytes: number;
  percent: number;
  warnPercent: number;
  blockPercent: number;
  status: "ok" | "warning" | "blocked";
  tables: Array<{ table_name: string; bytes: number; rows_estimate: number }>;
  measuredAt: string;
};

const DEFAULTS = { limitMb: 500, warnPercent: 80, blockPercent: 95 };

let cache: { at: number; stats: StorageStats } | null = null;
const CACHE_MS = 30_000;

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getStorageStats(supabase: any, force = false): Promise<StorageStats> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.stats;

  const { data: settings } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["storage_limit_mb", "storage_warn_percent", "storage_block_percent"]);

  const map: Record<string, string> = {};
  for (const row of settings || []) map[row.key] = row.value;

  const limitMb = num(map.storage_limit_mb, DEFAULTS.limitMb);
  const warnPercent = num(map.storage_warn_percent, DEFAULTS.warnPercent);
  const blockPercent = num(map.storage_block_percent, DEFAULTS.blockPercent);

  const { data, error } = await supabase.rpc("get_db_storage_stats");
  if (error) throw new Error("Gagal membaca ukuran database");

  const usedBytes = Number(data?.total_bytes || 0);
  const limitBytes = Math.round(limitMb * 1024 * 1024);
  const percent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;

  const stats: StorageStats = {
    usedBytes,
    limitBytes,
    percent: Math.round(percent * 100) / 100,
    warnPercent,
    blockPercent,
    status: percent >= blockPercent ? "blocked" : percent >= warnPercent ? "warning" : "ok",
    tables: data?.tables || [],
    measuredAt: data?.measured_at || new Date().toISOString(),
  };

  cache = { at: Date.now(), stats };
  return stats;
}

/** Returns an error message when new data must NOT be written, otherwise null. */
export async function assertStorageWritable(supabase: any): Promise<string | null> {
  try {
    const stats = await getStorageStats(supabase);
    if (stats.status === "blocked") {
      return `Penyimpanan database hampir penuh (${stats.percent.toFixed(1)}%). Penambahan data dihentikan sementara. Hapus data lama atau naikkan batas penyimpanan di halaman developer.`;
    }
    return null;
  } catch (_e) {
    return null; // never block because the check itself failed
  }
}
