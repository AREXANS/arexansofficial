import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Radio, Smartphone, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const ArexansPayMonitor = () => {
  const { toast } = useToast();
  const [pingUrl, setPingUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const STALE_MS = 3 * 60 * 1000;
  const online = lastSeen ? (now - lastSeen < STALE_MS) : false;

  // Poll last-seen so admin can see live status
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('app_settings').select('value').eq('key', 'developer_last_seen').maybeSingle();
      const v = data?.value ? parseInt(String(data.value), 10) : 0;
      setLastSeen(v || null);
    };
    load();
    const p = setInterval(load, 15000);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(p); clearInterval(t); };
  }, []);

  // Detect existing SW
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('/dev-heartbeat-sw.js').then((r) => {
      setSwActive(!!r?.active);
    });
  }, []);

  const fetchUrl = async (silent = false): Promise<string> => {
    setLoading(true);
    try {
      const adminKey =
        sessionStorage.getItem('admin_pwd_cache') ||
        localStorage.getItem('admin_pwd_cache') ||
        '';
      if (!adminKey) {
        if (!silent) toast({ title: 'Sesi kadaluarsa', description: 'Silakan logout lalu login ulang di /developer untuk ambil URL.', variant: 'destructive' });
        return '';
      }
      const { data, error } = await supabase.functions.invoke('get-heartbeat-url', { body: { adminKey } });
      if (error || !data?.url) throw new Error('Gagal mengambil URL');
      setPingUrl(data.url);
      try { localStorage.setItem('arexanspay_heartbeat_url', data.url); } catch {}
      return data.url as string;
    } catch (e: any) {
      if (!silent) toast({ title: 'Error', description: e?.message || 'Gagal', variant: 'destructive' });
      return '';
    } finally { setLoading(false); }
  };

  // Auto-load URL on mount (from cache or fetch)
  useEffect(() => {
    const cached = localStorage.getItem('arexanspay_heartbeat_url');
    if (cached) { setPingUrl(cached); return; }
    fetchUrl(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const copyUrl = async () => {
    if (!pingUrl) return;
    await navigator.clipboard.writeText(pingUrl);
    toast({ title: 'Tersalin', description: 'URL heartbeat sudah di-clipboard.' });
  };

  const enablePwaMonitor = async () => {
    let url = pingUrl;
    if (!url) url = await fetchUrl();
    if (!url) { toast({ title: 'URL belum siap', description: 'Login ulang di /developer lalu coba lagi.', variant: 'destructive' }); return; }
    if (!('serviceWorker' in navigator)) {
      toast({ title: 'Tidak didukung', description: 'Browser tidak mendukung Service Worker.', variant: 'destructive' }); return;
    }
    try {
      const reg = await navigator.serviceWorker.register('/dev-heartbeat-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const controller = reg.active || reg.waiting || reg.installing;
      controller?.postMessage({ type: 'SET_CONFIG', url });


      // Try periodic sync (Chrome Android w/ installed PWA)
      // @ts-ignore
      if ('periodicSync' in reg) {
        try {
          // @ts-ignore
          const status = await navigator.permissions.query({ name: 'periodic-background-sync' as any });
          if (status.state === 'granted') {
            // @ts-ignore
            await reg.periodicSync.register('dev-heartbeat', { minInterval: 15 * 60 * 1000 });
          }
        } catch {}
      }
      // Fallback one-shot sync
      // @ts-ignore
      if ('sync' in reg) { try { /* @ts-ignore */ await reg.sync.register('dev-heartbeat'); } catch {} }

      setSwActive(true);
      toast({ title: 'Monitor aktif', description: 'Service worker terpasang. Install web sebagai PWA agar tetap jalan saat tab ditutup.' });
    } catch (e: any) {
      toast({ title: 'Gagal', description: e?.message || 'Registrasi service worker gagal', variant: 'destructive' });
    }
  };

  const disableMonitor = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/dev-heartbeat-sw.js');
    if (reg) await reg.unregister();
    setSwActive(false);
    toast({ title: 'Monitor dinonaktifkan' });
  };

  const secondsAgo = lastSeen ? Math.max(0, Math.floor((now - lastSeen) / 1000)) : null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Monitor Perangkat ArexansPay (24/7)
            </CardTitle>
            <CardDescription>
              Awasi perangkat admin walau website tertutup. ArexansPay otomatis Offline jika ping berhenti &gt; 3 menit.
            </CardDescription>
          </div>
          <Badge variant={online ? 'default' : 'destructive'} className="gap-1">
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? 'ArexansPay Online' : 'ArexansPay Offline'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Ping terakhir: {secondsAgo === null ? '—' : `${secondsAgo}s lalu`}
        </div>

        <div className="space-y-2">
          <Label>URL Heartbeat (rahasia — jangan bagikan)</Label>
          <div className="flex gap-2">
            <Input value={pingUrl} readOnly placeholder="Klik 'Tampilkan URL'..." className="font-mono text-xs" />
            <Button variant="outline" onClick={() => fetchUrl()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={copyUrl} disabled={!pingUrl}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Smartphone className="w-4 h-4 text-primary" /> Opsi 1 — PWA di HP (best-effort)
            </div>
            <p className="text-xs text-muted-foreground">
              Install web ini sebagai PWA (Chrome → titik tiga → "Add to Home screen"), lalu aktifkan monitor. Ping berjalan di latar meski tab ditutup (bisa terputus jika OS mem-kill proses).
            </p>
            {swActive ? (
              <Button size="sm" variant="destructive" onClick={disableMonitor} className="w-full">Nonaktifkan Monitor PWA</Button>
            ) : (
              <Button size="sm" onClick={enablePwaMonitor} className="w-full">Aktifkan Monitor PWA</Button>
            )}
          </div>
          <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Radio className="w-4 h-4 text-primary" /> Opsi 2 — Tasker / cron (paling andal)
            </div>
            <p className="text-xs text-muted-foreground">
              Setup <b>Tasker (Android)</b> atau cron di PC untuk POST ke URL di atas setiap 1 menit. Selama HP terhubung internet ping terkirim; kalau internet mati / baterai habis, ping berhenti → status otomatis Offline.
            </p>
            <div className="text-[10px] font-mono bg-background/60 p-2 rounded border overflow-x-auto">
              curl -X POST "URL_DIATAS"
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArexansPayMonitor;
