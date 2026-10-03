import { FC, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Eye, EyeOff } from 'lucide-react';
import GlobalBackground from './GlobalBackground';
import { supabase } from '@/integrations/supabase/client';

interface PaymentSuccessProps {
  finalData: {
    key: string;
    package: string;
    expired: string;
    expiredDisplay: string;
    days: number;
    transactionId?: string;
    productId?: string;
  };
  onCopy: (text: string) => void;
}

interface SocialLink {
  id: string;
  name: string;
  icon_type: string;
  url: string;
  label: string;
}

const PaymentSuccess: FC<PaymentSuccessProps> = ({ finalData, onCopy }) => {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);

  const isAdmin = finalData.package === 'LIFETIME';
  const isVip = finalData.package === 'VIP';
  const roleCardClass = isAdmin ? 'role-card-admin' : isVip ? 'role-card-vip' : 'role-card-normal';
  const roleTextClass = isAdmin ? 'text-cyan-glow' : isVip ? 'text-vip' : 'text-success';
  const roleTintClass = isAdmin
    ? 'bg-cyan-glow/10 border-cyan-glow/30'
    : isVip
      ? 'bg-purple-glow/10 border-purple-glow/30'
      : 'bg-success/10 border-success/30';

  const domain = (typeof window !== 'undefined' ? window.location.origin : 'https://tools.arexans.my.id').replace(/\/+$/, '');
  const scriptId = finalData.productId || (isAdmin ? 'lifetime' : 'main');
  const displayScript = `_G.Axstools = "${finalData.key}"\nloadstring(game:HttpGet("${domain}/api/public/raw/${scriptId}?key=" .. _G.Axstools))()`;

  useEffect(() => {
    const fetchData = async () => {
      const { data: linksData } = await supabase
        .from('social_links')
        .select('*')
        .eq('is_active', true)
        .eq('link_location', 'success')
        .order('sort_order');

      if (linksData) {
        setSocialLinks(linksData as SocialLink[]);
      }
    };

    fetchData();
  }, [isAdmin]);

  const censorText = (text: string) => {
    return '•'.repeat(Math.min(text.length, 24));
  };

  const censorKey = (text: string) => {
    if (text.length <= 4) return '•'.repeat(text.length);
    return text.slice(0, 4) + '•'.repeat(Math.min(text.length - 4, 16));
  };

  const getWhatsAppGroupLink = () => {
    const groupLink = socialLinks.find(l => l.icon_type === 'whatsapp-group');
    return groupLink?.url || 'https://chat.whatsapp.com/HlXpv77lO783OUKWeKPaiG';
  };

  const getAdminContactLink = () => {
    const contactLink = socialLinks.find(l => l.icon_type === 'whatsapp-contact' || l.icon_type === 'whatsapp');
    return contactLink?.url || 'https://wa.me/6289518030035';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <GlobalBackground variant="success" />

      <div className={`${roleCardClass} p-8 max-w-lg w-full relative z-10`}>
        {/* Success Icon & Header */}
        <div className="text-center mb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 animate-float ${roleTintClass}`}>
            <span className={`text-4xl ${roleTextClass}`}>✓</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1.5">
            Pembayaran Berhasil!
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Script loader Anda siap dijalankan di executor Roblox.
          </p>
        </div>

        {/* PRIMARY SCRIPT LOADER (HANYA SCRIPT YANG DIBERIKAN KE PEMBELI) */}
        <div className={`p-5 rounded-2xl border mb-6 shadow-xl relative overflow-hidden ${roleTintClass}`}>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold font-mono tracking-wide ${roleTextClass}`}>
                SCRIPT LOADER ROBLOX
              </span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-mono font-bold">
              Default 1 HWID Slot
            </span>
          </div>

          <div className="bg-black/85 p-3.5 rounded-xl border border-border/80 flex flex-col gap-3">
            <pre className={`text-xs sm:text-sm font-mono whitespace-pre-wrap break-all leading-relaxed select-all text-cyan-300`}>
              {displayScript}
            </pre>

            <button
              onClick={() => onCopy(displayScript)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold text-xs sm:text-sm transition-all shadow-md active:scale-[0.98]"
            >
              <Copy className="w-4 h-4" />
              Salin Script Lengkap
            </button>
          </div>

          {/* HWID Policy Note */}
          <div className="mt-3.5 p-2.5 rounded-xl bg-background/60 border border-border/50 text-[11px] text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <span>🛡️ Ketentuan Key & HWID:</span>
            </div>
            <p className="leading-relaxed">
              Jumlah HWID default adalah <strong>1 perangkat</strong>. Jika ingin menjalankan script di HP atau PC lain, Anda wajib membeli penambahan <strong>+1 slot HWID permanen</strong> di portal Key System.
            </p>
          </div>
        </div>

        {/* Collapsible Order Summary */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="w-full py-2 px-3 text-xs text-muted-foreground hover:text-foreground flex items-center justify-between rounded-lg bg-background/40 hover:bg-background/70 border border-border/40 transition-colors"
          >
            <span className="font-medium">Lihat Rincian Pesanan & Transaksi</span>
            <span>{showKey ? '▲ Tutup' : '▼ Lihat'}</span>
          </button>

          {showKey && (
            <div className={`mt-2 p-3.5 rounded-xl border space-y-2 text-xs ${roleTintClass}`}>
              {finalData.transactionId && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">TX ID:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-foreground font-mono font-bold text-[11px]">
                      {finalData.transactionId}
                    </code>
                    <button
                      onClick={() => finalData.transactionId && onCopy(finalData.transactionId)}
                      className="text-primary p-1 rounded hover:bg-primary/10"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Key:</span>
                <div className="flex items-center gap-1">
                  <code className="text-foreground font-mono font-bold">
                    {finalData.key}
                  </code>
                  <button
                    onClick={() => onCopy(finalData.key)}
                    className="text-primary p-1 rounded hover:bg-primary/10"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Paket / Produk:</span>
                <span className={`font-bold ${roleTextClass}`}>
                  {finalData.package === 'LIFETIME' ? 'ADMIN (LIFETIME)' : finalData.package}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Durasi:</span>
                <span className="text-foreground font-medium">
                  {finalData.package === 'LIFETIME' ? 'Permanen (Selamanya)' : `${finalData.days} Hari`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Berlaku Hingga:</span>
                <span className="text-foreground font-medium">
                  {finalData.package === 'LIFETIME' ? 'Selamanya' : finalData.expiredDisplay}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp Buttons */}
        <div className="space-y-3 mb-6">
          <a
            href={getWhatsAppGroupLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BD5C] text-white font-display font-bold py-3 px-4 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Join Grup WhatsApp
          </a>

          <a
            href={getAdminContactLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-display font-medium py-3 px-4 rounded-lg border border-border transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Hubungi Admin (Keluhan/Laporan)
          </a>
        </div>

        <Button
          onClick={() => {
            localStorage.removeItem('arexans_payment_state');
            window.location.reload();
          }}
          variant="outline"
          className={`w-full font-display ${roleTintClass} ${roleTextClass}`}
        >
          Buat Pesanan Baru
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccess;