import { FC, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Copy, MessageCircle, AlertCircle, RefreshCw,
  QrCode, Building2, CreditCard, Zap, CheckCircle2, Download,
  ExternalLink, ShieldCheck, ChevronDown, ChevronUp, Loader2,
  Lock, Check, ArrowRight
} from 'lucide-react';
import GlobalBackground from './GlobalBackground';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  BankLogo,
  VisaLogo,
  MastercardLogo,
  JcbLogo,
  AkulakuLogo,
  QrisLogo,
  EWalletBadges
} from './PaymentLogos';

interface SocialLink {
  id: string;
  name: string;
  icon_type: string;
  url: string;
  label: string;
  is_active: boolean;
}

interface PaymentQRProps {
  packageName: 'NORMAL' | 'VIP' | 'LIFETIME' | string;
  paymentData: {
    transactionId: string;
    qr_string: string;
    qris_url: string;
    payment_url?: string;
    totalAmount: number;
    originalAmount?: number;
    gateway?: string;
    isPoketo?: boolean;
    slug?: string;
    selectedChannel?: string;
    selectedBank?: string;
    vaBanks?: Array<{ code: string; name: string }>;
    quotes?: any;
    vaData?: any;
    akulakuData?: any;
    cardData?: any;
    expiresAt: string;
    productId?: string;
  };
  statusMsg: string;
  errorMsg: string;
  onCancel: () => void;
  onCopy: (text: string) => void;
  onRecheck?: () => void;
  formatRupiah: (n: number) => string;
}

type PaymentTab = 'qris' | 'va' | 'paylater' | 'card';

interface VaPaymentInfo {
  bank: string;
  bankName: string;
  vaNumber: string;
  amount: number;
  instructions?: {
    id?: Array<{ channel: string; steps: string[] }>;
    en?: Array<{ channel: string; steps: string[] }>;
  };
}

interface AkulakuPaymentInfo {
  checkoutUrl: string;
  amount: number;
  feeGateway?: number;
  invoiceNumber?: string;
}

interface CardPaymentInfo {
  paymentUrl: string;
  amount: number;
  feeGateway?: number;
  invoiceNumber?: string;
}

const DEFAULT_VA_BANKS = [
  { code: 'BRI', name: 'Bank BRI' },
  { code: 'BNI', name: 'Bank BNI' },
  { code: 'PERMATA', name: 'Bank Permata' },
  { code: 'CIMB', name: 'CIMB Niaga' },
  { code: 'DANAMON', name: 'Bank Danamon' },
  { code: 'BTN', name: 'Bank BTN' },
  { code: 'MAYBANK', name: 'Maybank' },
  { code: 'BJB', name: 'bank bjb' },
  { code: 'SINARMAS', name: 'Bank Sinarmas' },
  { code: 'BNC', name: 'Bank Neo Commerce' },
];

const PaymentQR: FC<PaymentQRProps> = ({
  packageName,
  paymentData,
  statusMsg,
  errorMsg,
  onCancel,
  onCopy,
  onRecheck,
  formatRupiah
}) => {
  const isPoketo = paymentData.gateway === 'poketo' || (Boolean(paymentData.isPoketo) && paymentData.gateway !== 'arexanspay' && paymentData.gateway !== 'xmpayment');
  const rawSlug = paymentData.slug || (paymentData.payment_url ? paymentData.payment_url.split('/inv/')[1] : '');
  const slug = rawSlug ? (rawSlug.includes('/inv/') ? rawSlug.split('/inv/')[1].split(/[?#]/)[0] : rawSlug.split(/[?#]/)[0]) : '';

  const resolveInitialTab = (): PaymentTab => {
    const ch = (paymentData.selectedChannel || '').toUpperCase();
    if (ch === 'VA') return 'va';
    if (ch === 'AKULAKU') return 'paylater';
    if (ch === 'CARD') return 'card';
    return 'qris';
  };

  const [activeTab, setActiveTab] = useState<PaymentTab>(resolveInitialTab());
  const [showContactHint, setShowContactHint] = useState(false);
  const [contactLink, setContactLink] = useState<SocialLink | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');
  const [copiedQris, setCopiedQris] = useState(false);
  const [copiedVa, setCopiedVa] = useState(false);
  const [copiedPaylaterUrl, setCopiedPaylaterUrl] = useState(false);

  // VA State
  const [selectedBank, setSelectedBank] = useState<string>(paymentData.selectedBank || 'BRI');
  const [vaLoading, setVaLoading] = useState(false);
  const [vaData, setVaData] = useState<VaPaymentInfo | null>(paymentData.vaData || null);
  const [activeInstructionChannel, setActiveInstructionChannel] = useState<string>('');
  const [expandedInstructions, setExpandedInstructions] = useState(false);

  // PayLater (Akulaku) State
  const [akulakuLoading, setAkulakuLoading] = useState(false);
  const [akulakuData, setAkulakuData] = useState<AkulakuPaymentInfo | null>(paymentData.akulakuData || null);
  const [akulakuPayer, setAkulakuPayer] = useState({
    name: paymentData.transactionId.startsWith('AXS-') ? paymentData.transactionId : 'Pembeli Arexans',
    phone: '08123456789',
    address: 'Jl. Merdeka No. 1',
    city: 'Jakarta Selatan',
    state: 'DKI Jakarta',
    postcode: '12190',
  });

  // Card State
  const [cardLoading, setCardLoading] = useState(false);
  const [cardData, setCardData] = useState<CardPaymentInfo | null>(paymentData.cardData || null);

  useEffect(() => {
    if (vaData?.instructions?.id?.length) {
      setActiveInstructionChannel(vaData.instructions.id[0].channel);
    }
  }, [vaData]);

  // Calculate current active amount
  const getTabAmount = () => {
    if (activeTab === 'va' && vaData) return vaData.amount;
    if (activeTab === 'va' && paymentData.quotes?.VA?.totalAmount) return paymentData.quotes.VA.totalAmount;
    if (activeTab === 'paylater' && akulakuData) return akulakuData.amount;
    if (activeTab === 'paylater' && paymentData.quotes?.AKULAKU?.totalAmount) return paymentData.quotes.AKULAKU.totalAmount;
    if (activeTab === 'card' && cardData) return cardData.amount;
    if (activeTab === 'card' && paymentData.quotes?.CARD?.totalAmount) return paymentData.quotes.CARD.totalAmount;
    if (activeTab === 'qris' && paymentData.quotes?.QRIS?.totalAmount) return paymentData.quotes.QRIS.totalAmount;
    return paymentData.totalAmount;
  };

  // 1. Fetch VA Handler
  const handleSelectBank = async (bankCode: string) => {
    setSelectedBank(bankCode);
    if (!slug) return;

    setVaLoading(true);
    try {
      const res = await supabase.functions.invoke('poketo-pay', {
        body: { slug, channel: 'VA', bank: bankCode, transactionId: paymentData.transactionId }
      });

      if (res?.data?.success && res.data.payment) {
        setVaData(res.data.payment);
        const steps = res.data.payment.instructions?.id;
        if (steps && steps.length > 0) {
          setActiveInstructionChannel(steps[0].channel);
        }
      } else {
        toast({
          title: 'Gagal Memuat VA',
          description: res?.data?.error || 'Silakan pilih bank lain.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.warn('Load VA error:', e);
    } finally {
      setVaLoading(false);
    }
  };

  // Auto-fetch VA on switching to VA tab if not loaded yet
  useEffect(() => {
    if (activeTab === 'va' && !vaData && isPoketo && slug) {
      handleSelectBank(selectedBank || 'BRI');
    }
  }, [activeTab, isPoketo, slug]);

  // 2. Fetch PayLater Akulaku Handler
  const handleInitAkulaku = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!slug) return;

    // Validate 5 digit postal code
    const rawPostcode = akulakuPayer.postcode.replace(/\D/g, '');
    const cleanPostcode = rawPostcode.length === 5 ? rawPostcode : '12190';

    setAkulakuLoading(true);
    try {
      const res = await supabase.functions.invoke('poketo-pay', {
        body: {
          slug,
          channel: 'AKULAKU',
          payer: {
            ...akulakuPayer,
            postcode: cleanPostcode,
          }
        }
      });

      if (res?.data?.success && res.data.payment) {
        setAkulakuData(res.data.payment);
        toast({
          title: 'Pembayaran Akulaku Siap',
          description: 'Silakan klik tombol bayar untuk menyelesaikan cicilan di Akulaku.',
        });
      } else {
        toast({
          title: 'Gagal Menyiapkan Akulaku',
          description: res?.data?.error || 'Pastikan data nama, no HP, dan alamat sudah terisi.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error Akulaku',
        description: err.message || 'Terjadi kesalahan sistem.',
        variant: 'destructive',
      });
    } finally {
      setAkulakuLoading(false);
    }
  };

  // 3. Fetch Card Handler
  const handleInitCard = async () => {
    if (!slug) return;

    setCardLoading(true);
    try {
      const res = await supabase.functions.invoke('poketo-pay', {
        body: { slug, channel: 'CARD' }
      });

      if (res?.data?.success && res.data.payment) {
        setCardData(res.data.payment);
        toast({
          title: 'Halaman Kartu Siap',
          description: 'Halaman 3D Secure bank siap dibuka untuk otorisasi.',
        });
      } else {
        toast({
          title: 'Gagal Memproses Kartu',
          description: res?.data?.error || 'Gagal menyiapkan halaman pembayaran kartu.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error Kartu',
        description: err.message || 'Terjadi kesalahan sistem.',
        variant: 'destructive',
      });
    } finally {
      setCardLoading(false);
    }
  };

  // Auto-init card if user opens card tab and not loaded yet
  useEffect(() => {
    if (activeTab === 'card' && !cardData && isPoketo) {
      handleInitCard();
    }
  }, [activeTab, isPoketo]);

  // 4. Realtime status poll for Poketo (detect payment across ANY method)
  const isPaidRef = useRef(false);
  useEffect(() => {
    if (!isPoketo || !slug) return;

    const pollStatus = async () => {
      if (isPaidRef.current) return;
      try {
        const res = await supabase.functions.invoke('poketo-pay', {
          body: { slug, channel: 'STATUS', transactionId: paymentData.transactionId }
        });
        if (res?.data?.paid || res?.data?.status === 'PAID') {
          isPaidRef.current = true;
          if (onRecheck) onRecheck();
        }
      } catch (e) {
        // quiet poll
      }
    };

    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [isPoketo, slug, paymentData.transactionId, onRecheck]);

  const handleRecheck = async () => {
    if (!onRecheck || rechecking) return;
    setRechecking(true);
    setRecheckMsg('');
    try {
      await onRecheck();
      setRecheckMsg('Status dicek realtime. Jika Anda telah membayar, halaman otomatis selesai.');
    } finally {
      setTimeout(() => setRechecking(false), 1500);
      setTimeout(() => setRecheckMsg(''), 5000);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContactHint(true);
    }, 30000);

    const fetchContactLink = async () => {
      const { data } = await supabase
        .from('social_links')
        .select('*')
        .eq('is_active', true)
        .or('icon_type.eq.whatsapp-contact,icon_type.eq.whatsapp')
        .order('sort_order')
        .limit(1);

      if (data && data.length > 0) {
        setContactLink(data[0] as SocialLink);
      }
    };

    fetchContactLink();
    return () => clearTimeout(timer);
  }, []);

  const qrUrl = paymentData.qris_url ||
    `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(paymentData.qr_string)}`;

  const roleCardClass = packageName === 'LIFETIME' ? 'role-card-admin' : packageName === 'VIP' ? 'role-card-vip' : 'role-card-normal';
  const roleTextClass = packageName === 'LIFETIME' ? 'text-cyan-glow' : packageName === 'VIP' ? 'text-vip' : 'text-success';
  const roleTintClass = packageName === 'LIFETIME'
    ? 'bg-cyan-glow/10 border-cyan-glow/30'
    : packageName === 'VIP'
      ? 'bg-purple-glow/10 border-purple-glow/30'
      : 'bg-success/10 border-success/30';
  const roleGlowClass = packageName === 'VIP' ? 'glow-purple' : 'glow-cyan';

  const copyQrisString = () => {
    if (paymentData.qr_string) {
      navigator.clipboard.writeText(paymentData.qr_string);
      setCopiedQris(true);
      toast({ title: 'Tersalin!', description: 'String QRIS berhasil disalin ke clipboard.' });
      setTimeout(() => setCopiedQris(false), 2500);
    }
  };

  const copyVaNumber = (va: string) => {
    navigator.clipboard.writeText(va);
    setCopiedVa(true);
    toast({ title: 'Nomor VA Disalin!', description: `${va} siap digunakan di aplikasi m-banking atau ATM.` });
    setTimeout(() => setCopiedVa(false), 2500);
  };

  const copyPaylaterUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedPaylaterUrl(true);
    toast({ title: 'Tautan Pembayaran Disalin!', description: 'Buka di browser Anda untuk menyelesaikan cicilan.' });
    setTimeout(() => setCopiedPaylaterUrl(false), 2500);
  };

  const downloadQrCode = () => {
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `QRIS-${paymentData.transactionId}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentVaInstructions = vaData?.instructions?.id || [];
  const currentInstructionStep = currentVaInstructions.find(i => i.channel === activeInstructionChannel) || currentVaInstructions[0];

  const officialPoketoUrl = paymentData.payment_url || (slug ? `https://pay.poketo.id/inv/${slug}` : undefined);

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-5 lg:p-8 bg-background relative overflow-hidden">
      <GlobalBackground />

      <div className={`${roleCardClass} p-5 sm:p-7 lg:p-9 max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl w-full z-10 relative my-6 rounded-2xl shadow-2xl border border-white/10`}>
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${roleTintClass} ${roleTextClass}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {packageName === 'LIFETIME' ? 'ADMIN · LIFETIME' : `Paket ${packageName}`}
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {paymentData.transactionId}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">
              {activeTab === 'va' 
                ? 'Pembayaran Virtual Account Bank' 
                : activeTab === 'paylater' 
                ? 'Pembayaran PayLater Akulaku' 
                : activeTab === 'card' 
                ? 'Pembayaran Kartu Kredit / Debit' 
                : 'Scan QRIS untuk Membayar'}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {isPoketo 
                ? 'Virtual Account 10 Bank, QRIS Instan, Cicilan Akulaku & Kartu Debit/Kredit'
                : 'Verifikasi instan realtime · Scan via semua e-wallet & mobile banking'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Auto-Polling Aktif
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/50 text-destructive p-3.5 rounded-xl mb-4 text-xs sm:text-sm">
            {errorMsg}
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* LEFT COLUMN: TOTAL TAGIHAN, STATUS & DETAIL */}
          <div className="lg:col-span-5 space-y-4 mb-6 lg:mb-0">
            {/* Amount Box */}
            <div className={`p-4 rounded-xl border ${roleTintClass} bg-card/60`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Total Tagihan Pembayaran</span>
                {isPoketo && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">
                    {activeTab === 'qris' ? 'QRIS' : activeTab === 'va' ? 'VA Bank' : activeTab === 'paylater' ? 'Akulaku' : 'Kartu 3DS'}
                  </span>
                )}
              </div>
              <p className={`text-2xl sm:text-3xl font-display font-bold ${roleTextClass}`}>
                {formatRupiah(getTabAmount())}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Verifikasi Otomatis Realtime · Tanpa Kirim Bukti</span>
              </div>
            </div>

            {/* Live Status indicator */}
            {statusMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-xl bg-card/60 border border-border/60 text-xs sm:text-sm ${roleTextClass}`}>
                <div className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${packageName === 'LIFETIME' ? 'bg-cyan-glow' : packageName === 'VIP' ? 'bg-purple-glow' : 'bg-success'}`} />
                <span className="font-semibold">{statusMsg}</span>
              </div>
            )}

            {/* Manual recheck button */}
            {onRecheck && (
              <div>
                <Button
                  type="button"
                  onClick={handleRecheck}
                  disabled={rechecking}
                  className={`w-full ${roleTintClass} ${roleTextClass}`}
                  variant="outline"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-2 ${rechecking ? 'animate-spin' : ''}`} />
                  {rechecking ? 'Mengecek pembayaran...' : 'Saya Sudah Bayar, Cek Sekarang'}
                </Button>
                {recheckMsg && (
                  <p className="text-xs text-success mt-1.5">{recheckMsg}</p>
                )}
              </div>
            )}

            {/* Contact Admin Hint */}
            {showContactHint && contactLink && (
              <div className="bg-primary/10 border border-primary/30 p-3 rounded-xl text-left">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="text-foreground font-semibold">Sudah transfer tapi belum terverifikasi?</p>
                    <p className="text-muted-foreground mt-0.5 mb-2">Hubungi admin dengan membawa nomor transaksi ini.</p>
                    <a
                      href={contactLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-success/20 hover:bg-success/30 text-success px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Hubungi WhatsApp Admin
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Petunjuk Singkat */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 text-[11px] space-y-1.5 hidden lg:block text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Panduan Pembayaran:
              </div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Selesaikan pembayaran sesuai nominal yang tertera.</li>
                <li>Setelah berhasil, sistem langsung mengaktifkan lisensi Anda.</li>
                <li>Halaman ini akan otomatis beralih ke rincian Key Anda.</li>
              </ul>
            </div>

            {/* Transaction Info Footer */}
            <div className="bg-muted/30 p-2.5 rounded-lg flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">ID Transaksi:</span>
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-foreground font-medium text-[11px]">{paymentData.transactionId}</code>
                <button
                  onClick={() => onCopy(paymentData.transactionId)}
                  className="p-1 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-all"
                  title="Salin ID"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              Batalkan Transaksi
            </Button>
          </div>

          {/* RIGHT COLUMN: METODE PEMBAYARAN & DISPLAY */}
          <div className="lg:col-span-7 space-y-4 text-center">

        {/* Multi-Method Tabs ONLY for Poketo (>= Rp 10.000) */}
        {isPoketo ? (
          <div className="space-y-3 mb-5">
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-muted/60 border border-white/5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('qris')}
                className={`py-2 px-1 rounded-lg font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                  activeTab === 'qris' 
                    ? 'bg-background text-primary shadow-sm border border-primary/20' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>QRIS</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('va')}
                className={`py-2 px-1 rounded-lg font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                  activeTab === 'va' 
                    ? 'bg-background text-primary shadow-sm border border-primary/20' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>VA Bank</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paylater')}
                className={`py-2 px-1 rounded-lg font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                  activeTab === 'paylater' 
                    ? 'bg-background text-primary shadow-sm border border-primary/20' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>PayLater</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('card')}
                className={`py-2 px-1 rounded-lg font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                  activeTab === 'card' 
                    ? 'bg-background text-primary shadow-sm border border-primary/20' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Kartu</span>
              </button>
            </div>

            {/* Link Button */}
            {officialPoketoUrl && (
              <a
                href={officialPoketoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka Portal Pembayaran Mandiri di Tab Baru</span>
              </a>
            )}
          </div>
        ) : null}

        {/* ========================================================= */}
        {/* TAB 1: QRIS INSTAN                                        */}
        {/* ========================================================= */}
        {activeTab === 'qris' && (
          <div className="space-y-4 animate-fade-in">
            {/* QR Code container */}
            <div className={`bg-white p-3.5 rounded-2xl inline-block shadow-xl ${roleGlowClass} border-4 border-white/10`}>
              <img
                src={qrUrl}
                alt="QRIS Code"
                className="w-56 h-56 sm:w-60 sm:h-60 rounded-lg mx-auto object-contain"
                crossOrigin="anonymous"
              />
            </div>

            {/* Supported e-wallets badges */}
            <div className="flex flex-col items-center justify-center gap-2">
              <EWalletBadges />
              <div className="flex flex-wrap items-center justify-center gap-1">
                <BankLogo bank="BCA" size="xs" />
                <BankLogo bank="MANDIRI" size="xs" />
                <BankLogo bank="BRI" size="xs" />
                <BankLogo bank="BNI" size="xs" />
                <span className="text-[10px] text-muted-foreground ml-1">&amp; semua m-Banking</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Buka aplikasi mobile banking atau e-wallet Anda, pilih menu Scan / QRIS, lalu scan kode QR di atas.
            </p>

            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadQrCode}
                className="text-xs gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Simpan QR
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyQrisString}
                className="text-xs gap-1.5"
              >
                {copiedQris ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedQris ? 'Tersalin!' : 'Salin Kode QRIS'}
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: VIRTUAL ACCOUNT REALTIME (In-App Poketo)           */}
        {/* ========================================================= */}
        {activeTab === 'va' && isPoketo && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div>
              <Label className="text-xs font-semibold text-foreground mb-2 block">
                Pilih Bank Virtual Account:
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(paymentData.vaBanks && paymentData.vaBanks.length > 0 ? paymentData.vaBanks : DEFAULT_VA_BANKS).map(b => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => handleSelectBank(b.code)}
                    className={`p-2 rounded-lg text-xs font-semibold border transition-all text-left flex items-center justify-between gap-1.5 ${
                      selectedBank === b.code
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500 shadow-sm'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BankLogo bank={b.code} size="xs" />
                      <span className="truncate text-[11px] font-semibold">{b.name}</span>
                    </div>
                    {selectedBank === b.code && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* VA Number Card */}
            {vaLoading ? (
              <div className="py-8 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>Membuat Nomor Virtual Account {selectedBank}...</span>
              </div>
            ) : vaData ? (
              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/30">
                  <div className="flex items-center justify-between text-xs mb-2 pb-2 border-b border-white/5">
                    <BankLogo bank={vaData.bank} size="md" showName={true} />
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full">
                      VA Aktif Realtime
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <code className="text-lg sm:text-xl font-mono font-bold tracking-wider text-foreground select-all break-all">
                      {vaData.vaNumber}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => copyVaNumber(vaData.vaNumber)}
                      className="shrink-0 gap-1.5 bg-primary text-primary-foreground font-semibold"
                    >
                      {copiedVa ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedVa ? 'Disalin' : 'Salin'}</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Total transfer harus persis: <strong className="text-foreground font-bold">{formatRupiah(vaData.amount)}</strong>
                  </p>
                </div>

                {/* Instructions Section */}
                {currentVaInstructions.length > 0 && (
                  <div className="border border-border/60 rounded-xl p-3 bg-muted/20">
                    <button
                      type="button"
                      onClick={() => setExpandedInstructions(!expandedInstructions)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-foreground"
                    >
                      <span>Cara Pembayaran {vaData.bankName}</span>
                      {expandedInstructions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {expandedInstructions && (
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
                        <div className="flex gap-1 overflow-x-auto pb-1 text-[11px]">
                          {currentVaInstructions.map(c => (
                            <button
                              key={c.channel}
                              type="button"
                              onClick={() => setActiveInstructionChannel(c.channel)}
                              className={`px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition-all ${
                                (activeInstructionChannel || currentVaInstructions[0].channel) === c.channel
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {c.channel}
                            </button>
                          ))}
                        </div>

                        {currentInstructionStep && (
                          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                            {currentInstructionStep.steps.map((st, i) => (
                              <li key={i} className="pl-1 text-foreground/90">{st}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: PAYLATER (AKULAKU REALTIME)                        */}
        {/* ========================================================= */}
        {activeTab === 'paylater' && isPoketo && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                <AkulakuLogo size="sm" />
                <span>Akulaku PayLater & Cicilan Instan</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                Realtime
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Beli sekarang bayar nanti dengan Akulaku PayLater. Nikmati tenor 30 hari hingga cicilan 12 bulan.
            </p>

            {/* Generated Akulaku Checkout Box */}
            {akulakuData ? (
              <div className="space-y-3 p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Tagihan Akulaku Siap</span>
                  <span className="font-mono text-amber-400 font-bold">{formatRupiah(akulakuData.amount)}</span>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Klik tombol di bawah untuk melanjutkan otorisasi pembayaran di portal resmi Akulaku:
                </p>

                <div className="space-y-2 pt-1">
                  <a
                    href={akulakuData.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition-all"
                  >
                    <span>Buka Akulaku (Bayar Sekarang)</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyPaylaterUrl(akulakuData.checkoutUrl)}
                    className="w-full text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    {copiedPaylaterUrl ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPaylaterUrl ? 'Tautan Disalin!' : 'Salin Tautan Pembayaran'}</span>
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Menunggu pembayaran di Akulaku... Halaman otomatis selesai.</span>
                </div>

                <button
                  type="button"
                  onClick={() => setAkulakuData(null)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline block text-center w-full pt-1"
                >
                  Ubah data pemesan
                </button>
              </div>
            ) : (
              /* Payer Information Form Required by Akulaku/Poketo */
              <form onSubmit={handleInitAkulaku} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Nama Lengkap:</Label>
                    <Input
                      type="text"
                      required
                      value={akulakuPayer.name}
                      onChange={e => setAkulakuPayer({ ...akulakuPayer, name: e.target.value })}
                      placeholder="Nama Lengkap"
                      className="h-8 text-xs bg-muted/40 border-border/60"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">No HP / WhatsApp:</Label>
                    <Input
                      type="tel"
                      required
                      value={akulakuPayer.phone}
                      onChange={e => setAkulakuPayer({ ...akulakuPayer, phone: e.target.value })}
                      placeholder="08xxxxxxxxxx"
                      className="h-8 text-xs bg-muted/40 border-border/60"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Alamat Lengkap:</Label>
                  <Input
                    type="text"
                    required
                    value={akulakuPayer.address}
                    onChange={e => setAkulakuPayer({ ...akulakuPayer, address: e.target.value })}
                    placeholder="Jl. Contoh No. 12"
                    className="h-8 text-xs bg-muted/40 border-border/60"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Kota:</Label>
                    <Input
                      type="text"
                      required
                      value={akulakuPayer.city}
                      onChange={e => setAkulakuPayer({ ...akulakuPayer, city: e.target.value })}
                      placeholder="Jakarta"
                      className="h-8 text-xs bg-muted/40 border-border/60"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Provinsi:</Label>
                    <Input
                      type="text"
                      required
                      value={akulakuPayer.state}
                      onChange={e => setAkulakuPayer({ ...akulakuPayer, state: e.target.value })}
                      placeholder="DKI Jakarta"
                      className="h-8 text-xs bg-muted/40 border-border/60"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Kode Pos (5 digit):</Label>
                    <Input
                      type="text"
                      maxLength={5}
                      required
                      value={akulakuPayer.postcode}
                      onChange={e => setAkulakuPayer({ ...akulakuPayer, postcode: e.target.value.replace(/\D/g, '') })}
                      placeholder="12190"
                      className="h-8 text-xs font-mono bg-muted/40 border-border/60"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={akulakuLoading}
                  className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs gap-1.5 shadow-md shadow-amber-500/20"
                >
                  {akulakuLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  <span>{akulakuLoading ? 'Menghubungkan Akulaku...' : 'Lanjut Bayar dengan Akulaku'}</span>
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: KARTU DEBIT / KREDIT (VISA, MASTERCARD, JCB)       */}
        {/* ========================================================= */}
        {activeTab === 'card' && isPoketo && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                <CreditCard className="w-4 h-4 text-blue-400" />
                <span>Kartu Debit & Kredit</span>
              </div>
              <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Lock className="w-3 h-3" />
                3D Secure
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Mendukung kartu debit dan kredit dengan logo <strong>Visa, Mastercard, JCB, atau GPN</strong>. Terproteksi OTP resmi dari bank penerbit.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <VisaLogo size="md" />
              <MastercardLogo size="md" />
              <JcbLogo size="md" />
              <span className="px-2 py-0.5 rounded bg-muted/80 font-bold text-[10px] text-muted-foreground select-none">GPN</span>
            </div>

            {/* Generated Card Payment URL Box */}
            {cardData ? (
              <div className="space-y-3 p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Halaman 3D Secure Bank Siap</span>
                  <span className="font-mono text-blue-400 font-bold">{formatRupiah(cardData.amount)}</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Klik tombol di bawah untuk memasukkan nomor kartu & verifikasi kode OTP bank secara aman:
                </p>

                <div className="space-y-2 pt-1">
                  <a
                    href={cardData.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/20 transition-all"
                  >
                    <span>Buka Pembayaran Kartu (3D Secure)</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span>Menunggu otorisasi OTP bank... Halaman ini otomatis mendeteksi saat selesai.</span>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleInitCard}
                  disabled={cardLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-blue-500/20"
                >
                  {cardLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{cardLoading ? 'Menyiapkan Pembayaran Kartu...' : 'Lanjut ke Pembayaran Kartu 3D Secure'}</span>
                </Button>
              </div>
            )}
          </div>
        )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentQR;
