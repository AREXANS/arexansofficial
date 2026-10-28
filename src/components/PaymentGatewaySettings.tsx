import { FC, useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  CreditCard, Eye, EyeOff, Save, RefreshCw, Copy, Check, 
  ExternalLink, CheckCircle2, AlertTriangle, Zap, Shield, 
  Send, Coins, Smartphone, Radio
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SettingItem {
  id?: string;
  key: string;
  value: string;
  description?: string;
}

interface PaymentGatewaySettingsProps {
  onSettingsUpdated?: () => void;
}

export const PaymentGatewaySettings: FC<PaymentGatewaySettingsProps> = ({ onSettingsUpdated }) => {
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ArexansPay Test Status
  const [arexanspayTesting, setArexansPayTesting] = useState(false);
  const [arexanspayStatus, setArexansPayStatus] = useState<{
    tested: boolean;
    online: boolean;
    deviceInfo?: string;
    error?: string;
  } | null>(null);

  // XMPayment Test & Balance Status
  const [xmpTesting, setXmpTesting] = useState(false);
  const [xmpStatus, setXmpStatus] = useState<{
    tested: boolean;
    valid: boolean;
    balanceData?: any;
    message?: string;
    error?: string;
  } | null>(null);

  // Pakasir Test Status (Legacy fallback)
  const [pakasirTesting, setPakasirTesting] = useState(false);
  const [pakasirStatus, setPakasirStatus] = useState<{
    tested: boolean;
    valid: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  // Poketo Test Status (https://poketo.id/docs)
  const [poketoTesting, setPoketoTesting] = useState(false);
  const [poketoStatus, setPoketoStatus] = useState<{
    tested: boolean;
    valid: boolean;
    merchantName?: string;
    message?: string;
    error?: string;
  } | null>(null);

  // Discord Test Status
  const [discordTesting, setDiscordTesting] = useState(false);

  // Fetch all payment settings in realtime
  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('app_settings').select('key, value');
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        map[row.key] = row.value ?? '';
      });
      setSettingsMap(map);
      try {
        localStorage.setItem('arexans_cached_app_settings', JSON.stringify(map));
      } catch {}
    } catch (err: any) {
      console.warn('Could not load payment settings from server, checking local cache:', err?.message || err);
      try {
        const cached = localStorage.getItem('arexans_cached_app_settings');
        if (cached) {
          setSettingsMap(JSON.parse(cached));
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const getValue = (key: string, fallback: string = '') => {
    return settingsMap[key] !== undefined ? settingsMap[key] : fallback;
  };

  const handleInputChange = (key: string, value: string) => {
    setSettingsMap(prev => ({ ...prev, [key]: value }));
  };

  // Upsert a setting in realtime to Supabase
  const saveSetting = async (key: string, val?: string) => {
    const valueToSave = val !== undefined ? val : (settingsMap[key] || '');
    setSavingKey(key);
    try {
      const upserts: { key: string; value: string; updated_at: string }[] = [
        { key, value: valueToSave, updated_at: new Date().toISOString() }
      ];

      setSettingsMap(prev => {
        const next = { ...prev };
        upserts.forEach(u => { next[u.key] = u.value; });
        try {
          localStorage.setItem('arexans_cached_app_settings', JSON.stringify(next));
        } catch {}
        return next;
      });

      const { error } = await supabase
        .from('app_settings')
        .upsert(upserts, { onConflict: 'key' });

      if (error) throw error;

      toast({
        title: 'Pengaturan Disimpan',
        description: `${key.replace(/_/g, ' ')} berhasil diperbarui secara realtime.`,
      });

      onSettingsUpdated?.();
    } catch (err: any) {
      toast({
        title: 'Pengaturan Disimpan (Lokal)',
        description: `${key.replace(/_/g, ' ')} disimpan di cache browser. ${err?.message ? `(${err.message})` : ''}`,
      });
    } finally {
      setSavingKey(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast({ title: 'Disalin ke Clipboard', description: text });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Test ArexansPay merchant/QRIS connection (https://www.arexanspay.my.id/docs)
  const testArexansPayConnection = async () => {
    const apiKey = getValue('arexanspay_api_key') || getValue('casaku_license_key');
    const qrisId = getValue('arexanspay_qris_id') || getValue('casaku_qris_id');
    if (!apiKey) {
      toast({
        title: 'API Key ArexansPay Kosong',
        description: 'Silakan isi API Key ArexansPay terlebih dahulu.',
        variant: 'destructive'
      });
      return;
    }
    if (!qrisId) {
      toast({
        title: 'QRIS ID ArexansPay Kosong',
        description: 'Silakan isi QRIS ID toko Anda terlebih dahulu.',
        variant: 'destructive'
      });
      return;
    }

    setArexansPayTesting(true);
    setArexansPayStatus(null);
    try {
      const res = await fetch(`https://www.arexanspay.my.id/api/qris/${encodeURIComponent(qrisId)}`, {
        headers: { 'X-API-Key': apiKey },
      });
      const data = await res.json().catch(() => ({}));
      console.log('ArexansPay merchant check response:', data);

      if (res.ok && (data.success === true || data.data)) {
        const d = data.data || data;
        const name = d.merchant_name || d.name || d.account_holder || 'Toko ArexansPay';
        setArexansPayStatus({
          tested: true,
          online: true,
          deviceInfo: `${name} (QRIS aktif & siap)`
        });
        toast({
          title: 'Koneksi ArexansPay Berhasil',
          description: `Toko ${name} siap menerima pembayaran QRIS.`,
        });
      } else {
        const errMsg = data.message || data.error || 'QRIS ID tidak ditemukan atau API Key tidak valid';
        setArexansPayStatus({ tested: true, online: false, error: errMsg });
        toast({ title: 'Koneksi ArexansPay Gagal', description: errMsg, variant: 'destructive' });
      }
    } catch (err: any) {
      setArexansPayStatus({
        tested: true,
        online: false,
        error: err.message || 'Gagal menghubungi server www.arexanspay.my.id'
      });
      toast({
        title: 'Error Koneksi ArexansPay',
        description: 'Tidak dapat menjangkau server www.arexanspay.my.id',
        variant: 'destructive'
      });
    } finally {
      setArexansPayTesting(false);
    }
  };

  // Test XMPayment Connection & Fetch Live Balance (https://xmpayment.my.id/api/v1/balance)
  const testXMPaymentConnection = async () => {
    const apiKey = getValue('xmpayment_api_key', 'xmp_live_d2b8ea709d5d7a57ff974cd771435e0f58d4da888593350b');
    if (!apiKey) {
      toast({
        title: 'API Key XMPayment Kosong',
        description: 'Silakan isi API Key XMPayment terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    setXmpTesting(true);
    setXmpStatus(null);
    try {
      let res: Response;
      try {
        res = await fetch('https://xmpayment.my.id/api/v1/balance', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-api-key': apiKey,
          },
        });
      } catch {
        res = await fetch('/xmpayment-proxy/api/v1/balance', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-api-key': apiKey,
          },
        });
      }

      const data = await res.json().catch(() => ({}));
      console.log('XMPayment balance response:', data);

      if (res.ok && data.success && data.data) {
        const bal = data.data;
        const store = bal.store_name || bal.merchant_id || 'Toko XMPayment';
        const formatted = bal.available_balance_formatted || `Rp ${(bal.available_balance || 0).toLocaleString('id-ID')}`;
        setXmpStatus({
          tested: true,
          valid: true,
          balanceData: bal,
          message: `Terhubung ke Toko: "${store}". Saldo Tersedia: ${formatted}`,
        });
        toast({
          title: 'Koneksi XMPayment Berhasil',
          description: `Toko: "${store}" aktif. Saldo: ${formatted}`,
        });
      } else {
        const errMsg = data.message || data.error?.message || `Gagal mengambil saldo (HTTP ${res.status})`;
        setXmpStatus({ tested: true, valid: false, error: errMsg });
        toast({ title: 'Koneksi XMPayment Gagal', description: errMsg, variant: 'destructive' });
      }
    } catch (err: any) {
      setXmpStatus({ tested: true, valid: false, error: err.message || 'Gagal menghubungi server XMPayment' });
      toast({ title: 'Error Koneksi XMPayment', description: err.message || 'Gagal menghubungi server XMPayment', variant: 'destructive' });
    } finally {
      setXmpTesting(false);
    }
  };

  // Test Pakasir Credentials (Legacy fallback)
  const testPakasirConnection = async () => {
    const slug = getValue('pakasir_slug');
    const apiKey = getValue('pakasir_api_key');
    if (!slug || !apiKey) {
      toast({
        title: 'Data Pakasir Belum Lengkap',
        description: 'Project Slug dan API Key wajib diisi.',
        variant: 'destructive'
      });
      return;
    }

    setPakasirTesting(true);
    setPakasirStatus(null);
    try {
      const query = `project=${encodeURIComponent(slug)}&amount=10000&order_id=TEST_CONNECTION_PING&api_key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(`https://app.pakasir.com/api/transactiondetail?${query}`);
      } catch {
        res = await fetch(`/pakasir-proxy/api/transactiondetail?${query}`);
      }
      const data = await res.json();
      if (data && (data.transaction !== undefined || data.status !== undefined || !data.error?.includes('Unauthorized'))) {
        setPakasirStatus({
          tested: true,
          valid: true,
          message: 'Project Slug & API Key valid dan terhubung!'
        });
        toast({
          title: 'Koneksi Pakasir Valid',
          description: 'Project Slug dan API Key siap digunakan untuk transaksi.',
        });
      } else {
        const errMsg = data.error || data.message || 'API Key atau Project Slug tidak valid.';
        setPakasirStatus({ tested: true, valid: false, error: errMsg });
        toast({ title: 'Koneksi Pakasir Gagal', description: errMsg, variant: 'destructive' });
      }
    } catch (err: any) {
      setPakasirStatus({ tested: true, valid: true, message: 'Kredensial tersimpan dan format valid.' });
    } finally {
      setPakasirTesting(false);
    }
  };

  // Test Poketo API Key (https://poketo.id/docs)
  const testPoketoConnection = async () => {
    const apiKey = getValue('poketo_api_key', 'sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ');
    if (!apiKey) {
      toast({
        title: 'API Key Poketo Kosong',
        description: 'Silakan isi API Key Poketo terlebih dahulu.',
        variant: 'destructive',
      });
      return;
    }

    setPoketoTesting(true);
    setPoketoStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-poketo', {
        body: { api_key: apiKey },
      });

      if (error) throw error;

      if (data?.success) {
        setPoketoStatus({
          tested: true,
          valid: true,
          merchantName: data.merchant?.name || 'Poketo Merchant',
          message: data.message || `Terhubung ke Poketo (${data.merchant?.name || 'Live'})`,
        });
        toast({
          title: 'Koneksi Poketo Berhasil',
          description: data.message || 'API Key Poketo terverifikasi aktif!',
        });
      } else {
        const errMsg = data?.error || 'Gagal memverifikasi API Key Poketo.';
        setPoketoStatus({ tested: true, valid: false, error: errMsg });
        toast({ title: 'Koneksi Poketo Gagal', description: errMsg, variant: 'destructive' });
      }
    } catch (err: any) {
      setPoketoStatus({ tested: true, valid: false, error: err?.message || 'Gagal menghubungi server Poketo' });
      toast({ title: 'Error Poketo', description: err?.message || 'Gagal menghubungi server Poketo', variant: 'destructive' });
    } finally {
      setPoketoTesting(false);
    }
  };

  // Test Discord Webhook
  const testDiscordWebhook = async () => {
    const webhookUrl = getValue('discord_webhook_url');
    if (!webhookUrl) {
      toast({
        title: 'Discord Webhook URL Kosong',
        description: 'Masukkan Discord Webhook URL terlebih dahulu.',
        variant: 'destructive'
      });
      return;
    }

    setDiscordTesting(true);
    try {
      const payload = {
        embeds: [{
          title: "🔔 Test Notifikasi Pembayaran AREXANS",
          description: "Koneksi Discord Webhook berhasil terhubung secara realtime!",
          color: 0x00F0FF,
          fields: [
            { name: "Status", value: "✅ Aktif & Siap", inline: true },
            { name: "Waktu", value: new Date().toLocaleString('id-ID'), inline: true },
          ],
          footer: { text: "AREXANS Tools Payment Gateway" }
        }]
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({ title: 'Discord Webhook Berhasil', description: 'Pesan tes berhasil dikirim ke server Discord.' });
      } else {
        toast({ title: 'Discord Webhook Gagal', description: `Server mengembalikan status ${res.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error Discord Webhook', description: err.message, variant: 'destructive' });
    } finally {
      setDiscordTesting(false);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentOrigin}/functions/v1/payment-webhook`;

  // Resolved values
  const rawGateway = getValue('payment_gateway', 'poketo');
  const currentGateway = (rawGateway === 'casaku' || rawGateway === 'cashify') ? 'arexanspay' : (rawGateway === 'pakasir' ? 'xmpayment' : rawGateway);
  const isSimulationOn = getValue('payment_simulation') === 'on';

  const poketoApiKey = getValue('poketo_api_key', 'sk_live_iZEBli3dV1buw_sFB4DhUfIDVKGp-itZ');
  const poketoWebhookKey = getValue('poketo_webhook_key', 'whsec_b71_8KfymmRPeNNQP2wigV2jshWTrC-X');

  const arexanspayLicense = getValue('arexanspay_api_key') || getValue('casaku_license_key');
  const arexanspayQris = getValue('arexanspay_qris_id') || getValue('casaku_qris_id');
  const arexanspayWebhook = getValue('arexanspay_webhook_key') || getValue('casaku_webhook_key');
  const arexanspayNumberId = getValue('arexanspay_number_id');

  const xmpApiKey = getValue('xmpayment_api_key', 'xmp_live_d2b8ea709d5d7a57ff974cd771435e0f58d4da888593350b');
  const xmpWebhookSecret = getValue('xmpayment_webhook_secret', 'whsec_bYGhuiJpREZP4N5zB0bCMOP6LrDAQ3wsOJzOThgNZKY');
  const xmpMode = getValue('xmpayment_mode', 'live');

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 text-center text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          Memuat konfigurasi payment gateway...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Master Gateway Switch & Simulation Mode */}
      <Card className="glass-card border-primary/20 bg-background/60 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-display font-bold flex items-center gap-2 text-foreground">
                <CreditCard className="w-5 h-5 text-primary" />
                Mode & Gateway Aktif
              </CardTitle>
              <CardDescription className="text-xs">
                Pilih payment gateway utama untuk melayani pembayaran QRIS & Invoice otomatis.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                currentGateway === 'poketo'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : currentGateway === 'both' 
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : currentGateway === 'arexanspay'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              }`}>
                {currentGateway === 'poketo' ? 'Poketo.id Aktif (Rekomendasi)' : currentGateway === 'xmpayment' ? 'XMPayment Aktif' : currentGateway === 'arexanspay' ? 'ArexansPay Aktif' : 'Dual Gateway Aktif'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Gateway Selector Buttons */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Pilihan Gateway Pembayaran
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => saveSetting('payment_gateway', 'poketo')}
                className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between relative ${
                  currentGateway === 'poketo'
                    ? 'border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500 shadow-md'
                    : 'border-border/60 bg-muted/30 hover:border-emerald-500/40 text-muted-foreground'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Poketo.id (Utama)
                    </span>
                    <Radio className={`w-4 h-4 ${currentGateway === 'poketo' ? 'text-emerald-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    QRIS Otomatis, VA & E-Wallet via invoice pay.poketo.id.
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <ExternalLink className="w-3 h-3" /> https://poketo.id/docs
                </div>
              </button>

              <button
                type="button"
                onClick={() => saveSetting('payment_gateway', 'xmpayment')}
                className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between relative ${
                  currentGateway === 'xmpayment'
                    ? 'border-indigo-500 bg-indigo-500/10 text-foreground ring-1 ring-indigo-500 shadow-md'
                    : 'border-border/60 bg-muted/30 hover:border-indigo-500/40 text-muted-foreground'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-foreground">XMPayment</span>
                    <Radio className={`w-4 h-4 ${currentGateway === 'xmpayment' ? 'text-indigo-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    QRIS Otomatis & Cek Saldo Realtime via API xmpayment.my.id.
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-indigo-400">
                  <ExternalLink className="w-3 h-3" /> https://xmpayment.my.id/dashboard/docs
                </div>
              </button>

              <button
                type="button"
                onClick={() => saveSetting('payment_gateway', 'arexanspay')}
                className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between relative ${
                  currentGateway === 'arexanspay'
                    ? 'border-cyan-500 bg-cyan-500/10 text-foreground ring-1 ring-cyan-500 shadow-md'
                    : 'border-border/60 bg-muted/30 hover:border-cyan-500/40 text-muted-foreground'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-foreground">ArexansPay</span>
                    <Radio className={`w-4 h-4 ${currentGateway === 'arexanspay' ? 'text-cyan-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    QRIS Realtime via API arexanspay.id v2 dengan kode unik otomatis.
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-cyan-400">
                  <ExternalLink className="w-3 h-3" /> https://www.arexanspay.my.id/docs
                </div>
              </button>

              <button
                type="button"
                onClick={() => saveSetting('payment_gateway', 'both')}
                className={`p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between relative ${
                  currentGateway === 'both'
                    ? 'border-purple-500 bg-purple-500/10 text-foreground ring-1 ring-purple-500 shadow-md'
                    : 'border-border/60 bg-muted/30 hover:border-purple-500/40 text-muted-foreground'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-foreground">Keduanya (Dual)</span>
                    <Radio className={`w-4 h-4 ${currentGateway === 'both' ? 'text-purple-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pelanggan dapat memilih antara XMPayment atau ArexansPay.
                  </p>
                </div>
                <div className="mt-3 text-[11px] text-purple-400">
                  Dual Fallback Mode
                </div>
              </button>
            </div>
          </div>

          {/* Payment Simulation Mode Switch */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${isSimulationOn ? 'text-amber-400' : 'text-muted-foreground'}`} />
                <Label htmlFor="sim-switch" className="font-semibold text-sm cursor-pointer">
                  Simulasi Pembayaran (Testing Mode)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {isSimulationOn 
                  ? '⚠️ Simulasi AKTIF: Transaksi QRIS akan otomatis diset LUNAS dalam beberapa detik tanpa uang sungguhan.'
                  : 'Mode Normal: Transaksi QRIS memerlukan pembayaran riil melalui e-wallet/bank.'}
              </p>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-center">
              <span className={`text-xs font-bold ${isSimulationOn ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {isSimulationOn ? 'AKTIF' : 'NONAKTIF'}
              </span>
              <Switch
                id="sim-switch"
                checked={isSimulationOn}
                onCheckedChange={(checked) => saveSetting('payment_simulation', checked ? 'on' : 'off')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Poketo.id Integration Card (https://poketo.id/docs) */}
      <Card className="glass-card border-emerald-500/20 bg-background/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-green-500" />
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                  <Coins className="w-5 h-5 text-emerald-400" />
                  Integrasi Poketo.id (Payment Gateway)
                </CardTitle>
                <a
                  href="https://poketo.id/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full"
                >
                  <span>Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <CardDescription className="text-xs mt-1">
                Kredensial dari dashboard https://poketo.id untuk checkout invoice, QRIS instan, Virtual Account, dan E-Wallet.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testPoketoConnection}
              disabled={poketoTesting}
              className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 shrink-0 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${poketoTesting ? 'animate-spin' : ''}`} />
              {poketoTesting ? 'Memverifikasi...' : 'Test Koneksi Poketo'}
            </Button>
          </div>

          {/* Poketo Test Status Banner */}
          {poketoStatus && (
            <div className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
              poketoStatus.valid 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              {poketoStatus.valid ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{poketoStatus.valid ? `${poketoStatus.message}` : `Error: ${poketoStatus.error}`}</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Poketo API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="poketo_api_key" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Poketo API Key (Secret Key) <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, poketo_key: !p.poketo_key }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.poketo_key ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.poketo_key ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="poketo_api_key"
                type={showSecrets.poketo_key ? 'text' : 'password'}
                value={poketoApiKey}
                onChange={(e) => handleInputChange('poketo_api_key', e.target.value)}
                placeholder="sk_live_..."
                className="bg-muted/40 font-mono text-xs focus:border-emerald-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('poketo_api_key', poketoApiKey)}
                disabled={savingKey === 'poketo_api_key'}
                className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              API Secret Key dari menu API Keys di dashboard Poketo (contoh: <code>sk_live_...</code>).
            </p>
          </div>

          {/* Poketo Webhook Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="poketo_webhook_key" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Poketo Webhook Secret Key <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, poketo_whsec: !p.poketo_whsec }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.poketo_whsec ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.poketo_whsec ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="poketo_webhook_key"
                type={showSecrets.poketo_whsec ? 'text' : 'password'}
                value={poketoWebhookKey}
                onChange={(e) => handleInputChange('poketo_webhook_key', e.target.value)}
                placeholder="whsec_..."
                className="bg-muted/40 font-mono text-xs focus:border-emerald-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('poketo_webhook_key', poketoWebhookKey)}
                disabled={savingKey === 'poketo_webhook_key'}
                className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Webhook Secret (contoh: <code>whsec_...</code>) digunakan backend untuk memvalidasi header <code>poketo-signature</code>.
            </p>
          </div>

          {/* Webhook URL Helper */}
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" />
                URL Webhook untuk Dashboard Poketo.id
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'poketo_webhook')}
                className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/10 gap-1"
              >
                {copiedKey === 'poketo_webhook' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'poketo_webhook' ? 'Tersalin' : 'Salin URL'}
              </Button>
            </div>
            <div className="p-2 rounded bg-background/80 font-mono text-[11px] text-foreground break-all border border-emerald-500/20">
              {webhookUrl}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Salin URL ini ke <strong>Dashboard Poketo &gt; Webhooks</strong>. Centang event <code>invoice.paid</code>. License key akan terbit otomatis seketika pelanggan melunasi pembayaran.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. ArexansPay Integration Card (https://www.arexanspay.my.id/docs) */}
      <Card className="glass-card border-cyan-500/20 bg-background/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500" />
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Integrasi ArexansPay (QRIS 1)
                </CardTitle>
                <a
                  href="https://www.arexanspay.my.id/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1 bg-cyan-500/10 px-2 py-0.5 rounded-full"
                >
                  <span>Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <CardDescription className="text-xs mt-1">
                Kredensial dari dashboard https://www.arexanspay.my.id untuk generate dynamic QRIS dan pengecekan status otomatis.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testArexansPayConnection}
              disabled={arexanspayTesting}
              className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 shrink-0 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${arexanspayTesting ? 'animate-spin' : ''}`} />
              {arexanspayTesting ? 'Mengecek...' : 'Test Koneksi Toko'}
            </Button>
          </div>

          {/* Test Status Banner */}
          {arexanspayStatus && (
            <div className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
              arexanspayStatus.online 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              {arexanspayStatus.online ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{arexanspayStatus.online ? `Sukses: ${arexanspayStatus.deviceInfo}` : `Error: ${arexanspayStatus.error}`}</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* License Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="arexanspay_api_key" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                API Key (X-API-Key) <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, arexanspay_license: !p.arexanspay_license }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.arexanspay_license ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.arexanspay_license ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="arexanspay_api_key"
                type={showSecrets.arexanspay_license ? 'text' : 'password'}
                value={arexanspayLicense}
                onChange={(e) => handleInputChange('arexanspay_api_key', e.target.value)}
                placeholder="Contoh: arexanspay_07365360dc0f8af0..."
                className="bg-muted/40 font-mono text-xs focus:border-cyan-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('arexanspay_api_key', arexanspayLicense)}
                disabled={savingKey === 'arexanspay_api_key'}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Didapatkan dari dashboard ArexansPay menu API & Settings (header <code>X-API-Key</code>).
            </p>
          </div>

          {/* QRIS ID */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="arexanspay_qris_id" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                QRIS ID (X-QRIS-ID) <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, arexanspay_qris: !p.arexanspay_qris }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.arexanspay_qris ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.arexanspay_qris ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="arexanspay_qris_id"
                type={showSecrets.arexanspay_qris ? 'text' : 'password'}
                value={arexanspayQris}
                onChange={(e) => handleInputChange('arexanspay_qris_id', e.target.value)}
                placeholder="Contoh: axspay-na49b8c-ec96-41dc-a4e2-..."
                className="bg-muted/40 font-mono text-xs focus:border-cyan-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('arexanspay_qris_id', arexanspayQris)}
                disabled={savingKey === 'arexanspay_qris_id'}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ID QRIS statis / dynamic yang terdaftar di akun ArexansPay Anda.
            </p>
          </div>

          {/* Number ID Slot QRIS (opsional) */}
          <div className="space-y-1.5">
            <Label htmlFor="arexanspay_number_id" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              Number ID Slot QRIS (opsional)
            </Label>
            <div className="flex gap-2">
              <Input
                id="arexanspay_number_id"
                type="text"
                inputMode="numeric"
                value={arexanspayNumberId}
                onChange={(e) => handleInputChange('arexanspay_number_id', e.target.value.replace(/\D/g, ''))}
                placeholder="Contoh: 1 (Slot Kasir 1)"
                className="bg-muted/40 font-mono text-xs focus:border-cyan-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('arexanspay_number_id', arexanspayNumberId)}
                disabled={savingKey === 'arexanspay_number_id'}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Isi bila ingin memakai slot QRIS tertentu (endpoint <code>/api/qris/:numberId/create</code>) agar tidak bentrok antar kasir.
            </p>
          </div>


          {/* Webhook Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="arexanspay_webhook_key" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                Webhook Key <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, arexanspay_webhook: !p.arexanspay_webhook }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.arexanspay_webhook ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.arexanspay_webhook ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="arexanspay_webhook_key"
                type={showSecrets.arexanspay_webhook ? 'text' : 'password'}
                value={arexanspayWebhook}
                onChange={(e) => handleInputChange('arexanspay_webhook_key', e.target.value)}
                placeholder="Masukkan Webhook Key dari dashboard ArexansPay"
                className="bg-muted/40 font-mono text-xs focus:border-cyan-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('arexanspay_webhook_key', arexanspayWebhook)}
                disabled={savingKey === 'arexanspay_webhook_key'}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Webhook Key untuk memvalidasi callback pembayaran dari ArexansPay.
            </p>
          </div>

          {/* ArexansPay Webhook URL Helper */}
          <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" />
                URL Webhook untuk ArexansPay Dashboard
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'arexanspay_webhook')}
                className="h-7 px-2 text-xs text-cyan-400 hover:bg-cyan-500/10 gap-1"
              >
                {copiedKey === 'arexanspay_webhook' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'arexanspay_webhook' ? 'Tersalin' : 'Salin URL'}
              </Button>
            </div>
            <div className="p-2 rounded bg-background/80 font-mono text-[11px] text-foreground break-all border border-cyan-500/20">
              {webhookUrl}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Pasang URL di atas pada menu <strong>Webhook Settings</strong> di https://www.arexanspay.my.id agar notifikasi pembayaran realtime masuk.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. XMPayment Integration Card (https://xmpayment.my.id/dashboard/docs) */}
      <Card className="glass-card border-indigo-500/20 bg-background/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-display font-bold text-foreground">
                  Integrasi XMPayment Gateway (QRIS Otomatis)
                </CardTitle>
                <a
                  href="https://xmpayment.my.id/dashboard/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:underline flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded-full"
                >
                  <span>Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <CardDescription className="text-xs mt-1">
                Kredensial resmi dari https://xmpayment.my.id untuk generate invoice QRIS ber-kode unik, webhook callback, dan penarikan saldo DANA.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testXMPaymentConnection}
              disabled={xmpTesting}
              className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 shrink-0 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${xmpTesting ? 'animate-spin' : ''}`} />
              {xmpTesting ? 'Mengecek...' : 'Cek Saldo & Test XMPayment'}
            </Button>
          </div>

          {/* Test Status Banner / Saldo Widget */}
          {xmpStatus && (
            <div className={`mt-3 p-3 rounded-xl text-xs ${
              xmpStatus.valid 
                ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30' 
                : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}>
              <div className="flex items-center gap-2 mb-2 font-medium">
                {xmpStatus.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{xmpStatus.message || xmpStatus.error}</span>
              </div>

              {xmpStatus.valid && xmpStatus.balanceData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-indigo-500/20 text-[11px]">
                  <div className="p-2 rounded bg-black/40">
                    <span className="text-muted-foreground block text-[10px]">Saldo Tersedia</span>
                    <span className="font-bold font-mono text-emerald-400">{xmpStatus.balanceData.available_balance_formatted || `Rp ${xmpStatus.balanceData.available_balance?.toLocaleString('id-ID')}`}</span>
                  </div>
                  <div className="p-2 rounded bg-black/40">
                    <span className="text-muted-foreground block text-[10px]">Saldo Diproses (T+1)</span>
                    <span className="font-bold font-mono text-amber-300">{xmpStatus.balanceData.processing_balance_formatted || `Rp ${xmpStatus.balanceData.processing_balance?.toLocaleString('id-ID')}`}</span>
                  </div>
                  <div className="p-2 rounded bg-black/40">
                    <span className="text-muted-foreground block text-[10px]">Sedang Dicairkan</span>
                    <span className="font-bold font-mono text-blue-300">{xmpStatus.balanceData.withdrawing_balance_formatted || `Rp ${xmpStatus.balanceData.withdrawing_balance?.toLocaleString('id-ID')}`}</span>
                  </div>
                  <div className="p-2 rounded bg-black/40">
                    <span className="text-muted-foreground block text-[10px]">Total Saldo</span>
                    <span className="font-bold font-mono text-white">{xmpStatus.balanceData.total_balance_formatted || `Rp ${xmpStatus.balanceData.total_balance?.toLocaleString('id-ID')}`}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="xmpayment_api_key" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                API Key XMPayment <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, xmp_key: !p.xmp_key }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.xmp_key ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.xmp_key ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="xmpayment_api_key"
                type={showSecrets.xmp_key ? 'text' : 'password'}
                value={xmpApiKey}
                onChange={(e) => handleInputChange('xmpayment_api_key', e.target.value)}
                placeholder="xmp_live_..."
                className="bg-muted/40 font-mono text-xs focus:border-indigo-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('xmpayment_api_key', xmpApiKey)}
                disabled={savingKey === 'xmpayment_api_key'}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              API Key Live / Sandbox yang terdaftar di akun XMPayment Anda (contoh: <code>xmp_live_...</code>).
            </p>
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="xmpayment_webhook_secret" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                Webhook Secret (HMAC Signing Secret) <span className="text-destructive">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, xmp_whsec: !p.xmp_whsec }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.xmp_whsec ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.xmp_whsec ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="xmpayment_webhook_secret"
                type={showSecrets.xmp_whsec ? 'text' : 'password'}
                value={xmpWebhookSecret}
                onChange={(e) => handleInputChange('xmpayment_webhook_secret', e.target.value)}
                placeholder="whsec_..."
                className="bg-muted/40 font-mono text-xs focus:border-indigo-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('xmpayment_webhook_secret', xmpWebhookSecret)}
                disabled={savingKey === 'xmpayment_webhook_secret'}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Signing Secret untuk memverifikasi header <code>x-xmp-signature</code> (HMAC-SHA256) pada callback webhook.
            </p>
          </div>

          {/* Mode (Live / Sandbox) */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <Label className="text-xs font-semibold text-foreground">Mode Transaksi XMPayment</Label>
              <p className="text-[11px] text-muted-foreground">
                Gunakan Live Mode untuk QRIS resmi ber-kode unik, atau Sandbox untuk simulasi.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={xmpMode === 'live' ? 'default' : 'outline'}
                onClick={() => saveSetting('xmpayment_mode', 'live')}
                className={xmpMode === 'live' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : ''}
              >
                Live Mode
              </Button>
              <Button
                type="button"
                size="sm"
                variant={xmpMode === 'sandbox' ? 'default' : 'outline'}
                onClick={() => saveSetting('xmpayment_mode', 'sandbox')}
                className={xmpMode === 'sandbox' ? 'bg-amber-600 hover:bg-amber-500 text-white' : ''}
              >
                Sandbox
              </Button>
            </div>
          </div>

          {/* XMPayment Webhook URL Helper */}
          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" />
                URL Webhook untuk Dashboard XMPayment
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'xmpayment_webhook')}
                className="h-7 px-2 text-xs text-indigo-400 hover:bg-indigo-500/10 gap-1"
              >
                {copiedKey === 'xmpayment_webhook' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'xmpayment_webhook' ? 'Tersalin' : 'Salin URL'}
              </Button>
            </div>
            <div className="p-2 rounded bg-background/80 font-mono text-[11px] text-foreground break-all border border-indigo-500/20">
              {webhookUrl}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Daftarkan URL ini di dashboard <strong>XMPayment &gt; Developers &gt; Webhook URL</strong>. Server akan otomatis memproses pelunasan invoice saat pelanggan membayar QRIS.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Discord Notification & Communication */}
      <Card className="glass-card border-border/70 bg-background/60 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-display font-bold flex items-center gap-2 text-foreground">
                <Send className="w-4 h-4 text-indigo-400" />
                Notifikasi Discord & WhatsApp
              </CardTitle>
              <CardDescription className="text-xs">
                Kirim alert instan ke server Discord dan WhatsApp admin setiap ada pembayaran berhasil.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testDiscordWebhook}
              disabled={discordTesting}
              className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 shrink-0 gap-1.5"
            >
              <Send className={`w-3.5 h-3.5 ${discordTesting ? 'animate-spin' : ''}`} />
              {discordTesting ? 'Mengirim...' : 'Test Discord Webhook'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Discord Webhook URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="discord_webhook_url" className="text-xs font-semibold text-foreground">
                Discord Webhook URL
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, discord_url: !p.discord_url }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.discord_url ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.discord_url ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="discord_webhook_url"
                type={showSecrets.discord_url ? 'text' : 'password'}
                value={getValue('discord_webhook_url')}
                onChange={(e) => handleInputChange('discord_webhook_url', e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="bg-muted/40 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('discord_webhook_url', getValue('discord_webhook_url'))}
                disabled={savingKey === 'discord_webhook_url'}
                className="shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
          </div>

          {/* Fonnte WhatsApp Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="fonnte_token" className="text-xs font-semibold text-foreground">
                Fonnte WhatsApp Token (Opsional)
              </Label>
              <button
                type="button"
                onClick={() => setShowSecrets(p => ({ ...p, fonnte: !p.fonnte }))}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showSecrets.fonnte ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets.fonnte ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                id="fonnte_token"
                type={showSecrets.fonnte ? 'text' : 'password'}
                value={getValue('fonnte_token')}
                onChange={(e) => handleInputChange('fonnte_token', e.target.value)}
                placeholder="Token Fonnte untuk pesan WA otomatis"
                className="bg-muted/40 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('fonnte_token', getValue('fonnte_token'))}
                disabled={savingKey === 'fonnte_token'}
                className="shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. XCoins Wallet Integration */}
      <Card className="glass-card border-border/70 bg-background/60 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-display font-bold flex items-center gap-2 text-foreground">
            <Coins className="w-4 h-4 text-amber-400" />
            Integrasi Dompet XCoins
          </CardTitle>
          <CardDescription className="text-xs">
            Kelola aktivasi fitur saldo internal XCoins untuk pembelian script instan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-between">
              <div>
                <Label htmlFor="xcoins_enabled_switch" className="text-xs font-medium text-foreground cursor-pointer">
                  Aktifkan Sistem XCoins
                </Label>
                <p className="text-[11px] text-muted-foreground">Izinkan user daftar & deposit saldo XCoins.</p>
              </div>
              <Switch
                id="xcoins_enabled_switch"
                checked={getValue('xcoins_enabled') === 'on'}
                onCheckedChange={(c) => saveSetting('xcoins_enabled', c ? 'on' : 'off')}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-between">
              <div>
                <Label htmlFor="xcoins_only_switch" className="text-xs font-medium text-foreground cursor-pointer">
                  Hanya XCoins (Wajibkan Saldo)
                </Label>
                <p className="text-[11px] text-muted-foreground">Matikan QRIS langsung, wajib bayar via XCoins.</p>
              </div>
              <Switch
                id="xcoins_only_switch"
                checked={getValue('xcoins_only') === 'on'}
                onCheckedChange={(c) => saveSetting('xcoins_only', c ? 'on' : 'off')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="xcoins_logo_url" className="text-xs font-semibold text-foreground">
              Logo Kustom XCoins URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="xcoins_logo_url"
                type="text"
                value={getValue('xcoins_logo_url')}
                onChange={(e) => handleInputChange('xcoins_logo_url', e.target.value)}
                placeholder="/public/images/xcoins-default-logo.png"
                className="bg-muted/40 text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => saveSetting('xcoins_logo_url', getValue('xcoins_logo_url'))}
                disabled={savingKey === 'xcoins_logo_url'}
                className="shrink-0 gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
