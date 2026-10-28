import React, { useState, useEffect } from 'react';
import { TokoScriptProduct } from '@/types/tokoScript';
import { getTokoScripts, findResellerByCode } from '@/lib/tokoScriptStore';
import { getMaintenanceState, isDeveloperTesting, MaintenanceState, DEFAULT_MAINTENANCE_STATE } from '@/lib/maintenanceStore';
import { TokoScriptOrderModal } from './TokoScriptOrderModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingBag,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Play,
  Sparkles,
  ShieldCheck,
  Tag,
  Clock,
  UserCheck,
  PackageSearch,
  Wrench,
  Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface TokoScriptCatalogProps {
  resellerCode?: string | null;
  onOpenQris: (data: {
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
  }) => void;
}

export const TokoScriptCatalog: React.FC<TokoScriptCatalogProps> = ({
  resellerCode,
  onOpenQris,
}) => {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<TokoScriptProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<TokoScriptProduct | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [resellerName, setResellerName] = useState<string | null>(null);

  // Active media slide indices per script { [scriptId]: activeIndex }
  const [activeMediaIndices, setActiveMediaIndices] = useState<Record<string, number>>({});
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(DEFAULT_MAINTENANCE_STATE);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    setIsDevMode(isDeveloperTesting());
    getMaintenanceState().then(setMaintenanceState);
  }, []);

  const isScriptUnderMaintenance = (script: TokoScriptProduct) => {
    return (maintenanceState.globalMaintenance || maintenanceState.tokoScriptsMaintenance || !!script.isMaintenance) && !isDevMode;
  };

  const isScriptMaintenanceActive = (script: TokoScriptProduct) => {
    return maintenanceState.globalMaintenance || maintenanceState.tokoScriptsMaintenance || !!script.isMaintenance;
  };

  const handleOpenOrder = (script: TokoScriptProduct) => {
    if (isScriptUnderMaintenance(script)) {
      toast({
        title: 'Produk Sedang Maintenance / Perbaikan',
        description: 'Script ini sedang dalam masa perbaikan. Pembelian ditutup sementara dan key pembeli dibekukan agar tidak rugi.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedProduct(script);
    setOrderModalOpen(true);
  };

  useEffect(() => {
    loadCatalog();
    if (resellerCode) {
      findResellerByCode(resellerCode).then(res => {
        if (res) setResellerName(res.name);
      });
    }
  }, [resellerCode]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await getTokoScripts();
      setScripts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNextMedia = (scriptId: string, total: number) => {
    setActiveMediaIndices(prev => ({
      ...prev,
      [scriptId]: ((prev[scriptId] || 0) + 1) % total,
    }));
  };

  const handlePrevMedia = (scriptId: string, total: number) => {
    setActiveMediaIndices(prev => ({
      ...prev,
      [scriptId]: ((prev[scriptId] || 0) - 1 + total) % total,
    }));
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + val.toLocaleString('id-ID');
  };

  const activeScripts = scripts.filter(s => s.isActive);

  return (
    <div className="w-full space-y-6">
      {/* Catalog Title Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold">
          <ShoppingBag className="w-3.5 h-3.5" />
          Katalog Toko Script Resmi
        </div>
        <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground">
          Pilihan Script Premium Arexans
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground max-w-xl mx-auto">
          Dapatkan script Roblox executor pilihan langsung dengan key instan, garansi update berkala, dan pilihan durasi fleksibel.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Memuat katalog script...</span>
        </div>
      ) : activeScripts.length === 0 ? (
        /* KOSONG DULU AJA SESUAI BRIEF */
        <div className="glass-card rounded-2xl p-8 md:p-12 text-center max-w-md mx-auto space-y-4 border-dashed border-border/80">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary shadow-lg shadow-primary/10">
            <PackageSearch className="w-8 h-8 opacity-80" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold font-display text-foreground">
              Toko Script Masih Kosong
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Saat ini belum ada script yang dipublikasikan oleh developer. Produk baru akan segera diatur dan dirilis melalui menu developer!
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/developer')}
              className="text-xs text-primary border-primary/30 hover:bg-primary/10 rounded-xl"
            >
              Atur di /developer
            </Button>
          </div>
        </div>
      ) : (
        /* SCRIPT PRODUCTS LIST */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeScripts.map((script) => {
            const mediaList = script.media && script.media.length > 0 ? script.media : [];
            const activeIdx = activeMediaIndices[script.id] || 0;
            const currentMedia = mediaList[activeIdx];
            const activePackages = script.packages.filter(p => p.is_active);
            const lowestPrice = activePackages.length > 0 ? Math.min(...activePackages.map(p => p.price)) : 0;

            return (
              <div
                key={script.id}
                className="glass-card rounded-2xl overflow-hidden border border-border/70 flex flex-col transition-all hover:border-primary/40 hover:shadow-xl"
              >
                {/* Media Ads (Images / Videos Slider) */}
                <div className="relative aspect-video w-full bg-slate-950/80 overflow-hidden group">
                  {currentMedia ? (
                    currentMedia.type === 'video' ? (
                      <video
                        src={currentMedia.url}
                        controls
                        className="w-full h-full object-cover"
                        poster="/images/arexans-icon.jpg"
                      />
                    ) : (
                      <img
                        src={currentMedia.url}
                        alt={script.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/arexans-icon.jpg';
                        }}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/60 gap-2">
                      <Sparkles className="w-8 h-8 opacity-40 text-primary" />
                      <span className="text-xs">Arexans Script Preview</span>
                    </div>
                  )}

                  {/* Multi-Media Navigation Arrows if > 1 media */}
                  {mediaList.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrevMedia(script.id, mediaList.length);
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition backdrop-blur-sm"
                        title="Media sebelumnya"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNextMedia(script.id, mediaList.length);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition backdrop-blur-sm"
                        title="Media berikutnya"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {/* Pagination dots */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm">
                        {mediaList.map((m, idx) => (
                          <button
                            key={m.id || idx}
                            type="button"
                            onClick={() =>
                              setActiveMediaIndices(prev => ({
                                ...prev,
                                [script.id]: idx,
                              }))
                            }
                            className={`w-2 h-2 rounded-full transition-all ${
                              idx === activeIdx ? 'bg-primary w-4' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Media Count Badge */}
                  {mediaList.length > 1 && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] text-white/90 font-medium backdrop-blur-sm">
                      {activeIdx + 1} / {mediaList.length} Media
                    </div>
                  )}

                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {isScriptMaintenanceActive(script) ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isDevMode
                          ? 'bg-amber-500 text-black border border-amber-400 font-mono'
                          : 'bg-destructive text-destructive-foreground animate-pulse shadow-sm'
                      }`}>
                        {isDevMode ? '🛠️ MAINTENANCE (DEV)' : '🔴 SEDANG MAINTENANCE'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary text-primary-foreground shadow-sm">
                        VERIFIED
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-base md:text-lg text-foreground font-display">
                        {script.title}
                      </h3>
                      {lowestPrice > 0 && (
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">Mulai dari</span>
                          <span className="text-sm font-extrabold text-primary font-mono">
                            {formatRupiah(lowestPrice)}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {script.description || 'Script berkualitas tinggi dengan fitur lengkap, proteksi anti-ban, dan bypass terbaru.'}
                    </p>

                    {/* Maintenance Notice Box if under maintenance */}
                    {isScriptMaintenanceActive(script) && (
                      <div className="p-2.5 rounded-xl border border-destructive/40 bg-destructive/10 text-xs space-y-1">
                        <div className="font-bold text-destructive flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Perbaikan / Maintenance Berlangsung</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {script.maintenanceNotice || 'Pembelian publik ditutup sementara & sisa masa aktif key pembeli dibekukan sementara agar tidak rugi.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Available Packages Chips */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      Pilihan Paket Durasi:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activePackages.map(pkg => (
                        <span
                          key={pkg.id}
                          className="text-[10px] font-medium px-2 py-1 rounded-lg bg-card/60 border border-border/80 text-foreground/90 flex items-center gap-1"
                        >
                          <span>{pkg.name}</span>
                          <span className="text-primary font-bold">({formatRupiah(pkg.price)})</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 border-t border-border/50">
                    <Button
                      onClick={() => handleOpenOrder(script)}
                      disabled={isScriptUnderMaintenance(script)}
                      className={`w-full rounded-xl font-bold text-xs h-10 shadow-lg flex items-center justify-center gap-2 ${
                        isScriptUnderMaintenance(script)
                          ? 'bg-destructive/20 text-destructive border border-destructive/30 cursor-not-allowed opacity-60'
                          : isDevMode && isScriptMaintenanceActive(script)
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25'
                          : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20'
                      }`}
                    >
                      {isScriptUnderMaintenance(script) ? (
                        <>
                          <Lock className="w-4 h-4" />
                          Sedang Maintenance (Terkunci)
                        </>
                      ) : isDevMode && isScriptMaintenanceActive(script) ? (
                        <>
                          <Wrench className="w-4 h-4" />
                          Testing Order (Developer)
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="w-4 h-4" />
                          Beli Script Ini (Key Custom/Acak)
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Modal */}
      <TokoScriptOrderModal
        isOpen={orderModalOpen}
        onClose={() => {
          setOrderModalOpen(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        resellerCode={resellerCode}
        onOpenQris={onOpenQris}
      />
    </div>
  );
};
