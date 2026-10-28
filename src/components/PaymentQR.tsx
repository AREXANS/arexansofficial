import { FC, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Copy, MessageCircle, AlertCircle, RefreshCw, ExternalLink, 
  QrCode, Building2, CreditCard, Zap, CheckCircle2, Download, Smartphone, ShieldCheck
} from 'lucide-react';
import GlobalBackground from './GlobalBackground';
import { supabase } from '@/integrations/supabase/client';

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
  const [activeTab, setActiveTab] = useState<PaymentTab>('qris');
  const [showContactHint, setShowContactHint] = useState(false);
  const [contactLink, setContactLink] = useState<SocialLink | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');
  const [copiedQris, setCopiedQris] = useState(false);

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
      setTimeout(() => setCopiedQris(false), 2500);
    }
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

  const openPoketo = () => {
    if (paymentData.payment_url) {
      window.open(paymentData.payment_url, '_blank', 'noopener,noreferrer');
    }
  };

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
          Pilih Metode Pembayaran
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 mb-4">
          Poketo Gateway · QRIS, Virtual Account, PayLater & Kartu Debit
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
            {formatRupiah(paymentData.totalAmount)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <span>Nominal tepat & otomatis terverifikasi tanpa biaya tersembunyi</span>
          </p>
        </div>

        {/* Global Poketo Checkout Button */}
        {paymentData.payment_url && (
          <div className="mb-5">
            <button
              onClick={openPoketo}
              className="group w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-700 text-white font-bold text-sm shadow-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span>Buka Pembayaran Poketo (Semua Metode)</span>
              <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
            </button>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Pilihan lengkap: QRIS, Transfer VA Bank, PayLater cicilan, & Kartu Debit
            </p>
          </div>
        )}

        {/* Multi-Method Tabs */}
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
            <span>Kartu Debit</span>
          </button>
        </div>

        {/* Tab 1: QRIS */}
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
              Scan QR di atas menggunakan aplikasi mobile banking atau e-wallet apa saja.
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
                Simpan Gambar QR
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyQrisString}
                className="text-xs gap-1.5"
              >
                {copiedQris ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedQris ? 'Tersalin!' : 'Salin String QRIS'}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Virtual Account */}
        {activeTab === 'va' && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/50 pb-2">
              <Building2 className="w-4 h-4 text-primary" />
              <span>Transfer Virtual Account (VA) Bank</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Dapatkan nomor VA unik Anda untuk pembayaran instan melalui ATM, Mobile Banking, atau Internet Banking.
            </p>

            {/* Bank list grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">Bank BRI</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">Bank BNI</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">Bank Permata</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">CIMB Niaga</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">Bank Danamon</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <span className="font-semibold text-foreground">Bank Mandiri / Lainnya</span>
                <span className="text-[10px] text-emerald-400 font-mono">Otomatis</span>
              </div>
            </div>

            <Button
              onClick={openPoketo}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2 mt-2"
            >
              <span>Dapatkan Nomor VA di Poketo</span>
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Tab 3: PayLater */}
        {activeTab === 'paylater' && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/50 pb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>PayLater & Cicilan Tanpa Kartu</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Beli sekarang, bayar nanti atau gunakan fasilitas cicilan fleksibel dengan akun PayLater Anda.
            </p>

            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground block text-sm">Akulaku PayLater</span>
                  <span className="text-[11px] text-muted-foreground">Tenor 30 hari atau cicilan 3, 6, 12 bulan</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">Tersedia</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground block text-sm">Kredivo / Cicilan</span>
                  <span className="text-[11px] text-muted-foreground">Pembayaran bertahap sesuai limit akun Anda</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">Tersedia</span>
              </div>
            </div>

            <Button
              onClick={openPoketo}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold gap-2 mt-2"
            >
              <span>Bayar via PayLater di Poketo</span>
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Tab 4: Kartu Debit / Kredit */}
        {activeTab === 'card' && (
          <div className="space-y-4 text-left animate-fade-in p-4 rounded-xl bg-card/60 border border-border/60">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/50 pb-2">
              <CreditCard className="w-4 h-4 text-blue-400" />
              <span>Kartu Debit & Kredit Visa / Mastercard</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Pembayaran instan dan terlindungi 3D Secure dengan verifikasi OTP langsung dari bank penerbit kartu Anda.
            </p>

            <div className="p-3 rounded-lg bg-muted/50 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-foreground">VISA / Mastercard / GPN</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">3D Secure</span>
            </div>

            <Button
              onClick={openPoketo}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 mt-2"
            >
              <span>Bayar via Kartu di Poketo</span>
              <ExternalLink className="w-4 h-4" />
            </Button>
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
                  <p className="text-foreground font-semibold">Sudah bayar tapi belum terverifikasi?</p>
                  <p className="text-muted-foreground mt-0.5 mb-2">Hubungi admin dengan membawa nomor order transaksi ini.</p>
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
