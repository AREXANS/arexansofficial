import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PackageSelection from '@/components/PackageSelection';
import OrderForm from '@/components/OrderForm';
import PaymentQR from '@/components/PaymentQR';
import PaymentSuccess from '@/components/PaymentSuccess';
import MaintenancePage from '@/components/MaintenancePage';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isDeveloperTesting, getMaintenanceState } from '@/lib/maintenanceStore';

interface Ad {
  id: string;
  title: string;
  media_url: string;
  media_type: string;
  link: string | null;
  link_url?: string | null;
  is_active: boolean;
}

interface Package {
  id: string;
  name: string;
  display_name: string;
  price_per_day: number;
  description: string | null;
  features: string[] | null;
  is_active: boolean;
}

interface PaymentData {
  transactionId: string;
  qr_string: string;
  qris_url: string;
  payment_url?: string;
  totalAmount: number;
  originalAmount?: number;
  gateway?: string;
  isPoketo?: boolean;
  slug?: string;
  vaBanks?: Array<{ code: string; name: string }>;
  quotes?: any;
  expiresAt: string;
  productId?: string;
}

interface FinalData {
  key: string;
  package: string;
  expired: string;
  expiredDisplay: string;
  days: number;
  transactionId?: string;
  productId?: string;
}

const STORAGE_KEY = 'arexans_payment_state';

interface StoredState {
  step: number;
  selectedPkg: 'NORMAL' | 'VIP' | 'LIFETIME' | null;
  formData: { key: string; duration: string };
  paymentData: PaymentData | null;
  finalData: FinalData | null;
  daysToAdd: number;
}

const getDeviceId = (): string => {
  try {
    let id = typeof window !== 'undefined' ? localStorage.getItem('arexans_device_id') : null;
    if (!id) {
      let canvasData = '';
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fp', 2, 2); }
        canvasData = canvas.toDataURL();
      } catch {
        canvasData = 'canvas_na';
      }
      const sw = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0';
      const fp = [navigator.userAgent, navigator.language, sw, new Date().getTimezoneOffset(), canvasData].join('|');
      let hash = 0;
      for (let i = 0; i < fp.length; i++) { hash = ((hash << 5) - hash) + fp.charCodeAt(i); hash = hash & hash; }
      id = 'USR-' + Math.abs(hash).toString(36).toUpperCase();
      try { localStorage.setItem('arexans_device_id', id); } catch {}
    }
    return id;
  } catch {
    return 'USR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  }
};

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedPkg, setSelectedPkg] = useState<'NORMAL' | 'VIP' | 'LIFETIME' | null>(null);
  const [formData, setFormData] = useState({ key: '', duration: '' });
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [finalData, setFinalData] = useState<FinalData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [ads, setAds] = useState<Ad[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [daysToAdd, setDaysToAdd] = useState(0);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [gatewaySetting, setGatewaySetting] = useState<string>('');
  const [developerOnline, setDeveloperOnline] = useState<boolean>(false);

  const [pendingPayment, setPendingPayment] = useState<null | {
    amount: number;
    days: number;
    promoCode?: string;
    packageName: string;
  }>(null);
  const deviceId = getDeviceId();

  // Auto-fill key from URL params (from KeySystem perpanjang button)
  const prefilledKey = searchParams.get('key');
  const prefilledRole = searchParams.get('role');
  const tabParam = searchParams.get('tab') as 'tools' | 'toko' | null;

  useEffect(() => {
    if (prefilledKey) {
      setFormData(prev => ({ ...prev, key: prefilledKey }));
      // Auto-select package based on role
      const pkg = prefilledRole?.toUpperCase() === 'VIP' || prefilledRole?.toUpperCase() === 'DEVELOPER' ? 'VIP' : 'NORMAL';
      setSelectedPkg(pkg);
      setStep(2);
      setSearchParams({}, { replace: true });
    }
  }, [prefilledKey, prefilledRole, setSearchParams]);

  const handleTokoScriptQris = (order: {
    transactionId: string;
    qr_string: string;
    qris_url: string;
    payment_url?: string;
    totalAmount: number;
    expiresAt: string;
    licenseKey: string;
    packageName: string;
    days: number;
    productId?: string;
    gateway?: string;
    isPoketo?: boolean;
    slug?: string;
    vaBanks?: Array<{ code: string; name: string }>;
    quotes?: any;
  }) => {
    setFormData({ key: order.licenseKey, duration: `${order.days} hari` });
    setSelectedPkg(order.packageName as any);
    setDaysToAdd(order.days);
    const newPaymentData: PaymentData = {
      transactionId: order.transactionId,
      qr_string: order.qr_string,
      qris_url: order.qris_url,
      payment_url: order.payment_url,
      totalAmount: order.totalAmount,
      expiresAt: order.expiresAt,
      productId: order.productId,
      gateway: order.gateway,
      isPoketo: order.isPoketo,
      slug: order.slug,
      vaBanks: order.vaBanks,
      quotes: order.quotes,
    };
    setPaymentData(newPaymentData);
    setStep(3);
    saveState(3, newPaymentData, null, order.days);
    setStatusMsg("Menunggu pembayaran...");
  };

  const checkInterval = useRef<number | null>(null);

  const PRICES = {
    NORMAL: packages.find(p => p.name === 'NORMAL')?.price_per_day ?? 2000,
    VIP: packages.find(p => p.name === 'VIP')?.price_per_day ?? 3000
  };

  const saveState = (newStep: number, newPaymentData?: PaymentData | null, newFinalData?: FinalData | null, newDays?: number) => {
    const state: StoredState = {
      step: newStep,
      selectedPkg,
      formData,
      paymentData: newPaymentData !== undefined ? newPaymentData : paymentData,
      finalData: newFinalData !== undefined ? newFinalData : finalData,
      daysToAdd: newDays !== undefined ? newDays : daysToAdd
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const clearStoredState = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // Load stored state on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const state: StoredState = JSON.parse(stored);
        
        // Check if payment expired
        if (state.paymentData?.expiresAt) {
          const expiresAt = new Date(state.paymentData.expiresAt);
          if (expiresAt < new Date()) {
            clearStoredState();
            return;
          }
        }
        
        // Restore state based on step
        if (state.step === 4 && state.finalData) {
          setStep(4);
          setSelectedPkg(state.selectedPkg);
          setFormData(state.formData);
          setFinalData(state.finalData);
          setDaysToAdd(state.daysToAdd);
        } else if (state.step === 3 && state.paymentData) {
          setStep(3);
          setSelectedPkg(state.selectedPkg);
          setFormData(state.formData);
          setPaymentData(state.paymentData);
          setDaysToAdd(state.daysToAdd);
          setStatusMsg("Menunggu pembayaran...");
        }
      } catch {
        clearStoredState();
      }
    }
  }, []);

  // Load ads, packages, and maintenance status
  useEffect(() => {
    const loadAds = async () => {
      const { data } = await supabase.from('ads').select('*').eq('is_active', true).order('sort_order');
      if (data) setAds(data as Ad[]);
    };

    const loadPackages = async () => {
      const { data } = await supabase.from('packages').select('*').eq('is_active', true).order('sort_order');
      if (data) setPackages(data as Package[]);
    };

    const checkMaintenance = async () => {
      try {
        const mState = await getMaintenanceState();
        setIsMaintenance(Boolean(mState.globalMaintenance));
      } catch {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
        if (data) setIsMaintenance(data.value === 'true');
      }
    };

    const handleMaintenanceChange = () => {
      checkMaintenance();
    };

    window.addEventListener('maintenance_state_changed', handleMaintenanceChange);
    window.addEventListener('storage', handleMaintenanceChange);

    const loadGateway = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key,value')
        .in('key', ['payment_gateway', 'developer_last_seen']);
      const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
      setGatewaySetting(map.payment_gateway || 'all');
      const last = parseInt(map.developer_last_seen || '0', 10);
      // ArexansPay (Payment 1) HANYA online ketika HP admin online aktif data.
      // Jika HP mati / data tidak aktif (> 3 menit tanpa heartbeat), status offline.
      const STALE_MS = 3 * 60 * 1000;
      setDeveloperOnline(Boolean(last) && (Date.now() - last < STALE_MS));
    };

    loadAds();
    loadPackages();
    checkMaintenance();
    loadGateway();
    const heartbeatPoll = setInterval(loadGateway, 15000);
    return () => {
      clearInterval(heartbeatPoll);
      window.removeEventListener('maintenance_state_changed', handleMaintenanceChange);
      window.removeEventListener('storage', handleMaintenanceChange);
    };
  }, []);

  const formatRupiah = (number: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  };

  const parseDuration = (input: string) => {
    if (!input) return null;
    const match = input.toLowerCase().match(/^(\d+)([hbt])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    const days = unit === 'h' ? value : unit === 'b' ? value * 30 : value * 365;
    const label = unit === 'h' ? `${value} Hari` : unit === 'b' ? `${value} Bulan` : `${value} Tahun`;
    return { days, text: label };
  };

  // Check payment status
  const checkPaymentStatus = useCallback(async (transactionId: string, days: number, slugOverride?: string) => {
    try {
      const response = await supabase.functions.invoke('check-payment', {
        body: { transactionId, slug: slugOverride || paymentData?.slug }
      });

      if (response.error) {
        console.error('Check payment error:', response.error);
        return;
      }

      const data = response.data;

      if (data.expired) {
        if (checkInterval.current) clearInterval(checkInterval.current);
        setErrorMsg("Transaksi telah expired. Silakan buat pesanan baru.");
        setStatusMsg('');
        clearStoredState();
        return;
      }

      if (data.paid) {
        if (checkInterval.current) clearInterval(checkInterval.current);
        
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() + days);
        
        const newFinalData = {
          key: formData.key,
          package: selectedPkg || 'NORMAL',
          expired: expiredDate.toISOString(),
          expiredDisplay: expiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          days: days,
          transactionId: transactionId,
          productId: paymentData?.productId,
        };
        
        setFinalData(newFinalData);
        setStep(4);
        saveState(4, null, newFinalData, days);
        setStatusMsg('');
        
        toast({ 
          title: "Pembayaran Berhasil!", 
          description: "Terima kasih atas pembelian Anda." 
        });
      }
    } catch (error) {
      console.error('Check payment error:', error);
    }
  }, [formData.key, selectedPkg]);

  // Start payment status polling + recheck on tab focus
  useEffect(() => {
    if (step === 3 && paymentData) {
      // Initial check
      checkPaymentStatus(paymentData.transactionId, daysToAdd);

      // Poll every 3 seconds
      checkInterval.current = window.setInterval(() => {
        checkPaymentStatus(paymentData.transactionId, daysToAdd);
      }, 3000);

      // Recheck immediately when tab regains focus (mobile throttles intervals in background)
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          checkPaymentStatus(paymentData.transactionId, daysToAdd);
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      return () => {
        if (checkInterval.current) {
          clearInterval(checkInterval.current);
          checkInterval.current = null;
        }
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    }

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
        checkInterval.current = null;
      }
    };
  }, [step, paymentData, daysToAdd, checkPaymentStatus]);

  const handlePackageSelect = async (pkg: 'NORMAL' | 'VIP' | 'LIFETIME') => {
    const mState = await getMaintenanceState();
    const isUnderMaintenance = (mState.globalMaintenance || mState.arexansToolsMaintenance) && !isDeveloperTesting();
    if (isUnderMaintenance) {
      toast({
        title: 'Arexans Tools Sedang Maintenance',
        description: 'Pembelian ditutup sementara untuk publik. Masa aktif key yang berjalan telah dibekukan sementara agar pembeli tidak dirugikan.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedPkg(pkg);
    setStep(2);
    setErrorMsg('');
  };

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'AXS-';
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormData(prev => ({ ...prev, key: result }));
  };




  const handleFormSubmit = async (
    e: React.FormEvent,
    submittedPromoCode?: string,
    discountedAmount?: number,
    chosenGateway?: 'arexanspay' | 'xmpayment' | 'poketo'
  ) => {
    e.preventDefault();
    setErrorMsg('');
    const isLifetime = selectedPkg === 'LIFETIME';
    const durationData = isLifetime ? { days: 999999, text: 'LIFETIME (Permanen)' } : parseDuration(formData.duration);

    if (!formData.key || formData.key.length < 4) {
      setErrorMsg(formData.key ? "Key minimal 4 karakter." : "Mohon isi key.");
      return;
    }
    if (!isLifetime && !durationData) {
      setErrorMsg("Format durasi salah! Gunakan: '1h' = 1 hari, '1b' = 1 bulan, '1t' = 1 tahun");
      return;
    }

    setLoading(true);
    let calculatedAmount: number;
    if (isLifetime) {
      // Use discounted or full lifetime price
      calculatedAmount = discountedAmount && discountedAmount > 0 ? discountedAmount : 700000;
    } else {
      const pricePerDay = selectedPkg === 'VIP' ? PRICES.VIP : PRICES.NORMAL;
      const fullAmount = pricePerDay * durationData!.days;
      calculatedAmount = discountedAmount && discountedAmount > 0 ? discountedAmount : fullAmount;
    }

    if (calculatedAmount < 1000) {
      setErrorMsg("Nominal pemesanan minimal Rp 1.000.");
      setLoading(false);
      return;
    }

    // If buyer directly picked a gateway in the form, use it!
    if (chosenGateway) {
      await createPayment(calculatedAmount, durationData!.days, submittedPromoCode, chosenGateway);
      return;
    }

    await createPayment(calculatedAmount, durationData!.days, submittedPromoCode);
  };

  const createPayment = async (
    amount: number,
    days: number,
    promoCode?: string,
    gatewayOverride?: 'arexanspay' | 'xmpayment' | 'pakasir' | 'poketo'
  ) => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('create-payment', {
        body: {
          amount,
          customerName: formData.key,
          packageName: selectedPkg || 'NORMAL',
          packageDuration: days,
          licenseKey: formData.key,
          promoCode: promoCode || undefined,
          deviceId,
          gateway: gatewayOverride,
        }
      });

      let data = response?.data;

      if (response?.error || !data || !data.success || !data.qr_string) {
        console.warn('Edge function returned non-2xx or empty data, generating direct dynamic QRIS:', response?.error);
        const fallbackTxId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 7).toUpperCase()}`;
        const fallbackQr = `00020101021226670014ID.LINKAJA.WWW01189360091438927000000215${fallbackTxId}51440014ID.CO.QRIS.WWW0215ID102002100000052045812530336054${amount}5802ID5912AREXANSTOOLS6007JAKARTA61051011062200116${fallbackTxId}6304`;
        
        data = {
          success: true,
          transactionId: fallbackTxId,
          qr_string: fallbackQr,
          qris_url: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fallbackQr)}`,
          payment_url: undefined,
          totalAmount: amount,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        };

        try {
          await supabase.from('transactions').insert({
            id: fallbackTxId,
            transaction_id: fallbackTxId,
            customer_name: formData.key,
            package_name: selectedPkg || 'NORMAL',
            package_duration: days,
            original_amount: amount,
            total_amount: amount,
            status: 'pending',
            qr_string: fallbackQr,
            license_key: formData.key,
            device_id: deviceId || null,
          });
        } catch {}
      }

      const newPaymentData: PaymentData = {
        transactionId: data.transactionId,
        qr_string: data.qr_string,
        qris_url: data.qris_url,
        payment_url: data.payment_url,
        totalAmount: data.totalAmount,
        originalAmount: data.originalAmount || amount,
        gateway: data.gateway,
        isPoketo: data.isPoketo,
        slug: data.slug,
        vaBanks: data.vaBanks,
        quotes: data.quotes,
        expiresAt: data.expiresAt
      };

      setPaymentData(newPaymentData);
      setDaysToAdd(days);
      setStep(3);
      saveState(3, newPaymentData, null, days);
      setStatusMsg("Menunggu pembayaran...");
    } catch (error) {
      console.error('Form submit error:', error);
      setErrorMsg("Terjadi kesalahan. Silakan coba lagi.");
    }
    setLoading(false);
  };

  const handleCancelOrder = async () => {
    if (checkInterval.current) clearInterval(checkInterval.current);
    
    // Cancel payment in backend
    if (paymentData?.transactionId) {
      try {
        await supabase.functions.invoke('cancel-payment', {
          body: { transactionId: paymentData.transactionId }
        });
      } catch (error) {
        console.error('Cancel payment error:', error);
      }
    }
    
    clearStoredState();
    setPaymentData(null);
    setStep(1);
    setStatusMsg('');
    setErrorMsg('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Berhasil disalin!", description: "Teks telah disalin ke clipboard" });
  };

  if (isMaintenance && !isDeveloperTesting()) return <MaintenancePage />;
  if (step === 1) return (
    <PackageSelection
      onSelect={handlePackageSelect}
      formatRupiah={formatRupiah}
      prices={PRICES}
      ads={ads}
      packages={packages}
      defaultTab={tabParam === 'toko' ? 'toko' : 'tools'}
      onTokoScriptOrderQris={handleTokoScriptQris}
    />
  );
  if (step === 2) return (
    <>
      <OrderForm
        selectedPkg={selectedPkg}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleFormSubmit}
        onBack={() => { setStep(1); setErrorMsg(''); }}
        onGenerate={generateRandomKey}
        loading={loading}
        errorMsg={errorMsg}
        formatRupiah={formatRupiah}
        parseDuration={parseDuration}
        prices={PRICES}
        developerOnline={developerOnline}
      />
      {pendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card p-6 rounded-2xl max-w-sm w-full space-y-4">
            <h3 className="text-lg font-display font-bold text-foreground text-center">Pilih Metode Pembayaran</h3>
            <p className="text-sm text-muted-foreground text-center">Total: <span className="text-primary font-bold">{formatRupiah(pendingPayment.amount)}</span></p>
            <div className="grid gap-3">
              <button
                onClick={async () => { const p = pendingPayment; setPendingPayment(null); await createPayment(p.amount, p.days, p.promoCode, 'poketo'); }}
                className="w-full p-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-left transition shadow-md shadow-emerald-500/10"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Poketo (Otomatis)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                    QRIS • E-Wallet • VA
                  </span>
                </div>
                <p className="text-xs opacity-80 mt-1">Pembayaran otomatis & instan realtime</p>
              </button>

              <button
                disabled={!developerOnline}
                onClick={async () => { const p = pendingPayment; setPendingPayment(null); await createPayment(p.amount, p.days, p.promoCode, 'arexanspay'); }}
                className={`w-full p-3 rounded-xl border text-left transition ${developerOnline ? 'bg-primary/20 hover:bg-primary/30 border-primary/50 text-primary' : 'bg-muted/20 border-border text-muted-foreground cursor-not-allowed opacity-60'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Qris 1 (ArexansPay)</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${developerOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'}`}>
                    {developerOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs opacity-80 mt-1">Tidak ada pajak</p>
              </button>

              <button
                onClick={async () => { const p = pendingPayment; setPendingPayment(null); await createPayment(p.amount, p.days, p.promoCode, 'xmpayment'); }}
                className="w-full p-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 border border-secondary/50 text-secondary text-left transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Qris 2 (XMPayment)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">Online</span>
                </div>
                <p className="text-xs opacity-80 mt-1">Otomatis & Kode Unik Realtime</p>
              </button>
              <button
                onClick={() => setPendingPayment(null)}
                className="w-full py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted/40 text-sm"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  if (step === 3 && paymentData && selectedPkg) {
    return <PaymentQR packageName={selectedPkg} paymentData={paymentData} statusMsg={statusMsg} errorMsg={errorMsg} onCancel={handleCancelOrder} onCopy={copyToClipboard} onRecheck={() => checkPaymentStatus(paymentData.transactionId, daysToAdd)} formatRupiah={formatRupiah} />;
  }
  if (step === 4 && finalData) {
    return <PaymentSuccess finalData={finalData} onCopy={copyToClipboard} />;
  }

  return (
    <PackageSelection
      onSelect={handlePackageSelect}
      formatRupiah={formatRupiah}
      prices={PRICES}
      ads={ads}
      packages={packages}
      defaultTab={tabParam === 'toko' ? 'toko' : 'tools'}
      onTokoScriptOrderQris={handleTokoScriptQris}
    />
  );
};

export default Index;
