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
  const [testingPing, setTestingPing] = useState(false);

  // Toleransi 180 detik (3 menit) agar tidak flicker offline saat background sync jeda
  const STALE_MS = 3 * 60 * 1000;
  const online = lastSeen ? (now - lastSeen < STALE_MS) : false;

  // Poll last-seen so admin can see live status
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/device/status');
        if (res.ok) {
          const data = await res.json();
          if (data.last_seen) {
            setLastSeen(data.last_seen);
            return;
          }
        }
      } catch {}

      const { data } = await supabase
        .from('app_settings').select('value').eq('key', 'developer_last_seen').maybeSingle();
      const v = data?.value ? parseInt(String(data.value), 10) : 0;
      setLastSeen(v || null);
    };
    load();
    const p = setInterval(load, 8000);
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
        'arexans2025@';

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      let endpointUrl = `${origin}/functions/v1/dev-heartbeat`;

      try {
        const { data, error } = await supabase.functions.invoke('get-heartbeat-url', { body: { adminKey } });
        if (!error && data?.url) {
          endpointUrl = data.url;
        }
      } catch {}

      setPingUrl(endpointUrl);
      try { localStorage.setItem('arexanspay_heartbeat_url', endpointUrl); } catch {}
      return endpointUrl;
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

  const copyUrl = async (textToCopy?: string) => {
    const target = textToCopy || pingUrl;
    if (!target) return;
    await navigator.clipboard.writeText(target);
    toast({ title: 'Tersalin', description: 'URL / Command sudah disalin ke clipboard.' });
  };

  const sendTestPing = async () => {
    setTestingPing(true);
    try {
      const targetUrl = pingUrl || '/api/device/heartbeat';
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'online',
          device_name: 'Manual Test Web Admin',
          network: 'ONLINE',
          battery: 100,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.ok || data.success)) {
        setLastSeen(Date.now());
        toast({
          title: '🟢 Ping Berhasil Diterima!',
          description: 'Sinyal heartbeat ArexansPay terdeteksi. Status sekarang ONLINE.',
        });
      } else {
        throw new Error(data.error || 'Server menolak ping');
      }
    } catch (err: any) {
      toast({
        title: 'Gagal Kirim Ping',
        description: err.message || 'Cek koneksi internet',
        variant: 'destructive',
      });
    } finally {
      setTestingPing(false);
    }
  };

  const enablePwaMonitor = async () => {
    let url = pingUrl;
    if (!url) url = await fetchUrl();
    if (!url) { toast({ title: 'URL belum siap', description: 'Silakan refresh halaman lalu coba lagi.', variant: 'destructive' }); return; }
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
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Monitor Perangkat ArexansPay (Heartbeat 24/7)
            </CardTitle>
            <CardDescription>
              Menerima sinyal heartbeat dari aplikasi HP / Tasker / cron Anda. Toleransi 3 menit agar status tetap stabil ONLINE tanpa flapping.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={online ? 'default' : 'destructive'} className="gap-1.5 py-1 px-3">
              {online ? <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> : <WifiOff className="w-3.5 h-3.5" />}
              {online ? 'ArexansPay ONLINE' : 'ArexansPay OFFLINE'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground p-2.5 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2">
            <span>Ping terakhir diterima:</span>
            <span className="font-mono font-bold text-foreground">
              {secondsAgo === null ? 'Belum pernah' : `${secondsAgo} detik lalu`}
            </span>
            {online && <span className="text-emerald-400 font-medium">(Aktif & Terhubung)</span>}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={sendTestPing}
            disabled={testingPing}
            className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingPing ? 'animate-spin' : ''}`} />
            Kirim Test Ping Sekarang
          </Button>
        </div>

        <div className="space-y-2">
          <Label>URL Endpoint Heartbeat (Gunakan di Aplikasi / APK Anda)</Label>
          <div className="flex gap-2">
            <Input value={pingUrl} readOnly placeholder="Klik 'Tampilkan URL'..." className="font-mono text-xs" />
            <Button variant="outline" onClick={() => fetchUrl()} disabled={loading} title="Perbarui URL">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={() => copyUrl(pingUrl)} disabled={!pingUrl} title="Salin URL">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aplikasi Anda dapat mengirimkan request <strong>POST</strong> atau <strong>GET</strong> ke endpoint di atas dengan interval setiap 1–2 menit.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Smartphone className="w-4 h-4 text-primary" /> Opsi 1 — PWA di HP
              </div>
              {swActive && (
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                  PWA Aktif
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Install web ini sebagai PWA (Chrome → titik tiga → "Tambahkan ke Layar Utama"), lalu aktifkan monitor PWA. Service worker akan mengirim ping periodik di latar belakang.
            </p>
            {swActive ? (
              <Button size="sm" variant="destructive" onClick={disableMonitor} className="w-full">Nonaktifkan Monitor PWA</Button>
            ) : (
              <Button size="sm" onClick={enablePwaMonitor} className="w-full">Aktifkan Monitor PWA</Button>
            )}
          </div>

          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Radio className="w-4 h-4 text-primary" /> Opsi 2 — Aplikasi APK / Tasker / Cron
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Kirimkan HTTP POST setiap 1–2 menit dari aplikasi Anda ke endpoint berikut:
            </p>
            <div className="text-[11px] font-mono bg-background/80 p-2.5 rounded-lg border border-border/60 flex items-center justify-between gap-2">
              <span className="truncate">{currentOrigin}/api/device/heartbeat</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copyUrl(`${currentOrigin}/api/device/heartbeat`)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-[10px] font-mono bg-background/50 p-2 rounded border border-border/40 text-muted-foreground overflow-x-auto">
              curl -X POST "{pingUrl || `${currentOrigin}/functions/v1/dev-heartbeat`}" -H "Content-Type: application/json" -d '{`"status":"online"`}'
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArexansPayMonitor;
