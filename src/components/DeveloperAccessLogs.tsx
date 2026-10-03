import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Trash2, ShieldAlert, Globe, Smartphone, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AccessLog {
  id: string;
  created_at: string;
  event: string;
  ip_address: string | null;
  device_id: string | null;
  device_name: string | null;
  user_agent: string | null;
  device_info: Record<string, unknown> | null;
  geo_info: Record<string, unknown> | null;
  is_approved_device: boolean;
}

const eventLabel: Record<string, { text: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  visit: { text: 'Membuka halaman', variant: 'secondary' },
  login_success: { text: 'Login berhasil', variant: 'default' },
  login_failed: { text: 'Login gagal', variant: 'destructive' },
};

export const DeveloperAccessLogs = () => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const getAdminKey = () =>
    sessionStorage.getItem('admin_pwd_cache') || localStorage.getItem('admin_pwd_cache') || '';

  const load = useCallback(async () => {
    const adminKey = getAdminKey();
    if (!adminKey) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('dev-access-log', {
      body: { action: 'list', adminKey },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: 'Gagal memuat', description: 'Coba logout lalu login ulang.', variant: 'destructive' });
      return;
    }
    setLogs((data?.logs || []) as AccessLog[]);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const remove = async (id: string) => {
    await supabase.functions.invoke('dev-access-log', { body: { action: 'delete', id, adminKey: getAdminKey() } });
    setLogs((l) => l.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    await supabase.functions.invoke('dev-access-log', { body: { action: 'clear', adminKey: getAdminKey() } });
    setLogs([]);
    toast({ title: 'Riwayat dibersihkan' });
  };

  const blockIp = async (ip: string | null) => {
    if (!ip || ip === 'unknown') return;
    const { error } = await supabase.from('blocked_ips').insert({ ip_address: ip, reason: 'Percobaan akses halaman developer' });
    toast({
      title: error ? 'Gagal memblokir' : 'IP diblokir',
      description: error ? error.message : ip,
      variant: error ? 'destructive' : 'default',
    });
  };

  const filtered = logs.filter((l) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const geo = l.geo_info as { city?: string; country?: string; isp?: string } | null;
    return [l.ip_address, l.device_name, l.device_id, l.user_agent, geo?.city, geo?.country, geo?.isp]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Deteksi Akses Halaman Developer
            </CardTitle>
            <CardDescription>
              Semua orang yang membuka atau mencoba login ke /developer tercatat: IP, perangkat, browser, dan lokasi.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll}>
              <Trash2 className="w-4 h-4 mr-1" /> Bersihkan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari IP, perangkat, kota, provider..."
            className="pl-9 bg-background/50"
          />
        </div>

        <ScrollArea className="h-[480px] pr-2">
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada catatan akses.</p>
            )}
            {filtered.map((l) => {
              const ev = eventLabel[l.event] || eventLabel.visit;
              const geo = l.geo_info as { city?: string; regionName?: string; country?: string; isp?: string } | null;
              const info = l.device_info as { browser?: string; os?: string; deviceType?: string; screenResolution?: string } | null;
              return (
                <div key={l.id} className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant={ev.variant}>{ev.text}</Badge>
                      {l.is_approved_device && <Badge variant="outline">Perangkat disetujui</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(l.created_at).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                    {l.ip_address || 'unknown'}
                    {geo?.city && (
                      <span className="font-sans text-xs text-muted-foreground">
                        • {geo.city}, {geo.regionName}, {geo.country}
                      </span>
                    )}
                  </div>
                  {geo?.isp && <div className="text-xs text-muted-foreground">Provider: {geo.isp}</div>}
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      {l.device_name || 'Perangkat tidak dikenal'}
                      {info?.screenResolution ? ` • ${info.screenResolution}` : ''}
                      {l.device_id ? ` • ${l.device_id}` : ''}
                    </span>
                  </div>
                  {l.user_agent && (
                    <div className="text-[10px] font-mono text-muted-foreground/70 break-all">{l.user_agent}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => blockIp(l.ip_address)}>
                      Blokir IP
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default DeveloperAccessLogs;
