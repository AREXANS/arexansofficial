import { FC, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Copy, MessageCircle, AlertCircle, RefreshCw,
  QrCode, Building2, CreditCard, Zap, CheckCircle2, Download, Smartphone, ShieldCheck, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import GlobalBackground from './GlobalBackground';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SocialLink {
  id: string;
  name: string;
  icon_type: string;
  url: string;
  label: string;
  is_active: boolean;
}

interface PaymentQRProps {
  packageName: 'NORMAL' | 'VIP' | 'LIFETIME';
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
    vaBanks?: Array<{ code: string; name: string }>;
    quotes?: any;
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
  const isPoketo = paymentData.isPoketo ?? (paymentData.gateway === 'poketo' || paymentData.totalAmount >= 10000);
  const [activeTab, setActiveTab] = useState<PaymentTab>('qris');
  const [showContactHint, setShowContactHint] = useState(false);
  const [contactLink, setContactLink] = useState<SocialLink | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');
  const [copiedQris, setCopiedQris] = useState(false);
  const [copiedVa, setCopiedVa] = useState(false);

  // VA State
  const [selectedBank, setSelectedBank] = useState<string>('BRI');
  const [vaLoading, setVaLoading] = useState(false);
  const [vaData, setVaData] = useState<VaPaymentInfo | null>(null);
  const [activeInstructionChannel, setActiveInstructionChannel] = useState<string>('');
  const [expandedInstructions, setExpandedInstructions] = useState(false);

  // Fetch VA when user switches to VA tab or changes bank
  const handleSelectBank = async (bankCode: string) => {
    setSelectedBank(bankCode);
    const slug = paymentData.slug || (paymentData.payment_url ? paymentData.payment_url.split('/inv/')[1] : '');
    if (!slug) return;

    setVaLoading(true);
    try {
      const res = await supabase.functions.invoke('poketo-va', {
        body: { slug, bank: bankCode }
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

  useEffect(() => {
    if (activeTab === 'va' && !vaData && isPoketo) {
      handleSelectBank('BRI');
    }
  }, [activeTab, isPoketo]);

  const handleRecheck = async () => {
    if (!onRecheck || rechecking) return;
    setRechecking(true);
    setRecheckMsg('');
    try {
      await onRecheck();
      setRecheckMsg('Status diperbarui. Jika pembayaran berhasil, halaman akan otomatis lanjut.');
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
    toast({ title: 'Nomor VA Disalin!', description: `${va} siap digunakan di aplikasi m-banking/ATM.` });
    setTimeout(() => setCopiedVa(false), 2500);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 bg-background relative overflow-hidden">
      <GlobalBackground />

      <div className={`${roleCardClass} p-5 sm:p-7 max-w-lg w-full text-center z-10 relative my-6 rounded-2xl shadow-2xl border border-white/10`}>
        {/* Header Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${roleTintClass} ${roleTextClass}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {packageName === 'LIFETIME' ? 'ADMIN · LIFETIME' : `Paket ${packageName}`}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {paymentData.transactionId}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">
          {isPoketo ? 'Pembayaran Realtime Poketo' : 'Scan QRIS untuk Membayar'}
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 mb-4">
          {isPoketo 
            ? 'Pilih metode pembayaran langsung di bawah ini tanpa berpindah halaman'
            : 'Gateway ArexansPay & XMPayment · Scan instan semua e-wallet & mobile banking'}
        </p>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/50 text-destructive p-3.5 rounded-xl mb-4 text-xs sm:text-sm">
            {errorMsg}
          </div>
        )}

        {/* Amount Box */}
        <div className={`p-4 rounded-xl mb-5 border ${roleTintClass} bg-card/60`}>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1 font-medium">Total Tagihan Pembayaran</p>
          <p className={`text-2xl sm:text-3xl font-display font-bold ${roleTextClass}`}>
            {formatRupiah(activeTab === 'va' && vaData ? vaData.amount : paymentData.totalAmount)}
          </p>
          <div className="flex items-center justify-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Verifikasi Realtime Otomatis · Tanpa Perlu Kirim Bukti</span>
          </div>
        </div>

        {/* Multi-Method Tabs ONLY for Poketo (>= Rp 10.000) */}
        {isPoketo ? (
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-muted/60 mb-5 border border-white/5 text-xs">
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
        ) : null}

        {/* Tab 1: QRIS Instan */}
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
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">BCA</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">Mandiri</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">BRI</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">BNI</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">Dana</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">GoPay</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">OVO</span>
              <span className="px-2 py-0.5 rounded bg-muted/80 font-medium">ShopeePay</span>
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

        {/* Tab 2: Virtual Account Realtime (In-App Poketo) */}
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
                    className={`p-2 rounded-lg text-xs font-semibold border transition-all text-left flex items-center justify-between ${
                      selectedBank === b.code
                        ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{b.name}</span>
                    {selectedBank === b.code && <CheckCircle2 className="w-3 h-3 shrink-0 text-primary" />}
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
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Nomor Virtual Account {vaData.bankName || vaData.bank}:</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded">Aktif</span>
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

        {/* Tab 3: PayLater */}
        {activeTab === 'paylater' && isPoketo && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/50 pb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>PayLater & Cicilan Realtime</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Beli sekarang bayar nanti dengan akun PayLater Anda (Akulaku & Kredivo).
            </p>

            <div className="p-3 rounded-lg bg-muted/50 border border-white/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-sm">Akulaku PayLater</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Tersedia</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tenor cicilan 30 hari, 3 bulan, 6 bulan, hingga 12 bulan sesuai limit akun Akulaku Anda.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-white/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground text-sm">Kredivo</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Tersedia</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pembayaran cicilan instan tanpa kartu kredit langsung via akun Kredivo.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: Kartu Debit / Kredit */}
        {activeTab === 'card' && isPoketo && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/50 pb-2">
              <CreditCard className="w-4 h-4 text-blue-400" />
              <span>Kartu Debit & Kredit Visa / Mastercard</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Pembayaran aman dengan kartu berlogo Visa, Mastercard, atau GPN yang terproteksi 3D Secure dengan OTP resmi bank.
            </p>

            <div className="p-3 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-foreground">VISA / Mastercard / GPN</span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">3D Secure</span>
            </div>
          </div>
        )}

        {/* Live Status indicator */}
        <div className="mt-5 pt-4 border-t border-white/10">
          {statusMsg && (
            <div className={`flex items-center justify-center gap-2 mb-3 text-xs sm:text-sm ${roleTextClass}`}>
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${packageName === 'LIFETIME' ? 'bg-cyan-glow' : packageName === 'VIP' ? 'bg-purple-glow' : 'bg-success'}`} />
              <span className="font-semibold">{statusMsg}</span>
            </div>
          )}

          {/* Manual recheck button */}
          {onRecheck && (
            <div className="mb-4">
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
            <div className="bg-primary/10 border border-primary/30 p-3 rounded-xl mb-4 text-left">
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

          {/* Transaction Info Footer */}
          <div className="bg-muted/30 p-2.5 rounded-lg mb-4 flex items-center justify-between text-xs">
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
      </div>
    </div>
  );
};

export default PaymentQR;
