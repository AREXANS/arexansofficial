import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResellerAccount,
  ResellerSale,
  CommissionWithdrawal,
} from '@/types/tokoScript';
import {
  getCurrentResellerSession,
  setCurrentResellerSession,
  loginReseller,
  logoutReseller,
  getResellerSales,
  getCommissionWithdrawals,
  requestCommissionPayout,
  createPakasirResellerOrder,
  activatePaidResellerAccount,
  clearAllResellerLogs,
  getTokoScripts,
  RESELLER_REGISTRATION_PRICE,
} from '@/lib/tokoScriptStore';
import { supabase } from '@/integrations/supabase/client';
import GlobalBackground from '@/components/GlobalBackground';
import { QrisImageUploader } from '@/components/QrisImageUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Users,
  LogIn,
  UserPlus,
  Copy,
  Check,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  LogOut,
  ShoppingBag,
  Share2,
  RefreshCw,
  Wallet,
  CheckCircle2,
  Home,
  QrCode,
  Sparkles,
  Lock,
  Eraser,
  Percent,
  Link2,
  MessageCircle,
  ExternalLink,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Reseller: React.FC = () => {
  const navigate = useNavigate();
  const [currentReseller, setCurrentReseller] = useState<ResellerAccount | null>(null);
  const [sales, setSales] = useState<ResellerSale[]>([]);
  const [withdrawals, setWithdrawals] = useState<CommissionWithdrawal[]>([]);
  const [loading, setLoading] = useState(false);

  // Auth tabs & form state
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state (Beli Akun via Pakasir - Upload QRIS murni tanpa textbox)
  const [regUsername, setRegUsername] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPayoutMethod, setRegPayoutMethod] = useState<'QRIS' | 'DANA' | 'SEABANK'>('QRIS');
  const [regAccountNumber, setRegAccountNumber] = useState('');
  const [regAccountName, setRegAccountName] = useState('');
  const [regQrisImage, setRegQrisImage] = useState<string>('');

  // Smart Affiliate & Deep Link generator state
  const [catalogScripts, setCatalogScripts] = useState<any[]>([]);
  const [selectedScriptForLink, setSelectedScriptForLink] = useState<string>('');
  const [copiedMainLink, setCopiedMainLink] = useState(false);
  const [copiedScriptLink, setCopiedScriptLink] = useState(false);
  const [qrisPreviewModalOpen, setQrisPreviewModalOpen] = useState(false);
  const [payoutQrisImage, setPayoutQrisImage] = useState<string>('');

  // Pakasir Payment Modal State
  const [pakasirModalOpen, setPakasirModalOpen] = useState(false);
  const [pakasirOrderData, setPakasirOrderData] = useState<{
    transactionId: string;
    qr_string: string;
    qris_url: string;
    totalAmount: number;
    expiresAt: string;
  } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const pollIntervalRef = useRef<any>(null);

  // Payout dialog state
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [payoutMethod, setPayoutMethod] = useState<'QRIS' | 'DANA' | 'SEABANK' | string>('QRIS');
  const [payoutNumber, setPayoutNumber] = useState('');
  const [payoutName, setPayoutName] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  useEffect(() => {
    const session = getCurrentResellerSession();
    if (session) {
      setCurrentReseller(session);
      loadResellerData(session.id);
    }
    // Load catalog scripts for deep link generator
    getTokoScripts().then((scripts) => {
      const active = (scripts || []).filter((s) => s.isActive);
      setCatalogScripts(active);
      if (active.length > 0) {
        setSelectedScriptForLink(active[0].id);
      }
    });
  }, []);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const loadResellerData = async (resellerId: string) => {
    setLoading(true);
    try {
      const [salesData, wdData] = await Promise.all([
        getResellerSales(resellerId),
        getCommissionWithdrawals(resellerId),
      ]);
      setSales(salesData);
      setWithdrawals(wdData);

      const session = getCurrentResellerSession();
      if (session) {
        setCurrentReseller(session);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      toast({ title: 'Mohon Lengkapi', description: 'Masukkan Username dan Password.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const res = await loginReseller(loginIdentifier, loginPassword);
    setLoading(false);

    if (res.success && res.account) {
      setCurrentReseller(res.account);
      toast({ title: 'Login Berhasil', description: `Selamat datang kembali, @${res.account.username}!` });
      loadResellerData(res.account.id);
    } else {
      toast({ title: 'Login Gagal', description: res.message || 'Periksa kembali data Anda.', variant: 'destructive' });
    }
  };

  // Submit beli akun reseller otomatis Rp 80.000 via Pakasir (Upload QRIS Murni)
  const handlePurchaseResellerPakasir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPhone.trim() || !regPassword.trim() || !regAccountName.trim()) {
      toast({ title: 'Data Belum Lengkap', description: 'Mohon lengkapi username, no. whatsapp, password, dan nama pemilik akun.', variant: 'destructive' });
      return;
    }

    if (regPayoutMethod === 'QRIS' && !regQrisImage) {
      toast({
        title: 'Upload Gambar QRIS Diperlukan',
        description: 'Mohon upload foto gambar QRIS Anda agar developer bisa scan & mentransfer komisi bagi hasil Anda.',
        variant: 'destructive',
      });
      return;
    }

    if (regPayoutMethod !== 'QRIS' && !regAccountNumber.trim()) {
      toast({
        title: 'Nomor Rekening Diperlukan',
        description: `Mohon masukkan nomor akun ${regPayoutMethod} Anda.`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const order = await createPakasirResellerOrder({
        username: regUsername.trim().toLowerCase(),
        phone: regPhone.trim(),
        password: regPassword,
        payoutMethod: regPayoutMethod,
        payoutAccountNumber: regPayoutMethod === 'QRIS' ? 'GAMBAR_QRIS' : regAccountNumber.trim(),
        payoutAccountName: regAccountName.trim(),
        payoutQrisUrl: regPayoutMethod === 'QRIS' ? regQrisImage : undefined,
        commissionPct: 20, // default komisi
        commissionScope: 'both', // default scope semua produk
      });

      if (!order.success || !order.transactionId) {
        toast({ title: 'Gagal Membuat Pesanan', description: order.message || 'Terjadi kesalahan.', variant: 'destructive' });
        return;
      }

      setPakasirOrderData({
        transactionId: order.transactionId,
        qr_string: order.qr_string || '',
        qris_url: order.qris_url || '',
        totalAmount: order.totalAmount || RESELLER_REGISTRATION_PRICE,
        expiresAt: order.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
      setPakasirModalOpen(true);

      // Start automatic polling every 6 seconds
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => {
        checkPakasirPayment(order.transactionId!);
      }, 6000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const checkPakasirPayment = async (orderId: string) => {
    setCheckingPayment(true);
    try {
      // 1. Check via Edge function check-payment
      const res = await supabase.functions.invoke('check-payment', {
        body: { transactionId: orderId },
      });

      if (res.data?.paid) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        const activation = await activatePaidResellerAccount(orderId);
        if (activation.success && activation.account) {
          toast({ title: 'Aktivasi Berhasil!', description: activation.message });
          setPakasirModalOpen(false);
          setPakasirOrderData(null);
          setCurrentReseller(activation.account);
          loadResellerData(activation.account.id);
          return;
        }
      }

      // 2. Also check direct transactions table status
      const { data: tx } = await supabase
        .from('transactions')
        .select('status')
        .eq('transaction_id', orderId)
        .maybeSingle();

      if (tx?.status === 'paid' || tx?.status === 'completed' || tx?.status === 'claimable') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        const activation = await activatePaidResellerAccount(orderId);
        if (activation.success && activation.account) {
          toast({ title: 'Aktivasi Berhasil!', description: activation.message });
          setPakasirModalOpen(false);
          setPakasirOrderData(null);
          setCurrentReseller(activation.account);
          loadResellerData(activation.account.id);
          return;
        }
      }
    } catch (e: any) {
      console.warn('Payment check warning:', e);
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleManualCheckButton = () => {
    if (pakasirOrderData?.transactionId) {
      checkPakasirPayment(pakasirOrderData.transactionId);
    }
  };

  const handleLogout = () => {
    logoutReseller();
    setCurrentReseller(null);
    setSales([]);
    setWithdrawals([]);
    toast({ title: 'Logout Berhasil', description: 'Anda telah keluar dari akun reseller.' });
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const handleOpenPayoutModal = () => {
    if (!currentReseller) return;
    if (currentReseller.activeCommission <= 0) {
      toast({
        title: 'Saldo Masih Kosong',
        description: 'Belum ada komisi bagi hasil yang bisa ditarik.',
        variant: 'destructive',
      });
      return;
    }
    setPayoutAmount(currentReseller.activeCommission);
    setPayoutMethod(currentReseller.payoutMethod || 'QRIS');
    setPayoutNumber(currentReseller.payoutAccountNumber || '');
    setPayoutName(currentReseller.payoutAccountName || currentReseller.username);
    setPayoutQrisImage(currentReseller.payoutQrisUrl || '');
    setPayoutNotes('Pencairan komisi bagi hasil reseller');
    setPayoutModalOpen(true);
  };

  // Execute Commission Payout (Resets balance!)
  const handleConfirmPayout = async () => {
    if (!currentReseller) return;

    if (payoutMethod === 'QRIS' && !payoutQrisImage) {
      toast({
        title: 'Upload Gambar QRIS Wajib',
        description: 'Mohon upload gambar QRIS Anda agar developer bisa scan & mentransfer komisi Anda.',
        variant: 'destructive',
      });
      return;
    }

    if (payoutMethod !== 'QRIS' && !payoutNumber.trim()) {
      toast({
        title: 'Nomor Rekening Wajib',
        description: `Mohon isi nomor akun ${payoutMethod} Anda.`,
        variant: 'destructive',
      });
      return;
    }

    setPayoutSubmitting(true);

    try {
      const res = await requestCommissionPayout({
        resellerId: currentReseller.id,
        amount: payoutAmount,
        payoutMethod,
        accountNumber: payoutMethod === 'QRIS' ? 'GAMBAR_QRIS' : payoutNumber,
        accountName: payoutName,
        notes: payoutNotes,
        qrisImageUrl: payoutMethod === 'QRIS' ? payoutQrisImage : undefined,
      });

      if (res.success && res.updatedAccount) {
        setCurrentReseller(res.updatedAccount);
        toast({
          title: 'Komisi Berhasil Ditarik & Direset!',
          description: res.message,
        });
        setPayoutModalOpen(false);
        loadResellerData(currentReseller.id);
      } else {
        toast({ title: 'Gagal Menarik Komisi', description: res.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPayoutSubmitting(false);
    }
  };

  const handleClearMyLogs = async () => {
    if (!currentReseller) return;
    if (!confirm('Kosongkan semua riwayat penjualan dan penarikan Anda? Saldo komisi dan statistik transaksi Anda akan kembali bersih ke 0.')) {
      return;
    }

    try {
      const res = await clearAllResellerLogs(currentReseller.id);
      if (res.success) {
        toast({ title: 'Log Dikosongkan', description: 'Riwayat catatan Anda telah bersih dikosongkan.' });
        loadResellerData(currentReseller.id);
      }
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-3 md:p-6 bg-background relative overflow-x-hidden">
      <GlobalBackground />

      <div className="max-w-5xl w-full relative z-10 space-y-6">
        {/* Navigation Top Header */}
        <div className="flex items-center justify-between glass-card rounded-2xl px-4 py-3 border-border/80">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition px-2 py-1 rounded-lg hover:bg-primary/10"
            >
              <Home className="w-4 h-4" />
              <span>Halaman Utama</span>
            </button>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs md:text-sm font-bold gradient-text">
                Portal Reseller Arexans
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/?tab=toko')}
              className="text-xs h-8 rounded-xl border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lihat</span> Toko Script
            </Button>
            {currentReseller && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-xs h-8 text-destructive hover:bg-destructive/10 rounded-xl gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </Button>
            )}
          </div>
        </div>

        {/* IF NOT LOGGED IN: SHOW LOGIN / REGISTER (BELI PAKASIR RP 80.000) */}
        {!currentReseller ? (
          <div className="max-w-md mx-auto space-y-6 py-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto text-primary shadow-lg shadow-primary/10">
                <Users className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold font-display text-foreground">
                Kemitraan Reseller Resmi
              </h2>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Bantu jual produk script & tools Arexans. Dapatkan komisi bagi hasil otomatis di setiap pesanan yang Anda bawa!
              </p>
            </div>

            <div className="glass-card rounded-2xl p-6 border-border/80 shadow-2xl">
              <Tabs value={authTab} onValueChange={(v: any) => setAuthTab(v)}>
                <TabsList className="grid grid-cols-2 bg-muted/60 mb-5 p-1 rounded-xl">
                  <TabsTrigger value="login" className="text-xs rounded-lg gap-1.5">
                    <LogIn className="w-3.5 h-3.5" />
                    Masuk Akun
                  </TabsTrigger>
                  <TabsTrigger value="register" className="text-xs rounded-lg gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />
                    Daftar (Beli 80rb)
                  </TabsTrigger>
                </TabsList>

                {/* LOGIN FORM */}
                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Username atau Email</Label>
                      <Input
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="Username reseller Anda"
                        className="h-10 text-xs rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Password</Label>
                      <Input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-10 text-xs rounded-xl"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        'Masuk ke Dashboard Reseller'
                      )}
                    </Button>
                  </form>

                  <div className="pt-3 border-t border-border/60 text-center">
                    <p className="text-[11px] text-muted-foreground">
                      Belum punya akun? Akun dapat dibuat manual oleh Developer lewat <strong>/developer</strong> atau beli otomatis seharga <strong>Rp 80.000</strong> via QRIS Pakasir pada tab Daftar.
                    </p>
                  </div>
                </TabsContent>

                {/* REGISTER FORM (BELI OTOMATIS 80.000 VIA PAKASIR) */}
                <TabsContent value="register" className="space-y-4">
                  <div className="p-3 rounded-xl border border-purple-500/40 bg-purple-950/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Biaya Aktivasi Akun Reseller:
                      </span>
                      <strong className="text-sm font-mono text-purple-300">
                        {formatRupiah(RESELLER_REGISTRATION_PRICE)}
                      </strong>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pembayaran otomatis diverifikasi via QRIS Pakasir. Akun langsung aktif setelah bayar!
                    </p>
                  </div>

                  <form onSubmit={handlePurchaseResellerPakasir} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Username Reseller *</Label>
                        <Input
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                          placeholder="budistore"
                          className="h-9 text-xs rounded-xl"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">No. WhatsApp / HP *</Label>
                        <Input
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="0812xxxxxxxx"
                          className="h-9 text-xs rounded-xl"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Password Akun *</Label>
                      <Input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="h-9 text-xs rounded-xl"
                        required
                      />
                    </div>

                    {/* Payout Info (Wajib QRIS / DANA / SEABANK - QRIS Diutamakan) */}
                    <div className="p-3.5 rounded-xl border border-border/80 bg-card/50 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-primary" />
                          Rekening / E-Wallet Pencairan Komisi:
                        </span>
                        <span className="text-[10px] text-muted-foreground">Wajib QRIS / DANA / SeaBank</span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground block mb-1">Metode Payout Komisi *</Label>
                          <select
                            value={regPayoutMethod}
                            onChange={(e: any) => setRegPayoutMethod(e.target.value)}
                            className="w-full h-9 text-xs rounded-xl bg-background border border-primary/40 px-3 text-foreground font-semibold"
                          >
                            <option value="QRIS">QRIS (Upload Foto QRIS - Paling Mudah)</option>
                            <option value="DANA">DANA (Nomor Akun)</option>
                            <option value="SEABANK">SeaBank (Nomor Rekening)</option>
                          </select>
                        </div>

                        {regPayoutMethod === 'QRIS' ? (
                          <div className="pt-1">
                            <QrisImageUploader
                              value={regQrisImage}
                              onChange={setRegQrisImage}
                              onRemove={() => setRegQrisImage('')}
                              label="Upload Foto / Gambar QRIS Merchant Anda *"
                            />
                            <div className="mt-2.5">
                              <Label className="text-[10px] text-muted-foreground block mb-1">
                                Nama Merchant / Pemilik QRIS *
                              </Label>
                              <Input
                                value={regAccountName}
                                onChange={(e) => setRegAccountName(e.target.value)}
                                placeholder="Contoh: Toko Reseller Alex / Nama Anda"
                                className="h-8 text-xs rounded-lg"
                                required
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <div>
                              <Label className="text-[10px] text-muted-foreground block mb-1">
                                {regPayoutMethod === 'DANA'
                                  ? 'Nomor Akun DANA (08xxxxxxxx) *'
                                  : 'Nomor Rekening SeaBank *'}
                              </Label>
                              <Input
                                value={regAccountNumber}
                                onChange={(e) => setRegAccountNumber(e.target.value)}
                                placeholder={
                                  regPayoutMethod === 'DANA'
                                    ? '08xxxxxxxxxx'
                                    : 'No Rekening SeaBank'
                                }
                                className="h-8 text-xs rounded-lg"
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground block mb-1">
                                Atas Nama Rekening / Pemilik Akun *
                              </Label>
                              <Input
                                value={regAccountName}
                                onChange={(e) => setRegAccountName(e.target.value)}
                                placeholder="Nama pemilik akun pencairan"
                                className="h-8 text-xs rounded-lg"
                                required
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/25 gap-2"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Mempersiapkan QRIS Pakasir...
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          Beli Akun Reseller (Rp 80.000 via Pakasir)
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="text-center text-[10px] text-muted-foreground pt-1">
                    Ingin mendaftar tanpa biaya? Hubungi Developer untuk pembuatan akun manual via <strong>/developer</strong>.
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : (
          /* IF LOGGED IN: RESELLER DASHBOARD (MURNI TANPA LOG SIMULASI) */
          <div className="space-y-6">
            {/* Reseller Banner */}
            <div className="glass-card rounded-2xl p-5 border-border/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Mitra Terverifikasi
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">@{currentReseller.username}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${currentReseller.registeredVia === 'pakasir_purchase' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                    {currentReseller.registeredVia === 'pakasir_purchase' ? 'Beli Pakasir (80rb)' : 'Manual Developer'}
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
                  Halo, @{currentReseller.username}!
                </h2>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    Komisi Anda: <strong className="text-emerald-400 font-bold">{currentReseller.commissionPct || 20}%</strong>
                    <span className="text-[10px] text-muted-foreground/80">(🔒 Diatur saat pembuatan akun)</span>
                  </span>
                  <span>•</span>
                  <span>
                    Cakupan Produk:{' '}
                    <strong className="text-foreground">
                      {currentReseller.commissionScope === 'both'
                        ? 'Toko Script & Arexans Tools'
                        : currentReseller.commissionScope === 'toko_script'
                        ? 'Hanya Toko Script'
                        : 'Hanya Arexans Tools'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadResellerData(currentReseller.id)}
                  disabled={loading}
                  className="text-xs h-9 rounded-xl"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  onClick={handleOpenPayoutModal}
                  size="sm"
                  className="text-xs h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 shadow-md shadow-emerald-500/20"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Tarik Komisi Bagi Hasil
                </Button>
              </div>
            </div>

            {/* RESELLER ACCOUNT & PAYOUT INFORMATION CARD */}
            <div className="glass-card rounded-2xl p-5 border-border/80 bg-card/60 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  Informasi Akun & Rekening Pencairan Komisi Reseller
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30">
                  {currentReseller.payoutMethod || 'QRIS'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-background/60 border border-border/70 space-y-1">
                  <span className="text-[10px] text-muted-foreground block">Metode Pembayaran Payout:</span>
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold">
                      {currentReseller.payoutMethod}
                    </span>
                    {currentReseller.payoutMethod === 'QRIS' && (
                      <span className="text-[10px] text-emerald-400 font-medium">(Upload Foto QRIS)</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-background/60 border border-border/70 space-y-1">
                  <span className="text-[10px] text-muted-foreground block">
                    {currentReseller.payoutMethod === 'QRIS' ? 'Foto Gambar QRIS Reseller:' : 'No. HP / No. Rekening:'}
                  </span>
                  {currentReseller.payoutMethod === 'QRIS' ? (
                    currentReseller.payoutQrisUrl ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={currentReseller.payoutQrisUrl}
                          alt="QRIS Reseller"
                          onClick={() => setQrisPreviewModalOpen(true)}
                          className="w-8 h-8 rounded border border-border object-cover cursor-pointer hover:opacity-80"
                        />
                        <button
                          type="button"
                          onClick={() => setQrisPreviewModalOpen(true)}
                          className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Lihat QRIS
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-400 font-medium">Belum ada gambar QRIS</span>
                    )
                  ) : (
                    <div className="text-xs font-bold font-mono text-foreground break-all">
                      {currentReseller.payoutAccountNumber || '-'}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-background/60 border border-border/70 space-y-1">
                  <span className="text-[10px] text-muted-foreground block">Atas Nama Rekening / Merchant:</span>
                  <div className="text-xs font-bold text-foreground">
                    {currentReseller.payoutAccountName || currentReseller.username}
                  </div>
                </div>
              </div>
            </div>

            {/* PUSAT LINK AFILIASI CERDAS RESELLER (SMART AFFILIATE CENTER) */}
            <div className="glass-card rounded-2xl p-5 border-primary/40 bg-gradient-to-br from-card/95 via-primary/5 to-card/95 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-base text-foreground font-display">
                      Pusat Link Afiliasi & Toko Cerdas Anda
                    </h3>
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-mono">
                      Auto-Tracking 30 Hari
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bagikan link unik Anda. Pembeli tetap checkout & bayar sendiri di web via QRIS — komisi <strong className="text-emerald-400 font-bold">{currentReseller.commissionPct || 20}%</strong> otomatis masuk ke saldo Anda detik itu juga!
                  </p>
                </div>
              </div>

              {/* 1. Main Website Affiliate Link */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-primary" />
                    Link Toko / Beranda Utama:
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">?ref={currentReseller.username}</span>
                </Label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/?ref=${currentReseller.username}`}
                    className="h-9 text-xs font-mono bg-background/80 text-foreground border-border/80 rounded-xl"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}/?ref=${currentReseller.username}`;
                        navigator.clipboard.writeText(url);
                        setCopiedMainLink(true);
                        toast({ title: 'Link Tersalin!', description: 'Link afiliasi utama siap dibagikan.' });
                        setTimeout(() => setCopiedMainLink(false), 2000);
                      }}
                      className={`h-9 px-3 text-xs rounded-xl gap-1.5 flex-1 sm:flex-initial transition-all ${
                        copiedMainLink
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                      }`}
                    >
                      {copiedMainLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedMainLink ? 'Tersalin!' : 'Salin Link'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = `${window.location.origin}/?ref=${currentReseller.username}`;
                        const text = encodeURIComponent(
                          `Halo! Mau beli script Roblox premium resmi & terpercaya? Beli langsung di sini dengan QRIS otomatis instan: ${url}`
                        );
                        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                      }}
                      className="h-9 px-3 text-xs rounded-xl border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1.5 flex-1 sm:flex-initial"
                      title="Bagikan ke WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Share WA
                    </Button>
                  </div>
                </div>
              </div>

              {/* 2. Direct Script Deep Link */}
              {catalogScripts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-secondary" />
                      Link Langsung ke Produk Script Spesifik (Deep Link):
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Langsung membuka script pilihan</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1">
                      <select
                        value={selectedScriptForLink}
                        onChange={(e) => setSelectedScriptForLink(e.target.value)}
                        className="w-full h-9 rounded-xl bg-background border border-border/80 px-2.5 text-foreground text-xs font-semibold"
                      >
                        {catalogScripts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/?ref=${currentReseller.username}&tab=toko&script=${selectedScriptForLink}`}
                        className="h-9 text-xs font-mono bg-background/80 text-foreground border-border/80 rounded-xl"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const url = `${window.location.origin}/?ref=${currentReseller.username}&tab=toko&script=${selectedScriptForLink}`;
                          navigator.clipboard.writeText(url);
                          setCopiedScriptLink(true);
                          toast({ title: 'Link Script Tersalin!', description: 'Link produk siap dipromosikan.' });
                          setTimeout(() => setCopiedScriptLink(false), 2000);
                        }}
                        className={`h-9 px-3 text-xs rounded-xl gap-1.5 flex-shrink-0 ${
                          copiedScriptLink ? 'bg-emerald-600 text-white' : ''
                        }`}
                      >
                        {copiedScriptLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedScriptLink ? 'Tersalin!' : 'Salin'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Cara Kerja Sistem Afiliasi Otomatis */}
              <div className="p-3 rounded-xl bg-background/50 border border-border/70 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <strong className="text-foreground block">Sebarkan Link</strong>
                    <span className="text-muted-foreground text-[10px]">Promosikan ke TikTok, WA, atau YouTube</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <strong className="text-foreground block">Auto-Tracking</strong>
                    <span className="text-muted-foreground text-[10px]">Tersimpan di browser buyer selama 30 hari</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <strong className="text-foreground block">Pembeli Bayar</strong>
                    <span className="text-muted-foreground text-[10px]">Buyer scan QRIS otomatis sendiri di web</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <strong className="text-emerald-400 block">Komisi Masuk!</strong>
                    <span className="text-muted-foreground text-[10px]">Saldo {currentReseller.commissionPct || 20}% cair realtime</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 STATS CARDS (Total Penjualan, Komisi Bagi Hasil Aktif, Total Ditarik) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Total Penjualan */}
              <div className="glass-card rounded-2xl p-5 border-border/80 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Total Penjualan Script
                  </span>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {formatRupiah(currentReseller.totalSalesAmount)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 flex items-center justify-between">
                  <span>Total Transaksi Berhasil:</span>
                  <strong className="text-foreground">{currentReseller.totalSalesCount} Pesanan</strong>
                </div>
              </div>

              {/* 2. Komisi Bagi Hasil Aktif (Siap Ditarik & Akan Direset jika Ditarik) */}
              <div className="glass-card rounded-2xl p-5 border-emerald-500/40 bg-emerald-950/20 flex flex-col justify-between space-y-3 relative overflow-hidden">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      Komisi Bagi Hasil Aktif
                    </span>
                    {currentReseller.activeCommission > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                        Siap Ditarik
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {formatRupiah(currentReseller.activeCommission)}
                  </div>
                </div>
                <div className="border-t border-emerald-500/30 pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-300/80">
                    Reset otomatis saat berhasil ditarik
                  </span>
                  <button
                    onClick={handleOpenPayoutModal}
                    disabled={currentReseller.activeCommission <= 0}
                    className="text-xs font-bold text-emerald-300 hover:text-white underline disabled:opacity-50"
                  >
                    Tarik Sekarang &rarr;
                  </button>
                </div>
              </div>

              {/* 3. Total Komisi Sudah Ditarik */}
              <div className="glass-card rounded-2xl p-5 border-border/80 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    Total Komisi Sudah Dicairkan
                  </span>
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    {formatRupiah(currentReseller.totalWithdrawnCommission)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 flex items-center justify-between">
                  <span>Rekening Tujuan:</span>
                  <span className="text-foreground font-medium">
                    {currentReseller.payoutMethod} ({currentReseller.payoutAccountNumber})
                  </span>
                </div>
              </div>
            </div>

            {/* TABLES: SALES HISTORY & WITHDRAWAL HISTORY */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sales History */}
              <div className="glass-card rounded-2xl border border-border/80 overflow-hidden">
                <div className="p-4 border-b border-border/60 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                      Riwayat Penjualan Anda
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Daftar transaksi dan penjualan akun reseller Anda.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sales.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleClearMyLogs}
                        className="text-[11px] h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1"
                      >
                        <Eraser className="w-3 h-3" />
                        Kosongkan Riwayat
                      </Button>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {sales.length} Penjualan
                    </Badge>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b border-border sticky top-0">
                      <tr>
                        <th className="text-left p-3">Tanggal / Produk</th>
                        <th className="text-right p-3">Harga Jual</th>
                        <th className="text-right p-3">Komisi Anda</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sales.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-muted-foreground">
                            Belum ada riwayat penjualan (Log Bersih / Dikosongkan).
                          </td>
                        </tr>
                      ) : (
                        sales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-muted/20">
                            <td className="p-3">
                              <div className="font-bold text-foreground">{sale.productTitle}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                <span>Paket: {sale.packageName}</span>
                                <span>•</span>
                                <span>{new Date(sale.createdAt).toLocaleDateString('id-ID')}</span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono font-medium">
                              {formatRupiah(sale.salePrice)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">
                              +{formatRupiah(sale.commissionAmount)}
                              <span className="block text-[9px] text-muted-foreground">
                                ({sale.commissionPct}%)
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Commission Withdrawal History */}
              <div className="glass-card rounded-2xl border border-border/80 overflow-hidden">
                <div className="p-4 border-b border-border/60 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      Riwayat Pengambilan Komisi
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Setiap pengambilan berhasil, saldo komisi aktif direset ulang ke Rp 0.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {withdrawals.length} Penarikan
                  </Badge>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b border-border sticky top-0">
                      <tr>
                        <th className="text-left p-3">Tanggal</th>
                        <th className="text-right p-3">Nominal Ditarik</th>
                        <th className="text-left p-3">Tujuan</th>
                        <th className="text-center p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {withdrawals.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-muted-foreground">
                            Belum ada riwayat penarikan komisi (Log Bersih / Dikosongkan).
                          </td>
                        </tr>
                      ) : (
                        withdrawals.map((w) => (
                          <tr key={w.id} className="hover:bg-muted/20">
                            <td className="p-3 text-muted-foreground">
                              {new Date(w.requestedAt).toLocaleDateString('id-ID')}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">
                              {formatRupiah(w.amount)}
                            </td>
                            <td className="p-3">
                              <span className="font-semibold">{w.payoutMethod}</span>
                              <div className="text-[10px] text-muted-foreground">{w.accountNumber}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                                Selesai (Direset)
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL PEMBAYARAN PAKASIR QRIS (RP 80.000) UNTUK AKTIVASI RESELLER */}
      <Dialog
        open={pakasirModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPakasirModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-sm p-6 bg-card/95 backdrop-blur-2xl border-border/80 rounded-2xl shadow-2xl text-center">
          <DialogHeader className="space-y-1">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mx-auto text-purple-400">
              <QrCode className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Pembayaran Akun Reseller
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Scan QRIS Pakasir di bawah ini untuk mengaktifkan akun reseller Anda secara instan.
            </DialogDescription>
          </DialogHeader>

          {pakasirOrderData && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-center">
                <span className="text-[11px] text-purple-300 block">Total Pembayaran:</span>
                <span className="text-xl font-bold font-mono text-purple-400">
                  {formatRupiah(pakasirOrderData.totalAmount)}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  ID: {pakasirOrderData.transactionId}
                </span>
              </div>

              {/* QRIS Code Image */}
              <div className="bg-white p-3 rounded-xl inline-block mx-auto shadow-md">
                <img
                  src={pakasirOrderData.qris_url}
                  alt="QRIS Pakasir"
                  className="w-52 h-52 object-contain mx-auto"
                />
              </div>

              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>Support semua e-wallet & mobile banking (BCA, DANA, GoPay, OVO, ShopeePay, Mandiri, BRI, dll).</p>
                <div className="flex items-center justify-center gap-1.5 text-primary text-[10px] pt-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Mengecek pembayaran otomatis setiap 6 detik...</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  onClick={handleManualCheckButton}
                  disabled={checkingPayment}
                  className="w-full text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground h-10 shadow-md shadow-primary/20 gap-1.5"
                >
                  {checkingPayment ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Memeriksa...
                    </>
                  ) : (
                    'Saya Sudah Bayar (Cek Sekarang)'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setPakasirModalOpen(false);
                  }}
                  className="text-xs h-9 rounded-xl"
                >
                  Tutup / Batalkan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL PENGAMBILAN KOMISI BAGI HASIL */}
      <Dialog open={payoutModalOpen} onOpenChange={setPayoutModalOpen}>
        <DialogContent className="max-w-md p-5 bg-card/95 backdrop-blur-2xl border-border/80 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              Tarik Komisi Bagi Hasil dengan Developer
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Setiap kali pengambilan komisi berhasil, saldo komisi aktif akan langsung di-reset ulang ke Rp 0.
            </DialogDescription>
          </DialogHeader>

          {currentReseller && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                <span className="text-[11px] text-emerald-300">Komisi Tersedia yang Akan Dicairkan:</span>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {formatRupiah(currentReseller.activeCommission)}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Metode Transfer Payout (Wajib QRIS/DANA/SeaBank)</Label>
                  <select
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value)}
                    className="w-full h-9 rounded-xl bg-background border border-primary/40 px-3 text-foreground text-xs font-semibold"
                  >
                    <option value="QRIS">QRIS (Upload Foto QRIS - Paling Cepat & Mudah)</option>
                    <option value="DANA">DANA (Nomor Akun)</option>
                    <option value="SEABANK">SeaBank (Nomor Rekening)</option>
                  </select>
                </div>

                {payoutMethod === 'QRIS' ? (
                  <div className="space-y-2 pt-1">
                    <QrisImageUploader
                      value={payoutQrisImage}
                      onChange={setPayoutQrisImage}
                      onRemove={() => setPayoutQrisImage('')}
                      label="Foto / Gambar QRIS Penerima Komisi *"
                    />
                    <div>
                      <Label className="text-xs font-semibold">Nama Merchant / Pemilik QRIS *</Label>
                      <Input
                        value={payoutName}
                        onChange={(e) => setPayoutName(e.target.value)}
                        placeholder="Nama pemilik QRIS"
                        className="h-9 text-xs rounded-xl mt-1"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        {payoutMethod === 'DANA' ? 'No. HP DANA *' : 'No. Rekening SeaBank *'}
                      </Label>
                      <Input
                        value={payoutNumber}
                        onChange={(e) => setPayoutNumber(e.target.value)}
                        placeholder={payoutMethod === 'DANA' ? '081234567890' : 'No Rekening'}
                        className="h-9 text-xs rounded-xl"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Atas Nama Rekening *</Label>
                      <Input
                        value={payoutName}
                        onChange={(e) => setPayoutName(e.target.value)}
                        placeholder="Nama Penerima"
                        className="h-9 text-xs rounded-xl"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Pesan / Catatan untuk Developer</Label>
                  <Input
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    placeholder="Contoh: Mohon scan QRIS saya, terima kasih!"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayoutModalOpen(false)}
                  disabled={payoutSubmitting}
                  className="flex-1 rounded-xl text-xs h-10"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmPayout}
                  disabled={payoutSubmitting || currentReseller.activeCommission <= 0}
                  className="flex-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white h-10 shadow-md shadow-emerald-500/20"
                >
                  {payoutSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Klaim & Reset Komisi'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL ZOOM PREVIEW GAMBAR QRIS RESELLER */}
      <Dialog open={qrisPreviewModalOpen} onOpenChange={setQrisPreviewModalOpen}>
        <DialogContent className="max-w-sm p-5 bg-card/95 backdrop-blur-2xl border-border/80 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              Gambar QRIS Terdaftar (@{currentReseller?.username})
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 bg-white rounded-xl flex items-center justify-center">
            {currentReseller?.payoutQrisUrl ? (
              <img
                src={currentReseller.payoutQrisUrl}
                alt="QRIS Reseller"
                className="max-h-[300px] w-auto object-contain rounded"
              />
            ) : (
              <div className="text-xs text-muted-foreground p-8 text-center">
                Belum ada gambar QRIS yang di-upload.
              </div>
            )}
          </div>
          <div className="text-center text-[10px] text-muted-foreground">
            Gambar QRIS ini digunakan developer saat mentransfer komisi bagi hasil Anda.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reseller;
