import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdSlider from './AdSlider';
import GlobalBackground from './GlobalBackground';
import { supabase } from '@/integrations/supabase/client';
import { Link as LinkIcon, Key, Coins, History, Search, Bell, Shield, ShoppingBag, Sparkles, Wrench, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TokoScriptCatalog } from './TokoScriptCatalog';
import { getMaintenanceState, isDeveloperTesting, MaintenanceState, DEFAULT_MAINTENANCE_STATE } from '@/lib/maintenanceStore';
import { getTokoScriptHomeVisibility } from '@/lib/tokoScriptStore';
import { toast } from '@/hooks/use-toast';

interface Ad {
  id: string;
  title: string;
  media_url: string;
  media_type: string;
  link?: string | null;
  link_url?: string | null;
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

interface SocialLink {
  id: string;
  name: string;
  icon_type: string;
  url: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  link_location: string;
}

interface PackageSelectionProps {
  onSelect: (pkg: 'NORMAL' | 'VIP' | 'LIFETIME') => void;
  formatRupiah: (n: number) => string;
  prices: { NORMAL: number; VIP: number };
  ads: Ad[];
  packages?: Package[];
  defaultTab?: 'tools' | 'toko';
  onTokoScriptOrderQris?: (data: {
    transactionId: string;
    qr_string: string;
    qris_url: string;
    payment_url?: string;
    totalAmount: number;
    expiresAt: string;
    licenseKey: string;
    packageName: string;
    productTitle: string;
    days: number;
    productId?: string;
  }) => void;
}

const getIconForType = (iconType: string) => {
  switch (iconType) {
    case 'whatsapp':
    case 'whatsapp-contact':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      );
    case 'whatsapp-group':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-50">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      );
    case 'telegram':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-50">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
        </svg>
      );
    case 'discord':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-50">
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
        </svg>
      );
    default:
      return <LinkIcon className="w-5 h-5 opacity-50" />;
  }
};

const PackageSelection: FC<PackageSelectionProps> = ({
  onSelect,
  formatRupiah,
  prices,
  ads,
  packages,
  defaultTab,
  onTokoScriptOrderQris,
}) => {
  const navigate = useNavigate();
  const [showTokoScriptOnHome, setShowTokoScriptOnHome] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'tools' | 'toko'>(defaultTab || 'tools');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [xcoinsEnabled, setXcoinsEnabled] = useState(false);
  const [xcoinsLogoUrl, setXcoinsLogoUrl] = useState('');
  const [unclaimedCount, setUnclaimedCount] = useState(0);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(DEFAULT_MAINTENANCE_STATE);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    const updateState = () => {
      setIsDevMode(isDeveloperTesting());
      getMaintenanceState().then(setMaintenanceState);
    };

    const updateVisibility = () => {
      getTokoScriptHomeVisibility().then((visible) => {
        setShowTokoScriptOnHome(visible);
        if (!visible) {
          setActiveMainTab('tools');
        }
      });
    };

    updateState();
    updateVisibility();

    window.addEventListener('maintenance_state_changed', updateState);
    window.addEventListener('dev_testing_bypass_changed', updateState);
    window.addEventListener('toko_script_visibility_changed', updateVisibility);
    window.addEventListener('storage', updateState);
    window.addEventListener('storage', updateVisibility);

    return () => {
      window.removeEventListener('maintenance_state_changed', updateState);
      window.removeEventListener('dev_testing_bypass_changed', updateState);
      window.removeEventListener('toko_script_visibility_changed', updateVisibility);
      window.removeEventListener('storage', updateState);
      window.removeEventListener('storage', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (defaultTab) {
      if (defaultTab === 'toko' && !showTokoScriptOnHome) {
        setActiveMainTab('tools');
      } else {
        setActiveMainTab(defaultTab);
      }
    }
  }, [defaultTab, showTokoScriptOnHome]);

  useEffect(() => {
    const fetchSocialLinks = async () => {
      const { data } = await supabase
        .from('social_links')
        .select('*')
        .eq('is_active', true)
        .eq('link_location', 'home')
        .order('sort_order');
      if (data) setSocialLinks(data as SocialLink[]);
    };

    const checkXcoinsSettings = async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', ['xcoins_enabled', 'xcoins_logo_url']);
      const map = Object.fromEntries((data || []).map((s: any) => [s.key, s.value]));
      setXcoinsEnabled(map.xcoins_enabled === 'on');
      setXcoinsLogoUrl(map.xcoins_logo_url || '');
    };

    const checkUnclaimed = async () => {
      let deviceId = localStorage.getItem('arexans_device_id');
      if (!deviceId) return;
      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('device_id', deviceId)
        .eq('status', 'claimable') as any;
      setUnclaimedCount(count || 0);
    };

    fetchSocialLinks();
    checkXcoinsSettings();
    checkUnclaimed();
  }, []);

  const normalPkg = packages?.find(p => p.name === 'NORMAL');
  const vipPkg = packages?.find(p => p.name === 'VIP');
  const lifetimePkg = packages?.find(p => p.name === 'LIFETIME');

  const normalPrice = normalPkg?.price_per_day ?? prices.NORMAL;
  const vipPrice = vipPkg?.price_per_day ?? prices.VIP;
  const lifetimePrice = lifetimePkg?.price_per_day ?? 700000;
  const normalFeatures = normalPkg?.features ?? ['Semua fitur dasar', 'Update berkala', 'Support all executor'];
  const vipFeatures = vipPkg?.features ?? ['Semua fitur Normal', 'Premium scripts', 'Priority support', 'Early access features'];
  const lifetimeFeatures = lifetimePkg?.features ?? ['Akses script PERMANEN tanpa jangka waktu', 'Akses langsung loadstring script', 'Tanpa loading screen saat execute', 'Semua fitur unlocked / bebas pakai', 'Role ADMIN eksklusif (Cyan)'];

  const isToolsUnderMaintenance = (maintenanceState.globalMaintenance || maintenanceState.arexansToolsMaintenance) && !isDevMode;
  const isToolsMaintenanceActive = maintenanceState.globalMaintenance || maintenanceState.arexansToolsMaintenance;

  const handleSelectPackage = (pkg: 'NORMAL' | 'VIP' | 'LIFETIME') => {
    if (isToolsUnderMaintenance) {
      toast({
        title: 'Produk Sedang Maintenance / Perbaikan',
        description: 'Pembelian Arexans Tools ditutup sementara untuk publik. Masa aktif key pelanggan yang sedang berjalan telah dibekukan sementara agar pembeli tidak dirugikan.',
        variant: 'destructive',
      });
      return;
    }
    onSelect(pkg);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-3 md:p-4 bg-background relative overflow-hidden">
      <GlobalBackground />

      <div className="max-w-4xl w-full relative z-10">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between mb-4 md:mb-6 glass-card rounded-2xl px-3 py-2.5 md:px-5 md:py-3">
          {/* Left: Cek Key */}
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={() => navigate('/key-system')}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/10"
            >
              <Search className="w-4 h-4" />
              <span className="text-xs md:text-sm font-medium">Cek Key</span>
            </button>
          </div>

          {/* Center: Title or XCoins */}
          {xcoinsEnabled ? (
            <button
              onClick={() => navigate('/xcoins')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
            >
              <img src={xcoinsLogoUrl || '/images/xcoins-default-logo.png'} alt="XCoins" className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover border-2 border-primary/50 shadow-lg" />
              <span className="font-display text-sm md:text-base font-bold gradient-text">XCoins</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <img src="/images/arexans-icon.jpg" alt="Arexans" className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover border-2 border-primary/50 shadow-lg" />
              <span className="font-display text-sm md:text-base font-bold gradient-text">Arexans Tools</span>
            </div>
          )}

          {/* Right: History / Klaim Key */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-colors ${
                unclaimedCount > 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 animate-pulse'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            >
              {unclaimedCount > 0 ? (
                <>
                  <Key className="w-4 h-4" />
                  <span>Klaim Key</span>
                  <span className="min-w-[20px] h-[20px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1">
                    {unclaimedCount}
                  </span>
                </>
              ) : (
                <>
                  <History className="w-4 h-4" />
                  <span className="font-medium">History</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2 PRIMARY TABS SWITCHER: Arexans Tools & Toko Script (Hanya tampil jika Toko Script aktif di halaman awal) */}
        {showTokoScriptOnHome && (
          <div className="flex justify-center mb-6 md:mb-8">
            <div className="inline-flex p-1.5 rounded-2xl bg-card/90 border border-primary/25 backdrop-blur-xl shadow-2xl gap-1.5">
              <button
                type="button"
                onClick={() => setActiveMainTab('tools')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 ${
                  activeMainTab === 'tools'
                    ? 'bg-gradient-to-r from-blue-600 via-primary to-cyan-500 text-white shadow-lg shadow-cyan-500/30 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Arexans Tools</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMainTab('toko')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 ${
                  activeMainTab === 'toko'
                    ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-500 text-white shadow-lg shadow-purple-500/30 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Toko Script</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-mono">
                  Baru
                </span>
              </button>
            </div>
          </div>
        )}

        {showTokoScriptOnHome && activeMainTab === 'toko' ? (
          <div className="mb-8">
            <TokoScriptCatalog
              onOpenQris={(data) => {
                if (onTokoScriptOrderQris) {
                  onTokoScriptOrderQris(data);
                }
              }}
            />
          </div>
        ) : (
          <div>
            {/* Main Title */}
            <div className="text-center mb-6 md:mb-8">
          <div className="relative inline-block mb-3 md:mb-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-black tracking-wider animate-title-gradient bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent bg-[length:200%_auto]">
              AREXANS TOOLS
            </h1>
            <span className="absolute -top-1 md:-top-2 -right-2 md:-right-8 bg-primary text-primary-foreground text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 md:py-1 transform rotate-12 rounded shadow-lg border border-primary/50 font-display animate-glow">
              OFFICIAL
            </span>
          </div>
          <p className="text-muted-foreground text-sm md:text-lg">
            Roblox script supports all executors
          </p>
        </div>

        {/* Ad Slider */}
        {ads.length > 0 && (
          <div className="mb-6 md:mb-8">
            <AdSlider ads={ads} />
          </div>
        )}

        {/* Maintenance / Developer Testing Banners */}
        {isToolsMaintenanceActive && isDevMode && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs sm:text-sm text-amber-300 font-bold block">
                  🛠️ Mode Testing Developer: Arexans Tools Sedang Maintenance untuk Publik
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Hanya Developer yang dapat mengakses dan melakukan testing pembelian & generate key.
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold self-start sm:self-auto shrink-0">
              BYPASS TESTING AKTIF
            </span>
          </div>
        )}

        {isToolsUnderMaintenance && (
          <div className="mb-6 p-5 rounded-2xl border border-destructive/50 bg-destructive/10 backdrop-blur-md text-center space-y-2.5 shadow-xl animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/20 text-destructive text-xs font-bold border border-destructive/30">
              <Wrench className="w-3.5 h-3.5 animate-pulse" />
              SEDANG MAINTENANCE & PERBAIKAN
            </div>
            <h3 className="text-base md:text-lg font-bold text-foreground">
              Pembelian Arexans Tools Dinonaktifkan Sementara
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Sistem saat ini sedang dalam pemeliharaan perbaikan. Pembelian untuk publik ditutup sementara dan seluruh masa aktif key pengguna yang sedang berjalan telah <strong className="text-foreground">DIBEKUKAN SEMENTARA</strong> agar tidak rugi. Durasi sisa Anda aman dan otomatis dilanjutkan setelah perbaikan selesai.
            </p>
            <div className="pt-1 flex items-center justify-center gap-2 text-xs text-amber-400 font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>Masa aktif key pembeli di-pause (Anti-Rugi)</span>
            </div>
          </div>
        )}

        {/* Package Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {/* Normal Package */}
          {normalPkg && normalPkg.is_active && (
          <div
            onClick={() => handleSelectPackage('NORMAL')}
            className={`role-card-normal p-5 md:p-8 cursor-pointer group hover:scale-[1.02] transition-all duration-300 ${
              isToolsUnderMaintenance ? 'opacity-70 hover:scale-100 border-destructive/30' : ''
            }`}
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <span className="text-emerald-400 font-display text-base md:text-lg font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  {normalPkg?.display_name ?? 'NORMAL'}
                </span>
                <span className="bg-emerald-500/15 text-emerald-400 text-[10px] md:text-xs font-bold px-2.5 md:px-3 py-1 rounded-full border border-emerald-500/30">
                  BASIC
                </span>
              </div>
              <div className="mb-4 md:mb-6">
                <span className="text-3xl md:text-4xl font-display font-black text-emerald-400">
                  {formatRupiah(normalPrice)}
                </span>
                <span className="text-muted-foreground text-sm md:text-lg">/hari</span>
              </div>
              <ul className="space-y-2 md:space-y-3 text-muted-foreground text-sm md:text-base">
                {normalFeatures.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 md:gap-3">
                    <span className="text-emerald-400 font-bold">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6 md:mt-8">
                <button
                  disabled={isToolsUnderMaintenance}
                  className={`w-full py-2.5 md:py-3 rounded-xl font-display font-bold text-sm md:text-base transition-all duration-300 shadow-lg ${
                    isToolsUnderMaintenance
                      ? 'bg-destructive/20 text-destructive border border-destructive/30 cursor-not-allowed'
                      : isDevMode && isToolsMaintenanceActive
                      ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25'
                      : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/25 group-hover:shadow-emerald-500/40'
                  }`}
                >
                  {isToolsUnderMaintenance
                    ? '🔒 Sedang Maintenance (Terkunci)'
                    : isDevMode && isToolsMaintenanceActive
                    ? 'Testing Normal (Developer)'
                    : 'Pilih Normal'}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* VIP Package */}
          {vipPkg && vipPkg.is_active && (
          <div
            onClick={() => handleSelectPackage('VIP')}
            className={`role-card-vip p-5 md:p-8 cursor-pointer group hover:scale-[1.02] transition-all duration-300 ${
              isToolsUnderMaintenance ? 'opacity-70 hover:scale-100 border-destructive/30' : ''
            }`}
          >
            <div className="absolute -top-2 md:-top-3 -right-2 md:-right-3 text-white text-[10px] md:text-xs font-bold px-2.5 md:px-3 py-1 md:py-1.5 rounded-full font-display shadow-lg z-20" style={{ background: 'var(--gradient-vip)', backgroundSize: '200% 200%', animation: 'gradient 3s ease infinite, glow 2.5s ease-in-out infinite alternate' }}>
              POPULER
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <span className="text-vip font-display text-base md:text-lg font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                  {vipPkg?.display_name ?? 'VIP'}
                </span>
                <span className="text-white text-[10px] md:text-xs font-bold px-2.5 md:px-3 py-1 rounded-full border border-purple-500/40" style={{ background: 'hsl(280 90% 60% / 0.25)' }}>
                  PREMIUM
                </span>
              </div>
              <div className="mb-4 md:mb-6">
                <span className="text-3xl md:text-4xl font-display font-black text-vip">
                  {formatRupiah(vipPrice)}
                </span>
                <span className="text-muted-foreground text-sm md:text-lg">/hari</span>
              </div>
              <ul className="space-y-2 md:space-y-3 text-muted-foreground text-sm md:text-base">
                {vipFeatures.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 md:gap-3">
                    <span style={{ color: 'hsl(280 90% 70%)' }} className="font-bold">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6 md:mt-8">
                <button
                  disabled={isToolsUnderMaintenance}
                  className={`btn-vip w-full font-display font-bold text-sm md:text-base py-2.5 md:py-3 rounded-xl shadow-lg transition-all ${
                    isToolsUnderMaintenance
                      ? 'bg-destructive/20 text-destructive border border-destructive/30 cursor-not-allowed opacity-60'
                      : isDevMode && isToolsMaintenanceActive
                      ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25'
                      : 'shadow-purple-500/25 group-hover:shadow-purple-500/40'
                  }`}
                >
                  {isToolsUnderMaintenance
                    ? '🔒 Sedang Maintenance (Terkunci)'
                    : isDevMode && isToolsMaintenanceActive
                    ? 'Testing VIP (Developer)'
                    : 'Pilih VIP'}
                </button>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* LIFETIME ADMIN Package */}
        {lifetimePkg && lifetimePkg.is_active && (
          <div className="mt-6 md:mt-8">
            <div
              onClick={() => handleSelectPackage('LIFETIME')}
              className={`role-card-admin p-5 md:p-8 cursor-pointer group hover:scale-[1.01] transition-all duration-300 ${
                isToolsUnderMaintenance ? 'opacity-70 hover:scale-100 border-destructive/30' : ''
              }`}
            >
              <div className="absolute -top-2 md:-top-3 -right-2 md:-right-3 bg-cyan-400 text-black text-[10px] md:text-xs font-bold px-2.5 md:px-3 py-1 md:py-1.5 rounded-full font-display shadow-lg shadow-cyan-400/50 animate-pulse z-20">
                LIFETIME
              </div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <span className="text-cyan-300 font-display text-base md:text-lg font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                    {lifetimePkg?.display_name ?? 'LIFETIME ADMIN'}
                  </span>
                  <span className="bg-cyan-500/20 text-cyan-300 text-[10px] md:text-xs font-bold px-2.5 md:px-3 py-1 rounded-full border border-cyan-400/40 shadow-sm shadow-cyan-500/30">
                    ADMIN
                  </span>
                </div>
                
                <div className="mb-4 md:mb-6">
                  <span className="text-3xl md:text-4xl font-display font-black text-cyan-300">
                    {formatRupiah(lifetimePrice)}
                  </span>
                  <span className="text-muted-foreground text-sm md:text-lg ml-1">/sekali bayar</span>
                </div>

                <ul className="space-y-2 md:space-y-3 text-muted-foreground text-sm md:text-base mb-4">
                  {lifetimeFeatures.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 md:gap-3">
                      <span className="text-cyan-400 font-bold">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Notes */}
                <div className="mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-muted-foreground space-y-1">
                  <p className="text-cyan-400 font-semibold text-xs mb-1">⚠️ Ketentuan:</p>
                  <p>• Jangan sharing loadstring & keysistem</p>
                  <p>• Jangan memperjual belikan script</p>
                  <p>• No refund</p>
                  <p className="text-destructive font-semibold mt-1">Melanggar = blacklist seumur hidup</p>
                </div>

                <div className="mt-6 md:mt-8">
                  <button
                    disabled={isToolsUnderMaintenance}
                    className={`w-full py-2.5 md:py-3 rounded-xl font-display font-bold text-sm md:text-base transition-all duration-300 shadow-lg ${
                      isToolsUnderMaintenance
                        ? 'bg-destructive/20 text-destructive border border-destructive/30 cursor-not-allowed'
                        : isDevMode && isToolsMaintenanceActive
                        ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25'
                        : 'bg-cyan-400 text-black hover:bg-cyan-300 shadow-cyan-400/30 group-hover:shadow-cyan-400/50'
                    }`}
                  >
                    {isToolsUnderMaintenance
                      ? '🔒 Sedang Maintenance (Terkunci)'
                      : isDevMode && isToolsMaintenanceActive
                      ? 'Testing LIFETIME (Developer)'
                      : 'Beli LIFETIME ADMIN'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
          </div>
        )}

        {/* Social Links */}
        {socialLinks.length > 0 && (
          <div className="flex items-center justify-center gap-6 mt-8">
            {socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title={link.label}
              >
                {getIconForType(link.icon_type)}
                <span className="text-[10px]">{link.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageSelection;
