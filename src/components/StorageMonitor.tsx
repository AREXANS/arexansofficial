import { FC, useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Database, HardDrive, RefreshCw, ShieldAlert } from 'lucide-react';

type TableStat = { table_name: string; bytes: number; rows_estimate: number };
type Stats = {
  usedBytes: number;
  limitBytes: number;
  percent: number;
  warnPercent: number;
  blockPercent: number;
  status: 'ok' | 'warning' | 'blocked';
  tables: TableStat[];
  measuredAt: string;
};

const fmt = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const API_BASE = '/functions/v1';

const StorageMonitor: FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [limitMb, setLimitMb] = useState('500');
  const [warnPercent, setWarnPercent] = useState('80');
  const [blockPercent, setBlockPercent] = useState('95');
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['storage_limit_mb', 'storage_warn_percent', 'storage_block_percent']);
    for (const row of data || []) {
      if (row.key === 'storage_limit_mb') setLimitMb(row.value);
      if (row.key === 'storage_warn_percent') setWarnPercent(row.value);
      if (row.key === 'storage_block_percent') setBlockPercent(row.value);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/storage-stats`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat');
      setStats(json as Stats);
    } catch (e) {
      toast({ title: 'Gagal memuat penyimpanan', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadStats();
    const t = setInterval(loadStats, 60_000);
    return () => clearInterval(t);
  }, [loadSettings, loadStats]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const rows = [
        { key: 'storage_limit_mb', value: String(Math.max(1, Number(limitMb) || 500)), description: 'Batas ukuran database (MB)' },
        { key: 'storage_warn_percent', value: String(Math.min(100, Math.max(1, Number(warnPercent) || 80))), description: 'Ambang peringatan penyimpanan (%)' },
        { key: 'storage_block_percent', value: String(Math.min(100, Math.max(1, Number(blockPercent) || 95))), description: 'Ambang penghentian penambahan data (%)' },
      ];
      for (const row of rows) {
        await supabase.from('app_settings').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      }
      toast({ title: 'Tersimpan', description: 'Batas penyimpanan diperbarui.' });
      loadStats();
    } catch (e) {
      toast({ title: 'Gagal menyimpan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const percent = stats ? Math.min(100, stats.percent) : 0;
  const barColor =
    stats?.status === 'blocked' ? 'bg-destructive' : stats?.status === 'warning' ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" /> Analisis Penyimpanan Data
            </CardTitle>
            <CardDescription>Pantau pemakaian database dan hentikan penambahan data sebelum penuh.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={loadStats} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {fmt(stats.usedBytes)} dari {fmt(stats.limitBytes)}
                </div>
                <Badge
                  variant={stats.status === 'ok' ? 'secondary' : 'destructive'}
                  className={stats.status === 'warning' ? 'bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/20' : ''}
                >
                  {stats.status === 'ok' && <CheckCircle className="mr-1 h-3 w-3" />}
                  {stats.status === 'warning' && <AlertTriangle className="mr-1 h-3 w-3" />}
                  {stats.status === 'blocked' && <ShieldAlert className="mr-1 h-3 w-3" />}
                  {stats.percent.toFixed(1)}% terpakai
                </Badge>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percent}%` }} />
              </div>

              {stats.status === 'warning' && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Peringatan: penyimpanan sudah melewati {stats.warnPercent}%. Penambahan data baru akan dihentikan otomatis saat
                    mencapai {stats.blockPercent}%. Segera hapus data lama atau naikkan batas.
                  </span>
                </div>
              )}
              {stats.status === 'blocked' && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Penambahan data baru (rekaman & teleport) DIHENTIKAN karena penyimpanan hampir penuh.</span>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-primary" /> Rincian per tabel
                </div>
                <ScrollArea className="h-64 rounded-lg border">
                  <div className="divide-y">
                    {stats.tables.map((t) => (
                      <div key={t.table_name} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="truncate font-mono text-xs">{t.table_name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {fmt(t.bytes)} · ~{t.rows_estimate.toLocaleString('id-ID')} baris
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <p className="text-xs text-muted-foreground">Diukur: {new Date(stats.measuredAt).toLocaleString('id-ID')}</p>
            </>
          )}
          {!stats && !loading && <p className="text-sm text-muted-foreground">Belum ada data penyimpanan.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batas & Ambang Peringatan</CardTitle>
          <CardDescription>Berlaku langsung untuk semua penyimpanan data baru.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Batas total (MB)</Label>
            <Input value={limitMb} onChange={(e) => setLimitMb(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Peringatan (%)</Label>
            <Input value={warnPercent} onChange={(e) => setWarnPercent(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Hentikan di (%)</Label>
            <Input value={blockPercent} onChange={(e) => setBlockPercent(e.target.value)} inputMode="numeric" />
          </div>
          <div className="sm:col-span-3">
            <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StorageMonitor;
