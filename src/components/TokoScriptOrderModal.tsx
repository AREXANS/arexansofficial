import React, { useState, useEffect } from 'react';
import { TokoScriptProduct, ScriptPackage } from '@/types/tokoScript';
import { getScriptRawId, getStoredReferral, findResellerByCode } from '@/lib/tokoScriptStore';
import { createTokoScriptKey } from '@/lib/tokoScriptKeyStore';
import { getMaintenanceState, isDeveloperTesting } from '@/lib/maintenanceStore';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dices, ShieldCheck, Loader2, Sparkles, CheckCircle2, QrCode, Tag, UserCheck, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TokoScriptOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: TokoScriptProduct | null;
  resellerCode?: string | null;
  onPaymentSuccess?: (paymentData: any) => void;
  onOpenQris: (data: {
    transactionId: string;
    qr_string: string;
    qris_url: string;
    totalAmount: number;
    expiresAt: string;
    licenseKey: string;
    packageName: string;
    productTitle: string;
    days: number;
  }) => void;
}

export const TokoScriptOrderModal: React.FC<TokoScriptOrderModalProps> = ({
  isOpen,
  onClose,
  product,
  resellerCode,
  onOpenQris,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Referral state
  const [activeReseller, setActiveReseller] = useState<{ username: string; name: string } | null>(null);
  const [showRefInput, setShowRefInput] = useState(false);
  const [inputRefCode, setInputRefCode] = useState('');

  // Check stored referral or prop
  useEffect(() => {
    const code = resellerCode || getStoredReferral()?.code;
    if (code) {
      findResellerByCode(code).then((acc) => {
        if (acc && acc.isActive) {
          setActiveReseller({ username: acc.username, name: acc.payoutAccountName || acc.username });
        }
      });
    }
  }, [resellerCode, isOpen]);

  // When modal opens or product changes, pick first active package
  useEffect(() => {
    if (product) {
      const activePackages = product.packages.filter(p => p.is_active);
      if (activePackages.length > 0) {
        setSelectedPackageId(activePackages[0].id);
      }
      if (!licenseKey) {
        generateRandomKey();
      }
    }
  }, [product, isOpen]);

  if (!product) return null;

  const activePackages = product.packages.filter(p => p.is_active);
  const selectedPackage: ScriptPackage | undefined = activePackages.find(p => p.id === selectedPackageId) || activePackages[0];

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'AXS-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLicenseKey(result);
    setErrorMsg('');
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + val.toLocaleString('id-ID');
  };

  const handleProceedPayment = async () => {
    setErrorMsg('');

    const mState = await getMaintenanceState();
    const isUnderMaintenance = (mState.globalMaintenance || mState.tokoScriptsMaintenance || !!product.isMaintenance) && !isDeveloperTesting();
    if (isUnderMaintenance) {
      setErrorMsg('Script ini sedang dalam masa perbaikan (maintenance). Pembelian ditutup sementara & masa aktif key pembeli dibekukan agar tidak rugi.');
      return;
    }

    const cleanKey = licenseKey.trim().toUpperCase();

    if (!cleanKey || cleanKey.length < 4) {
      setErrorMsg('Key minimal 4 karakter. Silakan ketik custom key atau klik Acak.');
      return;
    }

    if (!selectedPackage) {
      setErrorMsg('Pilih paket durasi terlebih dahulu.');
      return;
    }

    setLoading(true);

    try {
      const txId = 'TXS-' + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString().slice(-4);
      const amount = selectedPackage.price;
      const deviceId = localStorage.getItem('arexans_device_id') || 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      // Check if Edge Function create-payment is available, otherwise create fallback direct QRIS record
      let qrString = `00020101021226670014ID.LINKAJA.WWW01189360091438927000000215${txId}51440014ID.CO.QRIS.WWW0215ID102002100000052045812530336054${amount}5802ID5912AREXANSTOOLS6007JAKARTA61051011062200116${txId}6304`;
      let qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrString)}`;

      try {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-payment', {
          body: {
            amount,
            key: cleanKey,
            packageName: `SCRIPT_${selectedPackage.name}`,
            days: selectedPackage.days,
            deviceId,
            customerName: `Script Buyer (${product.title})`,
          }
        });

        if (!edgeError && edgeData?.qr_string) {
          qrString = edgeData.qr_string;
          qrisUrl = edgeData.qris_url || qrisUrl;
        }
      } catch (e) {
        console.warn('Edge function invoke failed, using generated QRIS fallback:', e);
      }

      // Record transaction in Supabase transactions table
      try {
        await supabase.from('transactions').insert({
          transaction_id: txId,
          customer_name: `Toko Script (${cleanKey})`,
          package_name: `${product.title} [${selectedPackage.name}]`,
          package_duration: selectedPackage.days,
          license_key: cleanKey,
          original_amount: originalAmount,
          total_amount: amount,
          status: 'pending',
          qr_string: qrString,
          device_id: deviceId,
          expires_at: expiresAt,
        });
      } catch (dbErr) {
        console.warn('Could not insert directly to transactions table:', dbErr);
      }

      // Pre-register key into dedicated Toko Script Key System (strictly bound to this product)
      try {
        await createTokoScriptKey({
          key: cleanKey,
          productId: product.id,
          productTitle: product.title,
          productRawId: getScriptRawId(product),
          role: selectedPackage.name,
          durationDays: selectedPackage.days,
          maxHwid: 1,
          customerName: `Order Web (${cleanKey})`,
          transactionId: txId,
          isLifetime: selectedPackage.days >= 9999,
        });
      } catch (keyErr) {
        console.warn('Could not pre-register toko script key:', keyErr);
      }

      // Tag pending reseller sale (commission will be credited instantly once paid)
      const finalResellerCode = activeReseller?.username || resellerCode || getStoredReferral()?.code;
      if (finalResellerCode) {
        localStorage.setItem(`pending_reseller_order_${txId}`, JSON.stringify({
          resellerCode: finalResellerCode,
          productSource: 'toko_script',
          productId: product.id,
          productTitle: product.title,
          packageName: selectedPackage.name,
          packageDays: selectedPackage.days,
          salePrice: amount,
          buyerKey: cleanKey,
          transactionId: txId,
        }));
      }

      toast({
        title: 'Pesanan Berhasil Dibuat',
        description: `Key ${cleanKey} untuk paket ${selectedPackage.name} siap dibayar via QRIS.`,
      });

      onClose();

      onOpenQris({
        transactionId: txId,
        qr_string: qrString,
        qris_url: qrisUrl,
        totalAmount: amount,
        expiresAt,
        licenseKey: cleanKey,
        packageName: `${product.title} (${selectedPackage.name})`,
        productTitle: product.title,
        productId: getScriptRawId(product),
        days: selectedPackage.days,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Gagal memproses pesanan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-full p-5 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40">
              Order Script
            </span>
            {activeReseller && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium">
                <UserCheck className="w-3 h-3" />
                Mitra: @{activeReseller.username}
              </span>
            )}
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            {product.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Masukkan key yang diinginkan atau buat acak, lalu tentukan paket durasi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Mitra Afiliasi Badge / Input */}
          {activeReseller ? (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-foreground">
                  Mitra Afiliasi: <strong className="text-emerald-400">@{activeReseller.username}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveReseller(null)}
                className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                Ganti
              </button>
            </div>
          ) : showRefInput ? (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-muted/40 border border-border">
              <Input
                value={inputRefCode}
                onChange={(e) => setInputRefCode(e.target.value)}
                placeholder="Username reseller / referral..."
                className="h-8 text-xs rounded-lg"
              />
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  if (!inputRefCode.trim()) return;
                  const acc = await findResellerByCode(inputRefCode);
                  if (acc && acc.isActive) {
                    setActiveReseller({ username: acc.username, name: acc.payoutAccountName || acc.username });
                    setShowRefInput(false);
                    toast({ title: 'Reseller Terhubung!', description: `Mendukung reseller @${acc.username}` });
                  } else {
                    toast({ title: 'Tidak Ditemukan', description: 'Username reseller tidak ditemukan.', variant: 'destructive' });
                  }
                }}
                className="h-8 text-xs px-3 rounded-lg"
              >
                Terapkan
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowRefInput(true)}
              className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors pt-0.5"
            >
              <Tag className="w-3 h-3" />
              Punya kode/link reseller? Klik di sini
            </button>
          )}
          {/* 1. KOLOM KEY CUSTOM / ACAK */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Key Lisensi (Custom / Acak)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateRandomKey}
                className="h-7 px-2.5 text-xs text-primary border-primary/40 hover:bg-primary/10 gap-1 rounded-lg"
              >
                <Dices className="w-3.5 h-3.5" />
                Acak
              </Button>
            </div>
            <div className="relative">
              <Input
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value.toUpperCase());
                  setErrorMsg('');
                }}
                placeholder="Contoh: AXS-MYKEY123"
                className="font-mono text-sm tracking-wider uppercase h-11 bg-background/60 border-primary/30 focus-visible:ring-primary/40 rounded-xl"
                maxLength={24}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Key ini akan otomatis aktif setelah pembayaran QRIS diverifikasi.
            </p>
          </div>

          {/* 2. PILIH PAKET */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Pilih Paket Durasi
            </Label>

            {activePackages.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center border border-dashed rounded-xl">
                Belum ada paket aktif untuk script ini.
              </div>
            ) : (
              <RadioGroup
                value={selectedPackageId}
                onValueChange={setSelectedPackageId}
                className="grid gap-2 max-h-56 overflow-y-auto pr-1"
              >
                {activePackages.map((pkg) => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  const basePrice = pkg.price;

                  return (
                    <label
                      key={pkg.id}
                      htmlFor={`pkg-${pkg.id}`}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/15 shadow-sm shadow-primary/20'
                          : 'border-border/70 bg-card/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={pkg.id} id={`pkg-${pkg.id}`} />
                        <div>
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            {pkg.name}
                            {pkg.days >= 999999 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Permanen
                              </span>
                            )}
                          </div>
                          {pkg.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {pkg.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-extrabold text-primary font-mono">
                          {formatRupiah(basePrice)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {pkg.days >= 999999 ? 'Lifetime' : `${pkg.days} hari`}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-xs">
              {errorMsg}
            </div>
          )}

          {/* TOTAL & SUBMIT BUTTON */}
          <div className="pt-2 border-t border-border/60 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">Total Tagihan:</span>
              <div className="text-right">
                <span className="font-mono text-base font-bold text-primary">
                  {selectedPackage ? formatRupiah(selectedPackage.price) : 'Rp 0'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl h-11 text-xs"
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleProceedPayment}
                disabled={loading || !selectedPackage || !licenseKey.trim()}
                className="flex-1 rounded-xl h-11 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-md shadow-primary/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Bayar via QRIS
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
