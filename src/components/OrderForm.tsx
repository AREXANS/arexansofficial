import { FC, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shuffle, Edit3, Tag, ChevronDown, Gift, Coins, CreditCard, Sparkles,
  Smartphone, Radio, CheckCircle2, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getMaintenanceState, isDeveloperTesting } from '@/lib/maintenanceStore';
import GlobalBackground from './GlobalBackground';

interface Discount {
  id: string;
  discount_type: string;
  min_days: number | null;
  max_days: number | null;
  discount_percent: number;
  discount_amount: number;
  duration_exact: boolean;
  promo_code: string | null;
  package_name: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface OrderFormProps {
  selectedPkg: 'NORMAL' | 'VIP' | 'LIFETIME' | null;
  formData: { key: string; duration: string };
  setFormData: (data: { key: string; duration: string }) => void;
  onSubmit: (e: React.FormEvent, promoCode?: string, discountedAmount?: number, selectedGateway?: 'arexanspay' | 'xmpayment' | 'poketo') => void;
  onBack: () => void;
  onGenerate: () => void;
  loading: boolean;
  errorMsg: string;
  formatRupiah: (n: number) => string;
  parseDuration: (input: string) => { days: number; text: string } | null;
  prices: { NORMAL: number; VIP: number };
  resellerCode?: string | null;
  developerOnline?: boolean;
}

const generateRandomKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'AXS-';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const OrderForm: FC<OrderFormProps> = ({
  selectedPkg,
  formData,
  setFormData,
  onSubmit,
  onBack,
  onGenerate,
  loading,
  errorMsg,
  formatRupiah,
  parseDuration,
  prices,
  resellerCode,
  developerOnline,
}) => {
  const navigate = useNavigate();
  const [keyMode, setKeyMode] = useState<'random' | 'custom'>('random');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<Discount | null>(null);
  const [promoError, setPromoError] = useState('');
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [xcoinsEnabled, setXcoinsEnabled] = useState(false);
  const [xcoinsOnly, setXcoinsOnly] = useState(false);
  const [xcoinsUser, setXcoinsUser] = useState<{id: string; phone: string; balance: number; display_name: string} | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'xcoins'>('qris');
  const [xcoinsPin, setXcoinsPin] = useState('');
  const [xcoinsPayLoading, setXcoinsPayLoading] = useState(false);
  const [lifetimePrice, setLifetimePrice] = useState(700000);

  // Multi-gateway selection states
  const [enabledGateways, setEnabledGateways] = useState<string[]>(['arexanspay', 'xmpayment', 'poketo']);
  const [selectedGateway, setSelectedGateway] = useState<'arexanspay' | 'xmpayment' | 'poketo'>('xmpayment');
  const [phoneOnline, setPhoneOnline] = useState<boolean>(Boolean(developerOnline));

  useEffect(() => {
    if (developerOnline !== undefined) {
      setPhoneOnline(developerOnline);
    }
  }, [developerOnline]);

  useEffect(() => {
    const loadDiscounts = async () => {
      const { data } = await supabase.from('package_discounts').select('*').eq('is_active', true);
      if (data) setDiscounts(data as Discount[]);
    };

    const loadSettings = async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', [
        'xcoins_enabled', 'xcoins_only', 'enabled_gateways', 'payment_gateway', 'developer_last_seen'
      ]);
      const map = Object.fromEntries((data || []).map((s: any) => [s.key, s.value]));
      const enabled = map.xcoins_enabled === 'on';
      const only = map.xcoins_only === 'on';
      setXcoinsEnabled(enabled);
      setXcoinsOnly(only);
      if (only) setPaymentMethod('xcoins');

      // Enabled gateways
      let list: string[] = ['arexanspay', 'xmpayment', 'poketo'];
      if (map.enabled_gateways) {
        try {
          const parsed = JSON.parse(map.enabled_gateways);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        } catch {}
      } else if (map.payment_gateway) {
        const pg = map.payment_gateway.toLowerCase();
        if (pg === 'both') list = ['arexanspay', 'xmpayment'];
        else if (pg === 'all') list = ['arexanspay', 'xmpayment', 'poketo'];
        else if (pg.includes(',')) list = pg.split(',').map((s: string) => s.trim());
        else list = [pg];
      }
      setEnabledGateways(list);

      // Heartbeat check for phone (ArexansPay)
      const last = parseInt(map.developer_last_seen || '0', 10);
      const isOnline = !!last && (Date.now() - last < 3 * 60 * 1000);
      if (developerOnline === undefined) {
        setPhoneOnline(isOnline);
      }

      // Check XCoins session
      if (enabled) {
        const stored = localStorage.getItem('xcoins_session');
        if (stored) {
          try { setXcoinsUser(JSON.parse(stored)); } catch {}
        }
      }
    };

    const loadLifetimePrice = async () => {
      const { data } = await supabase.from('packages').select('price_per_day').eq('name', 'LIFETIME').eq('is_active', true).maybeSingle();
      if (data) setLifetimePrice(data.price_per_day);
    };

    loadDiscounts();
    loadSettings();
    loadLifetimePrice();

    const interval = setInterval(loadSettings, 12000);
    return () => clearInterval(interval);
  }, [developerOnline]);

  useEffect(() => {
    if (keyMode === 'random' && (!formData.key || !formData.key.startsWith('AXS-'))) {
      setFormData({ ...formData, key: generateRandomKey() });
    }
  }, [keyMode]);

  useEffect(() => {
    if (!formData.key) {
      setFormData({ ...formData, key: generateRandomKey() });
    }
  }, []);

  const handleKeyModeChange = (mode: string) => {
    setKeyMode(mode as 'random' | 'custom');
    if (mode === 'random') {
      setFormData({ ...formData, key: generateRandomKey() });
    } else {
      setFormData({ ...formData, key: '' });
    }
  };

  const regenerateKey = () => {
    setFormData({ ...formData, key: generateRandomKey() });
  };

  const isLifetime = selectedPkg === 'LIFETIME';
  const roleCardClass = selectedPkg === 'LIFETIME'
    ? 'role-card-admin'
    : selectedPkg === 'VIP'
      ? 'role-card-vip'
      : 'role-card-normal';
  const roleTextClass = selectedPkg === 'LIFETIME'
    ? 'text-cyan-glow'
    : selectedPkg === 'VIP'
      ? 'text-vip'
      : 'text-success';
  const roleTintClass = selectedPkg === 'LIFETIME'
    ? 'bg-cyan-glow/10 border-cyan-glow/30'
    : selectedPkg === 'VIP'
      ? 'bg-purple-glow/10 border-purple-glow/30'
      : 'bg-success/10 border-success/30';
  const durationData = isLifetime ? { days: 999999, text: 'LIFETIME (Permanen)' } : parseDuration(formData.duration);
  const pricePerDay = selectedPkg === 'VIP' ? prices.VIP : prices.NORMAL;
  const estimatedTotal = isLifetime ? (lifetimePrice || 700000) : (durationData ? pricePerDay * durationData.days : 0);

  // Find duration-based discount (supports duration_exact)
  const findDurationDiscount = (): Discount | null => {
    if (!durationData) return null;
    const now = new Date();
    return discounts
      .filter(d => {
        if (d.discount_type !== 'duration_based') return false;
        if (d.min_days === null) return false;
        if (d.duration_exact) {
          if (durationData.days !== d.min_days) return false;
        } else {
          if (durationData.days < d.min_days) return false;
          if (d.max_days !== null && durationData.days > d.max_days) return false;
        }
        if (d.package_name && d.package_name !== selectedPkg) return false;
        if (d.start_date && new Date(d.start_date) > now) return false;
        if (d.end_date && new Date(d.end_date) < now) return false;
        return true;
      })
      .sort((a, b) => (b.min_days || 0) - (a.min_days || 0))[0] || null;
  };

  const applyPromoCode = () => {
    setPromoError('');
    const now = new Date();
    const promo = discounts.find(d => {
      if (d.discount_type !== 'promo_code') return false;
      if (d.promo_code?.toUpperCase() !== promoCode.toUpperCase()) return false;
      if (d.package_name && d.package_name !== selectedPkg) return false;
      if (d.start_date && new Date(d.start_date) > now) return false;
      if (d.end_date && new Date(d.end_date) < now) return false;
      return true;
    });

    if (!promo) {
      setPromoError('Kode promo tidak valid atau telah kadaluarsa');
      setAppliedPromo(null);
      return;
    }

    if (promo.duration_exact && promo.min_days !== null) {
      if (!durationData) { setPromoError('Masukkan durasi terlebih dahulu'); return; }
      if (durationData.days !== promo.min_days) {
        setPromoError(`Promo ini hanya berlaku untuk durasi persis ${promo.min_days} hari`);
        return;
      }
    } else if (promo.min_days !== null || promo.max_days !== null) {
      if (!durationData) { setPromoError('Masukkan durasi terlebih dahulu'); return; }
      if (promo.min_days !== null && durationData.days < promo.min_days) {
        setPromoError(`Promo ini berlaku untuk pembelian ${promo.min_days}${promo.max_days ? `-${promo.max_days}` : '+'} hari`);
        return;
      }
      if (promo.max_days !== null && durationData.days > promo.max_days) {
        setPromoError(`Promo ini berlaku untuk pembelian ${promo.min_days}-${promo.max_days} hari`);
        return;
      }
    }

    setAppliedPromo(promo);
    setPromoError('');
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoError('');
    setShowPromoInput(false);
  };

  const durationDiscount = findDurationDiscount();
  const activeDiscount = appliedPromo || durationDiscount;
  const standardDiscountPercent = activeDiscount?.discount_percent || 0;
  const fixedAmount = activeDiscount?.discount_amount || 0;

  const discountAmount = fixedAmount > 0
    ? Math.min(fixedAmount, estimatedTotal)
    : Math.floor(estimatedTotal * (standardDiscountPercent / 100));
  const finalTotal = Math.max(0, estimatedTotal - discountAmount);

  // Gateway availability rules
  // Payment 1: ArexansPay (hanya online ketika HP admin online aktif data)
  const isArexansPayOnline = Boolean(phoneOnline) && enabledGateways.includes('arexanspay');
  // Payment 2: XMPayment (selalu online)
  const isXmpOnline = enabledGateways.includes('xmpayment');
  // Payment 3: Poketo (hanya online ketika orderan minimal 10.000)
  const isPoketoOnline = enabledGateways.includes('poketo') && finalTotal >= 10000;

  // Auto-switch to an available online gateway
  useEffect(() => {
    if (selectedGateway === 'poketo' && !isPoketoOnline) {
      if (isXmpOnline) setSelectedGateway('xmpayment');
      else if (isArexansPayOnline) setSelectedGateway('arexanspay');
    } else if (selectedGateway === 'arexanspay' && !isArexansPayOnline) {
      if (isXmpOnline) setSelectedGateway('xmpayment');
      else if (isPoketoOnline) setSelectedGateway('poketo');
    } else if (selectedGateway === 'xmpayment' && !isXmpOnline) {
      if (isPoketoOnline) setSelectedGateway('poketo');
      else if (isArexansPayOnline) setSelectedGateway('arexanspay');
    }
  }, [finalTotal, isArexansPayOnline, isXmpOnline, isPoketoOnline, selectedGateway]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mState = await getMaintenanceState();
    const isUnderMaintenance = (mState.globalMaintenance || mState.arexansToolsMaintenance) && !isDeveloperTesting();
    if (isUnderMaintenance) {
      toast({
        title: 'Arexans Tools Sedang Maintenance',
        description: 'Pembelian dinonaktifkan sementara untuk publik & masa aktif key pembeli dibekukan agar tidak rugi.',
        variant: 'destructive',
      });
      return;
    }

    if (paymentMethod === 'xcoins') {
      handleXcoinsPay(e);
    } else {
      if (selectedGateway === 'arexanspay' && !isArexansPayOnline) {
        toast({
          title: 'Payment 1 Offline',
          description: 'HP Admin sedang mati atau tidak aktif data. Silakan pilih Payment 2 (XMPayment) atau Payment 3 (Poketo).',
          variant: 'destructive',
        });
        return;
      }
      if (selectedGateway === 'poketo' && finalTotal < 10000) {
        toast({
          title: 'Minimal Order Rp 10.000',
          description: `Payment 3 (Poketo) hanya online untuk order minimal Rp 10.000 (total saat ini: ${formatRupiah(finalTotal)}). Silakan pilih Payment 1 atau 2.`,
          variant: 'destructive',
        });
        return;
      }
      const codeToPass = appliedPromo?.promo_code || undefined;
      onSubmit(e, codeToPass, finalTotal > 0 ? finalTotal : undefined, selectedGateway);
    }
  };

  const handleXcoinsPay = async (e: React.FormEvent) => {
    e.preventDefault();
    const mState = await getMaintenanceState();
    const isUnderMaintenance = (mState.globalMaintenance || mState.arexansToolsMaintenance) && !isDeveloperTesting();
    if (isUnderMaintenance) {
      toast({
        title: 'Arexans Tools Sedang Maintenance',
        description: 'Pembelian dinonaktifkan sementara untuk publik & masa aktif key pembeli dibekukan agar tidak rugi.',
        variant: 'destructive',
      });
      return;
    }
    if (!xcoinsUser) {
      toast({ title: 'Login XCoins dulu', description: 'Silakan login di halaman XCoins', variant: 'destructive' });
      navigate('/xcoins');
      return;
    }
    if (!xcoinsPin || xcoinsPin.length !== 6) {
      toast({ title: 'Error', description: 'Masukkan PIN 6 digit', variant: 'destructive' });
      return;
    }
    if (!durationData) {
      toast({ title: 'Error', description: 'Masukkan durasi terlebih dahulu', variant: 'destructive' });
      return;
    }

    setXcoinsPayLoading(true);
    // Get device_id for history tracking
    let deviceId = localStorage.getItem('arexans_device_id') || '';
    const res = await supabase.functions.invoke('xcoins-pay', {
      body: {
        userId: xcoinsUser.id,
        pin: xcoinsPin,
        amount: finalTotal,
        packageName: selectedPkg || 'NORMAL',
        packageDuration: durationData.days,
        licenseKey: formData.key,
        deviceId
      }
    });

    if (res.data?.success) {
      // Update stored balance
      const newBalance = res.data.newBalance;
      localStorage.setItem('xcoins_session', JSON.stringify({ ...xcoinsUser, balance: newBalance }));
      toast({ title: '🎉 Pembayaran XCoins Berhasil!', description: `Key: ${formData.key}` });
      
      // Trigger payment success flow
      const expiredDate = isLifetime ? new Date("2099-12-31T23:59:59.000Z") : new Date();
      if (!isLifetime) expiredDate.setDate(expiredDate.getDate() + durationData.days);
      
      // Store final data and go to success
      const state = {
        step: 4,
        selectedPkg,
        formData,
        paymentData: null,
        finalData: {
          key: formData.key,
          package: selectedPkg || 'NORMAL',
          expired: expiredDate.toISOString(),
          expiredDisplay: isLifetime ? 'Selamanya' : expiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          days: durationData.days,
          transactionId: res.data.transactionId
        },
        daysToAdd: durationData.days
      };
      localStorage.setItem('arexans_payment_state', JSON.stringify(state));
      window.location.reload();
    } else {
      toast({ title: 'Error', description: res.data?.error || 'Gagal bayar', variant: 'destructive' });
    }
    setXcoinsPayLoading(false);
  };

  const getDiscountRangeText = (d: Discount) => {
    if (d.duration_exact && d.min_days) return `${d.min_days}h only`;
    if (d.max_days !== null && d.min_days !== null) return `${d.min_days}-${d.max_days}h`;
    return `${d.min_days}h+`;
  };


  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <GlobalBackground />
      <div className={`${roleCardClass} p-8 max-w-md w-full relative z-10`}>
        <button onClick={onBack} className="absolute top-6 left-6 text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center gap-2 font-medium">
          <span>←</span> Kembali
        </button>

        <div className="text-center mb-8 pt-8">
          <div className={`inline-block px-4 py-2 rounded-full border text-sm font-bold mb-4 ${roleTintClass} ${roleTextClass}`}>
            Paket {selectedPkg === 'LIFETIME' ? 'LIFETIME ADMIN' : selectedPkg}
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground">Isi Data Pembelian</h2>
        </div>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/50 text-destructive p-4 rounded-xl mb-6 text-sm animate-slide-in">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Key mode tabs */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">Kunci Rahasia</label>
            <Tabs value={keyMode} onValueChange={handleKeyModeChange} className="w-full">
              <TabsList className="w-full mb-3">
                <TabsTrigger value="random" className="flex-1 gap-1.5 text-xs"><Shuffle className="w-3.5 h-3.5" />Random Key</TabsTrigger>
                <TabsTrigger value="custom" className="flex-1 gap-1.5 text-xs"><Edit3 className="w-3.5 h-3.5" />Custom Key</TabsTrigger>
              </TabsList>
              <TabsContent value="random" className="mt-0">
                <div className="flex gap-2">
                  <Input type="text" value={formData.key} readOnly className="flex-1 bg-muted/50 border-border font-mono text-sm" />
                  <Button type="button" variant="outline" onClick={regenerateKey} className="shrink-0 gap-1.5"><Shuffle className="w-4 h-4" />Acak</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Key otomatis format AXS-XXXXXXXX</p>
              </TabsContent>
              <TabsContent value="custom" className="mt-0">
                <Input type="text" value={formData.key} onChange={(e) => setFormData({ ...formData, key: e.target.value })} placeholder="Masukkan key unik kamu" className="bg-muted/50 border-border focus:border-primary" />
                <p className="text-xs text-muted-foreground mt-2">Gunakan key unik yang mudah diingat (min 4 karakter)</p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Duration - hide for LIFETIME */}
          {!isLifetime && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-foreground">Durasi</label>
              <span className="text-[11px] text-muted-foreground font-mono">Bebas pilih durasi</span>
            </div>
            <div className="flex gap-2 mb-2 flex-wrap">
              <Button type="button" variant={formData.duration === '1h' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({ ...formData, duration: '1h' })} className="flex-1 text-xs">1 Hari</Button>
              <Button type="button" variant={formData.duration === '3h' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({ ...formData, duration: '3h' })} className="flex-1 text-xs">3 Hari</Button>
              <Button type="button" variant={formData.duration === '7h' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({ ...formData, duration: '7h' })} className="flex-1 text-xs">7 Hari</Button>
              <Button type="button" variant={formData.duration === '1b' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({ ...formData, duration: '1b' })} className="flex-1 text-xs">1 Bulan</Button>
              <Button type="button" variant={formData.duration === '1t' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({ ...formData, duration: '1t' })} className="flex-1 text-xs">1 Tahun</Button>
            </div>
            <Input type="text" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} placeholder="Atau ketik manual: 1h, 3h, 7h, 1b, 1t" className="bg-muted/50 border-border focus:border-primary" />
            <div className="mt-2 text-[11px] space-y-1 bg-muted/40 p-2.5 rounded-lg border border-border/60">
              <p className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>Payment 1 <strong>ArexansPay</strong>: Online bila HP admin aktif data internet.</span>
              </p>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span>Payment 2 <strong>XMPayment</strong>: Selalu online untuk semua nominal.</span>
              </p>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Payment 3 <strong>Poketo.id</strong>: Hanya online untuk order minimal Rp 10.000.</span>
              </p>
            </div>
          </div>
          )}

          {/* LIFETIME info */}
          {isLifetime && (
            <div className="bg-cyan-glow/5 p-4 rounded-xl border border-cyan-glow/20 animate-slide-in">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Paket:</span>
                <span className="font-bold text-cyan-glow">LIFETIME ADMIN</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Durasi:</span>
                <span className="font-medium text-foreground">Permanen (Selamanya)</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-bold text-cyan-glow">ADMIN</span>
              </div>
              <div className="border-t border-cyan-glow/20 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">Total:</span>
                  <span className="font-bold text-cyan-glow">{formatRupiah(lifetimePrice)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Promo Code Toggle */}
          {!isLifetime && !showPromoInput && !appliedPromo && (
            <button type="button" onClick={() => setShowPromoInput(true)} className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
              <Tag className="w-4 h-4" />
              Punya kode promo?
              <ChevronDown className="w-4 h-4" />
            </button>
          )}

          {/* Promo Code Input */}
          {(showPromoInput || appliedPromo) && (
            <div className="animate-slide-in">
              <label className="block text-sm font-medium mb-2 text-foreground flex items-center gap-2"><Tag className="w-4 h-4" />Kode Promo</label>
              <div className="flex gap-2">
                <Input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Masukkan kode promo" className="flex-1 bg-muted/50 border-border focus:border-primary font-mono" disabled={!!appliedPromo} />
                {appliedPromo ? (
                  <Button type="button" variant="outline" onClick={removePromo} className="shrink-0 border-destructive text-destructive hover:bg-destructive/10">Hapus</Button>
                ) : (
                  <Button type="button" variant="outline" onClick={applyPromoCode} disabled={!promoCode} className="shrink-0 border-border hover:bg-muted">Terapkan</Button>
                )}
              </div>
              {promoError && <p className="text-xs text-destructive mt-2">{promoError}</p>}
              {appliedPromo && (
                <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
                  <Gift className="w-3 h-3" />
                  Kode promo berhasil diterapkan: -{appliedPromo.discount_percent}%
                </p>
              )}
            </div>
          )}

          {durationData && (
            <div className={`p-4 rounded-xl border animate-slide-in ${roleTintClass}`}>
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Durasi:</span>
                <span className="font-medium text-foreground">{durationData.text}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Harga/hari:</span>
                <span className="font-medium text-foreground">{formatRupiah(pricePerDay)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className={`font-medium ${discountAmount > 0 ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{formatRupiah(estimatedTotal)}</span>
              </div>

              {activeDiscount && discountAmount > 0 && (
                <div className="flex justify-between mb-2 text-green-500">
                  <span className="flex items-center gap-1">
                    <Gift className="w-4 h-4" />
                    {activeDiscount.discount_type === 'duration_based' ? `Diskon (${getDiscountRangeText(activeDiscount)})` : activeDiscount.discount_type === 'promo_code' ? `Promo ${activeDiscount.promo_code}` : 'Diskon'}
                  </span>
                  <span className="font-medium">
                    -{formatRupiah(discountAmount)}
                    {fixedAmount === 0 && standardDiscountPercent > 0 ? ` (${standardDiscountPercent}%)` : ''}
                  </span>
                </div>
              )}

              {!appliedPromo && durationData && !durationDiscount && (
                (() => {
                  const hints = discounts
                    .filter(d => d.discount_type === 'duration_based' && d.min_days && (!d.package_name || d.package_name === selectedPkg))
                    .sort((a, b) => (a.min_days || 0) - (b.min_days || 0))
                    .slice(0, 1);
                  return hints.length > 0 ? (
                    <div className="text-xs text-muted-foreground mt-2 p-2 bg-primary/5 rounded border border-primary/20">
                      {hints.map(d => (
                        <span key={d.id} className="flex items-center gap-1"><Gift className="w-3 h-3" />Beli {getDiscountRangeText(d)} untuk diskon {d.discount_percent}%!</span>
                      ))}
                    </div>
                  ) : null;
                })()
              )}

              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">Total:</span>
                  <span className={`font-bold ${roleTextClass}`}>{formatRupiah(finalTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Pilihan Payment Gateway 1, 2, 3 */}
          {paymentMethod === 'qris' && (
            <div className="space-y-3 pt-1 animate-slide-in">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  Pilih Payment Gateway
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {selectedGateway === 'arexanspay' ? 'Payment 1 Aktif' : selectedGateway === 'xmpayment' ? 'Payment 2 Aktif' : 'Payment 3 Aktif'}
                </span>
              </div>

              <div className="space-y-2.5">
                {/* Payment 1: ArexansPay (Hanya online ketika HP admin online aktif data) */}
                {enabledGateways.includes('arexanspay') && (
                  <button
                    type="button"
                    disabled={!isArexansPayOnline}
                    onClick={() => {
                      if (isArexansPayOnline) {
                        setSelectedGateway('arexanspay');
                      } else {
                        toast({
                          title: 'Payment 1 Offline',
                          description: 'HP Admin sedang offline / tidak terhubung data internet. Silakan pilih Payment 2 (XMPayment) atau Payment 3 (Poketo).',
                          variant: 'destructive',
                        });
                      }
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all duration-200 relative ${
                      selectedGateway === 'arexanspay' && isArexansPayOnline
                        ? 'border-cyan-500 bg-cyan-500/15 text-foreground ring-1 ring-cyan-500 shadow-md shadow-cyan-500/10'
                        : !isArexansPayOnline
                        ? 'border-border/50 bg-muted/20 opacity-60 cursor-not-allowed'
                        : 'border-border/70 bg-muted/30 hover:border-cyan-500/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-foreground">
                            Payment 1: ArexansPay
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              isArexansPayOnline
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {isArexansPayOnline ? 'Online (HP Admin Aktif)' : 'Offline (HP Mati/Tanpa Data)'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          QRIS Instan Realtime. Tanpa biaya admin tambahan.
                        </p>
                      </div>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedGateway === 'arexanspay' && isArexansPayOnline
                          ? 'border-cyan-400 bg-cyan-400'
                          : 'border-muted-foreground/40'
                      }`}>
                        {selectedGateway === 'arexanspay' && isArexansPayOnline && (
                          <div className="w-1.5 h-1.5 rounded-full bg-black" />
                        )}
                      </div>
                    </div>
                  </button>
                )}

                {/* Payment 2: XMPayment (Selalu online) */}
                {enabledGateways.includes('xmpayment') && (
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('xmpayment')}
                    className={`w-full p-3 rounded-xl border text-left transition-all duration-200 relative ${
                      selectedGateway === 'xmpayment'
                        ? 'border-indigo-500 bg-indigo-500/15 text-foreground ring-1 ring-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'border-border/70 bg-muted/30 hover:border-indigo-500/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-foreground">
                            Payment 2: XMPayment
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Online (24/7)
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          QRIS Otomatis dengan kode unik &amp; verifikasi mutasi realtime.
                        </p>
                      </div>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedGateway === 'xmpayment'
                          ? 'border-indigo-400 bg-indigo-400'
                          : 'border-muted-foreground/40'
                      }`}>
                        {selectedGateway === 'xmpayment' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-black" />
                        )}
                      </div>
                    </div>
                  </button>
                )}

                {/* Payment 3: Poketo (Hanya online ketika orderan minimal 10.000) */}
                {enabledGateways.includes('poketo') && (
                  <button
                    type="button"
                    disabled={!isPoketoOnline}
                    onClick={() => {
                      if (isPoketoOnline) {
                        setSelectedGateway('poketo');
                      } else {
                        toast({
                          title: 'Minimal Order Rp 10.000',
                          description: `Payment 3 (Poketo) hanya online untuk pembelian minimal Rp 10.000. Total order Anda saat ini: ${formatRupiah(finalTotal)}.`,
                          variant: 'destructive',
                        });
                      }
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all duration-200 relative ${
                      selectedGateway === 'poketo' && isPoketoOnline
                        ? 'border-emerald-500 bg-emerald-500/15 text-foreground ring-1 ring-emerald-500 shadow-md shadow-emerald-500/10'
                        : !isPoketoOnline
                        ? 'border-border/50 bg-muted/20 opacity-60 cursor-not-allowed'
                        : 'border-border/70 bg-muted/30 hover:border-emerald-500/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-foreground">
                            Payment 3: Poketo.id
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              isPoketoOnline
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {isPoketoOnline ? 'Online (Multi-Metode)' : 'Offline (Min. Rp 10.000)'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          QRIS Instan, Virtual Account 10 Bank, PayLater &amp; Kartu Debit.
                        </p>
                      </div>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedGateway === 'poketo' && isPoketoOnline
                          ? 'border-emerald-400 bg-emerald-400'
                          : 'border-muted-foreground/40'
                      }`}>
                        {selectedGateway === 'poketo' && isPoketoOnline && (
                          <div className="w-1.5 h-1.5 rounded-full bg-black" />
                        )}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Payment Method Selection (XCoins vs QRIS) */}
          {xcoinsEnabled && !xcoinsOnly && (
            <div className="animate-slide-in">
              <label className="block text-sm font-medium mb-2 text-foreground">Metode Pembayaran</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPaymentMethod('qris')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${paymentMethod === 'qris' ? 'border-primary bg-primary/10' : 'border-border bg-muted/50 hover:border-primary/50'}`}>
                  <CreditCard className={`w-5 h-5 ${paymentMethod === 'qris' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium">QRIS / Invoice</span>
                </button>
                <button type="button" onClick={() => { setPaymentMethod('xcoins'); if (!xcoinsUser) navigate('/xcoins'); }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${paymentMethod === 'xcoins' ? 'border-primary bg-primary/10' : 'border-border bg-muted/50 hover:border-primary/50'}`}>
                  <Coins className={`w-5 h-5 ${paymentMethod === 'xcoins' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium">XCoins</span>
                  {xcoinsUser && <span className="text-[10px] text-muted-foreground">{new Intl.NumberFormat('id-ID').format(xcoinsUser.balance)}</span>}
                </button>
              </div>
            </div>
          )}

          {/* XCoins PIN input */}
          {(paymentMethod === 'xcoins' || xcoinsOnly) && xcoinsUser && (
            <div className="animate-slide-in">
              <label className="block text-sm font-medium mb-2 text-foreground flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                PIN XCoins ({xcoinsUser.display_name})
              </label>
              <Input type="password" maxLength={6} value={xcoinsPin} onChange={e => setXcoinsPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="bg-muted/50 border-border text-center tracking-[0.5em] font-mono text-lg" />
              <p className="text-xs text-muted-foreground mt-1">Saldo: {new Intl.NumberFormat('id-ID').format(xcoinsUser.balance)} XCoins</p>
            </div>
          )}

          {(paymentMethod === 'xcoins' || xcoinsOnly) && !xcoinsUser && (
            <div className="p-4 bg-muted/50 rounded-xl border border-border text-center animate-slide-in">
              <Coins className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Login XCoins untuk membayar</p>
              <Button type="button" variant="outline" onClick={() => navigate('/xcoins')} className="gap-2">
                <Coins className="w-4 h-4" /> Login XCoins
              </Button>
            </div>
          )}

          <Button type="submit" disabled={loading || xcoinsPayLoading || ((paymentMethod === 'xcoins' || xcoinsOnly) && !xcoinsUser)} className={`w-full py-6 font-display font-bold text-lg ${selectedPkg === 'LIFETIME' ? 'btn-primary' : selectedPkg === 'VIP' ? 'btn-vip' : 'bg-success hover:bg-success/90 text-success-foreground'}`}>
            {loading || xcoinsPayLoading ? (
              <span className="flex items-center gap-2"><span className="animate-spin">⟳</span> Memproses...</span>
            ) : paymentMethod === 'xcoins' || xcoinsOnly ? (
              <span className="flex items-center gap-2"><Coins className="w-5 h-5" /> Bayar {durationData ? new Intl.NumberFormat('id-ID').format(finalTotal) : ''} XCoins</span>
            ) : (
              'Lanjut ke Pembayaran'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default OrderForm;
