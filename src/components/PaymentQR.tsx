import { FC, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';
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
    totalAmount: number;
    expiresAt: string;
  };
  statusMsg: string;
  errorMsg: string;
  onCancel: () => void;
  onCopy: (text: string) => void;
  onRecheck?: () => void;
  formatRupiah: (n: number) => string;
}

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
  const [showContactHint, setShowContactHint] = useState(false);
  const [contactLink, setContactLink] = useState<SocialLink | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');

  const handleRecheck = async () => {
    if (!onRecheck || rechecking) return;
    setRechecking(true);
    setRecheckMsg('');
    try {
      await onRecheck();
      setRecheckMsg('Status diperbarui. Jika sudah bayar, halaman akan otomatis berpindah.');
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
    `https://larabert-qrgen.hf.space/v1/create-qr-code?size=500x500&style=2&color=0D8BA5&data=${encodeURIComponent(paymentData.qr_string)}`;
  const roleCardClass = packageName === 'LIFETIME' ? 'role-card-admin' : packageName === 'VIP' ? 'role-card-vip' : 'role-card-normal';
  const roleTextClass = packageName === 'LIFETIME' ? 'text-cyan-glow' : packageName === 'VIP' ? 'text-vip' : 'text-success';
  const roleTintClass = packageName === 'LIFETIME'
    ? 'bg-cyan-glow/10 border-cyan-glow/30'
    : packageName === 'VIP'
      ? 'bg-purple-glow/10 border-purple-glow/30'
      : 'bg-success/10 border-success/30';
  const roleGlowClass = packageName === 'VIP' ? 'glow-purple' : 'glow-cyan';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <GlobalBackground />

      <div className={`${roleCardClass} p-8 max-w-md w-full text-center z-10 relative`}>
        <div className={`inline-flex px-3 py-1 rounded-full border text-xs font-bold mb-4 ${roleTintClass} ${roleTextClass}`}>
          {packageName === 'LIFETIME' ? 'ADMIN · LIFETIME' : packageName}
        </div>
        <h2 className="text-2xl font-display font-bold mb-2 text-foreground">
          Scan untuk Membayar
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          QRIS mendukung Dana, OVO, GoPay, ShopeePay, dll
        </p>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/50 text-destructive p-4 rounded-xl mb-6 text-sm">
            {errorMsg}
          </div>
        )}

        {/* QR Code */}
        <div className={`bg-foreground p-4 rounded-2xl mb-6 inline-block shadow-xl ${roleGlowClass}`}>
          <img
            src={qrUrl}
            alt="QRIS Code"
            className="w-64 h-64 rounded-lg"
            crossOrigin="anonymous"
          />
        </div>

        {/* Amount */}
        <div className={`p-4 rounded-xl mb-6 border ${roleTintClass}`}>
          <p className="text-muted-foreground text-sm mb-1">Total Pembayaran</p>
          <p className={`text-3xl font-display font-bold ${roleTextClass}`}>
            {formatRupiah(paymentData.totalAmount)}
          </p>
        </div>

        {/* Status */}
        {statusMsg && (
          <div className={`flex items-center justify-center gap-3 mb-4 ${roleTextClass}`}>
            <div className={`w-3 h-3 rounded-full animate-pulse ${packageName === 'LIFETIME' ? 'bg-cyan-glow' : packageName === 'VIP' ? 'bg-purple-glow' : 'bg-success'}`} />
            <span className="font-medium">{statusMsg}</span>
          </div>
        )}

        {/* Manual recheck button */}
        {onRecheck && (
          <div className="mb-6">
            <Button
              type="button"
              onClick={handleRecheck}
              disabled={rechecking}
              className={`w-full ${roleTintClass} ${roleTextClass}`}
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${rechecking ? 'animate-spin' : ''}`} />
              {rechecking ? 'Mengecek pembayaran...' : 'Saya Sudah Bayar, Cek Sekarang'}
            </Button>
            {recheckMsg && (
              <p className="text-xs text-success mt-2">{recheckMsg}</p>
            )}
          </div>
        )}


        {/* Contact Hint */}
        {showContactHint && contactLink && (
          <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-foreground font-medium mb-2">
                  Sudah bayar tapi status belum berubah?
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Jika pembayaran sudah dilakukan namun status belum berubah, silakan hubungi admin untuk verifikasi manual.
                </p>
                <a
                  href={contactLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-success/20 hover:bg-success/30 text-success px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Hubungi Admin
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Transaction ID */}
        <div className="bg-muted/30 p-3 rounded-lg mb-6">
          <p className="text-xs text-muted-foreground mb-1">ID Transaksi</p>
          <div className="flex items-center justify-center gap-2">
            <code className="text-xs text-foreground font-mono">
              {paymentData.transactionId}
            </code>
            <button
              onClick={() => onCopy(paymentData.transactionId)}
              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onCancel}
          className="w-full border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
        >
          Batalkan Pesanan
        </Button>
      </div>
    </div>
  );
};

export default PaymentQR;
