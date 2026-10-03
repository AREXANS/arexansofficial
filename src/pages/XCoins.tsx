import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GlobalBackground from '@/components/GlobalBackground';
import { 
  Coins, Send, ArrowUpCircle, ArrowDownCircle, Trophy, History, 
  LogOut, ArrowLeft, Wallet, RefreshCw, Eye, EyeOff, Copy, ChevronRight,
  Search, Package, CheckCircle, XCircle, Gift, Clock
} from 'lucide-react';

const XCOINS_SESSION_KEY = 'xcoins_session';

interface XCoinsUser {
  id: string;
  phone: string;
  display_name: string;
  balance: number;
}

interface XCoinsTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string;
  created_at: string;
}

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  phone: string;
  balance: number;
  isMe: boolean;
}

const XCoinsPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<XCoinsUser | null>(null);
  const [authStep, setAuthStep] = useState<'phone' | 'pin' | 'otp' | 'create-pin'>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [cleanedPhone, setCleanedPhone] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(true);

  // Dashboard state
  const [transactions, setTransactions] = useState<XCoinsTransaction[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [txSearch, setTxSearch] = useState('');
  const [txDetailId, setTxDetailId] = useState<string | null>(null);
  const [visibleRefs, setVisibleRefs] = useState<Set<string>>(new Set());
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');

  // Top-up state
  const [topupAmount, setTopupAmount] = useState('');
  const [topupPayment, setTopupPayment] = useState<{transactionId: string; qris_url: string; totalAmount: number; expiresAt: string} | null>(null);
  const topupInterval = useRef<number | null>(null);

  // Transfer state
  const [transferPhone, setTransferPhone] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPin, setTransferPin] = useState('');

  const normalizePhone = useCallback((rawPhone: string) => {
    const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 10) return '';
    if (digitsOnly.startsWith('0')) return `62${digitsOnly.slice(1)}`;
    if (digitsOnly.startsWith('62')) return digitsOnly;
    return `62${digitsOnly}`;
  }, []);

  // Restore session
  useEffect(() => {
    const stored = localStorage.getItem(XCOINS_SESSION_KEY);
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUser(u);
      } catch { localStorage.removeItem(XCOINS_SESSION_KEY); }
    }
  }, []);

  useEffect(() => {
    if (user) loadDashboardData();
  }, [user?.id]);

  const loadDashboardData = async () => {
    if (!user) return;
    const res = await supabase.functions.invoke('xcoins-balance', { body: { userId: user.id } });
    if (res.data?.success) {
      setUser(prev => prev ? { ...prev, balance: res.data.user.balance } : null);
      setTransactions(res.data.transactions);
      setLeaderboard(res.data.leaderboard);
      localStorage.setItem(XCOINS_SESSION_KEY, JSON.stringify({ ...user, balance: res.data.user.balance }));
    }
  };

  // Step 1: Check phone number
  const handleCheckPhone = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      toast({ title: 'Error', description: 'Masukkan nomor WhatsApp yang valid', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setOtp('');
    setPin('');
    setOtpVerified(false);

    const res = await supabase.functions.invoke('xcoins-send-otp', { body: { phone: normalizedPhone } });
    if (res.data?.success) {
      setCleanedPhone(res.data.phone);
      if (res.data.exists) {
        // Existing user → enter PIN
        setAuthStep('pin');
      } else {
        // New user → OTP sent, verify
        setAuthStep('otp');
        toast({ title: 'OTP Terkirim!', description: 'Cek WhatsApp Anda' });
      }
    } else {
      toast({ title: 'Error', description: res.data?.error || 'Gagal memproses', variant: 'destructive' });
    }
    setLoading(false);
  };

  // Step 2a: Login with PIN (existing user)
  const handleLogin = async () => {
    if (!pin || pin.length !== 6) {
      toast({ title: 'Error', description: 'PIN harus 6 digit', variant: 'destructive' });
      return;
    }

    const normalizedPhone = cleanedPhone || normalizePhone(phone);
    if (!normalizedPhone) {
      toast({ title: 'Error', description: 'Nomor WhatsApp tidak valid', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const res = await supabase.functions.invoke('xcoins-login', { body: { phone: normalizedPhone, pin } });
    if (res.data?.success) {
      setUser(res.data.user);
      localStorage.setItem(XCOINS_SESSION_KEY, JSON.stringify(res.data.user));
      toast({ title: 'Login berhasil!' });
    } else {
      toast({ title: 'Error', description: res.data?.error || 'PIN salah', variant: 'destructive' });
    }
    setLoading(false);
  };

  // Step 2b: Verify OTP (new user)
  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      toast({ title: 'Error', description: 'Masukkan kode OTP 6 digit', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const res = await supabase.functions.invoke('xcoins-verify-otp', { body: { phone: cleanedPhone, otp } });
    if (res.data?.success) {
      setOtpVerified(true);
      setAuthStep('create-pin');
      toast({ title: 'OTP valid', description: 'Sekarang buat PIN baru Anda' });
    } else {
      toast({ title: 'Error', description: res.data?.error || 'OTP tidak valid', variant: 'destructive' });
    }
    setLoading(false);
  };

  // Step 3: Register with verified OTP + PIN (new user)
  const handleRegister = async () => {
    if (!otpVerified) {
      toast({ title: 'Error', description: 'Verifikasi OTP terlebih dahulu', variant: 'destructive' });
      return;
    }

    if (!pin || pin.length !== 6) {
      toast({ title: 'Error', description: 'PIN harus 6 digit', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const res = await supabase.functions.invoke('xcoins-register', { body: { phone: cleanedPhone, otp, pin } });
    if (res.data?.success) {
      setUser(res.data.user);
      localStorage.setItem(XCOINS_SESSION_KEY, JSON.stringify(res.data.user));
      toast({ title: 'Akun berhasil dibuat!' });
    } else {
      toast({ title: 'Error', description: res.data?.error || 'Gagal membuat akun', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(XCOINS_SESSION_KEY);
    setUser(null);
    setPhone('');
    setPin('');
    setOtp('');
    setCleanedPhone('');
    setOtpVerified(false);
    setAuthStep('phone');
  };

  // Top-up
  const handleTopup = async () => {
    const amt = parseInt(topupAmount);
    if (!amt || amt < 1000) { toast({ title: 'Error', description: 'Minimal top-up Rp 1.000', variant: 'destructive' }); return; }
    setLoading(true);
    const res = await supabase.functions.invoke('xcoins-topup', { body: { userId: user!.id, amount: amt } });
    if (res.data?.success) {
      setTopupPayment(res.data);
      startTopupPolling(res.data.transactionId);
    } else {
      toast({ title: 'Error', description: res.data?.error || 'Gagal membuat top-up', variant: 'destructive' });
    }
    setLoading(false);
  };

  const startTopupPolling = (txId: string) => {
    if (topupInterval.current) clearInterval(topupInterval.current);
    topupInterval.current = window.setInterval(async () => {
      const res = await supabase.functions.invoke('xcoins-check-topup', { body: { transactionId: txId, userId: user!.id } });
      if (res.data?.paid) {
        if (topupInterval.current) clearInterval(topupInterval.current);
        setTopupPayment(null);
        setTopupAmount('');
        setUser(prev => prev ? { ...prev, balance: res.data.balance } : null);
        localStorage.setItem(XCOINS_SESSION_KEY, JSON.stringify({ ...user, balance: res.data.balance }));
        toast({ title: '🎉 Top-up Berhasil!', description: `+${res.data.added} XCoins telah ditambahkan` });
        loadDashboardData();
      } else if (res.data?.expired) {
        if (topupInterval.current) clearInterval(topupInterval.current);
        setTopupPayment(null);
        toast({ title: 'Expired', description: 'Pembayaran telah kadaluarsa', variant: 'destructive' });
      }
    }, 3000);
  };

  useEffect(() => { return () => { if (topupInterval.current) clearInterval(topupInterval.current); }; }, []);

  // Transfer
  const handleTransfer = async () => {
    const amt = parseInt(transferAmount);
    if (!transferPhone || !amt || !transferPin) {
      toast({ title: 'Error', description: 'Isi semua field', variant: 'destructive' }); return;
    }
    setLoading(true);
    const res = await supabase.functions.invoke('xcoins-transfer', { body: { senderId: user!.id, recipientPhone: transferPhone, amount: amt, pin: transferPin } });
    if (res.data?.success) {
      toast({ title: '✅ Transfer Berhasil!', description: `${amt} XCoins ke ${res.data.recipient.display_name}` });
      setUser(prev => prev ? { ...prev, balance: res.data.newBalance } : null);
      setTransferPhone(''); setTransferAmount(''); setTransferPin('');
      loadDashboardData();
    } else {
      toast({ title: 'Error', description: res.data?.error || 'Gagal transfer', variant: 'destructive' });
    }
    setLoading(false);
  };

  const formatRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  const formatCoins = (n: number) => new Intl.NumberFormat('id-ID').format(n);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const censorText = (text: string) => '•'.repeat(text.length);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Disalin!', description: `${label} berhasil disalin` });
  };

  const toggleRefVisibility = (id: string) => {
    setVisibleRefs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'topup': return <ArrowDownCircle className="w-4 h-4 text-success" />;
      case 'purchase': return <ArrowUpCircle className="w-4 h-4 text-destructive" />;
      case 'transfer_out': return <Send className="w-4 h-4 text-warning" />;
      case 'transfer_in': return <ArrowDownCircle className="w-4 h-4 text-primary" />;
      default: return <Coins className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'topup': return 'Deposit';
      case 'purchase': return 'Pembelian';
      case 'transfer_out': return 'Transfer Keluar';
      case 'transfer_in': return 'Transfer Masuk';
      default: return type;
    }
  };

  const getTypeBadgeStyle = (type: string) => {
    switch (type) {
      case 'topup': return 'bg-success/20 text-success border-success/30';
      case 'purchase': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'transfer_out': return 'bg-warning/20 text-warning border-warning/30';
      case 'transfer_in': return 'bg-primary/20 text-primary border-primary/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredTx = useMemo(() => {
    let list = transactions;
    if (txTypeFilter !== 'all') {
      list = list.filter(tx => tx.type === txTypeFilter);
    }
    if (!txSearch.trim()) return list;
    const q = txSearch.toLowerCase();
    return list.filter(tx =>
      getTypeLabel(tx.type).toLowerCase().includes(q) ||
      (tx.description && tx.description.toLowerCase().includes(q)) ||
      (tx.reference_id && tx.reference_id.toLowerCase().includes(q))
    );
  }, [transactions, txSearch, txTypeFilter]);

  const txTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: transactions.length };
    transactions.forEach(tx => { counts[tx.type] = (counts[tx.type] || 0) + 1; });
    return counts;
  }, [transactions]);

  const typeFilterButtons = [
    { key: 'all', label: 'Semua', icon: <Coins className="w-3 h-3" /> },
    { key: 'topup', label: 'Deposit', icon: <ArrowDownCircle className="w-3 h-3" /> },
    { key: 'purchase', label: 'Beli', icon: <ArrowUpCircle className="w-3 h-3" /> },
    { key: 'transfer_out', label: 'Kirim', icon: <Send className="w-3 h-3" /> },
    { key: 'transfer_in', label: 'Terima', icon: <ArrowDownCircle className="w-3 h-3" /> },
  ];

  // Auth screens
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <GlobalBackground />
        <Card className="w-full max-w-md z-10 glass-card">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-10 h-10 rounded-full object-cover border-2 border-primary/50 shadow-lg" />
              <CardTitle className="font-display text-2xl gradient-text">XCoins</CardTitle>
            </div>
            <CardDescription>
              {authStep === 'phone' ? 'Masukkan nomor WhatsApp Anda' : 
               authStep === 'pin' ? 'Masukkan PIN Anda' : 
               authStep === 'otp' ? 'Verifikasi kode OTP' : 'Buat PIN baru'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authStep === 'phone' && (
              <>
                <div>
                  <label className="text-sm text-muted-foreground">Nomor WhatsApp</label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="bg-background/50 mt-1" onKeyDown={e => e.key === 'Enter' && handleCheckPhone()} />
                </div>
                <Button className="w-full" onClick={handleCheckPhone} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                  Lanjutkan
                </Button>
              </>
            )}

            {authStep === 'pin' && (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  Nomor: <span className="text-foreground font-mono">{cleanedPhone}</span>
                </p>
                <div>
                  <label className="text-sm text-muted-foreground">PIN (6 digit)</label>
                  <Input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="bg-background/50 mt-1 text-center tracking-[0.5em] font-mono text-lg" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
                <Button className="w-full" onClick={handleLogin} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Coins className="w-4 h-4 mr-2" />}
                  Login
                </Button>
                <button
                  className="text-sm text-muted-foreground hover:underline w-full text-center"
                  onClick={() => {
                    setAuthStep('phone');
                    setPin('');
                    setOtp('');
                    setCleanedPhone('');
                    setOtpVerified(false);
                  }}
                >
                  Ganti nomor
                </button>
              </>
            )}

            {authStep === 'otp' && (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  OTP telah dikirim ke <span className="text-foreground font-mono">{cleanedPhone}</span>
                </p>
                <div>
                  <label className="text-sm text-muted-foreground">Kode OTP</label>
                  <Input maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="bg-background/50 mt-1 text-center tracking-[0.5em] font-mono text-lg" onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()} />
                </div>
                <Button className="w-full" onClick={handleVerifyOtp} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                  Verifikasi OTP
                </Button>
                <button
                  className="text-sm text-muted-foreground hover:underline w-full text-center"
                  onClick={() => {
                    setAuthStep('phone');
                    setOtp('');
                    setPin('');
                    setCleanedPhone('');
                    setOtpVerified(false);
                  }}
                >
                  Kirim ulang / Ganti nomor
                </button>
              </>
            )}

            {authStep === 'create-pin' && (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  Buat PIN untuk akun <span className="text-foreground font-mono">{cleanedPhone}</span>
                </p>
                <div>
                  <label className="text-sm text-muted-foreground">Buat PIN (6 digit)</label>
                  <Input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="bg-background/50 mt-1 text-center tracking-[0.5em] font-mono text-lg" onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                </div>
                <Button className="w-full" onClick={handleRegister} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Coins className="w-4 h-4 mr-2" />}
                  Buat Akun
                </Button>
              </>
            )}

            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Toko
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <GlobalBackground />
      <div className="relative z-10 p-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-7 h-7 rounded-full object-cover" />
            <span className="font-display text-lg gradient-text">XCoins</span>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Card */}
        <Card className="glass-card mb-4 glow-cyan overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Saldo XCoins</span>
              <button onClick={() => setShowBalance(!showBalance)}>
                {showBalance ? <Eye className="w-4 h-4 text-muted-foreground" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-7 h-7 rounded-full object-cover" />
              <span className="text-3xl font-display font-bold text-foreground">
                {showBalance ? formatCoins(user.balance) : '•••••'}
              </span>
              <span className="text-sm text-muted-foreground">XCoins</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {user.display_name} • {user.phone}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={() => setActiveTab('topup')} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                <Wallet className="w-5 h-5 text-primary" />
                <span className="text-xs text-foreground">Top Up</span>
              </button>
              <button onClick={() => setActiveTab('transfer')} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                <Send className="w-5 h-5 text-secondary" />
                <span className="text-xs text-foreground">Transfer</span>
              </button>
              <button onClick={() => setActiveTab('leaderboard')} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-warning/10 hover:bg-warning/20 transition-colors">
                <Trophy className="w-5 h-5 text-warning" />
                <span className="text-xs text-foreground">Ranking</span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-muted/50">
            <TabsTrigger value="dashboard" className="flex-1 text-xs"><History className="w-4 h-4 mr-1" />Riwayat</TabsTrigger>
            <TabsTrigger value="topup" className="flex-1 text-xs"><Wallet className="w-4 h-4 mr-1" />Top Up</TabsTrigger>
            <TabsTrigger value="transfer" className="flex-1 text-xs"><Send className="w-4 h-4 mr-1" />Transfer</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1 text-xs"><Trophy className="w-4 h-4 mr-1" />Ranking</TabsTrigger>
          </TabsList>

          {/* History Tab */}
          <TabsContent value="dashboard" className="mt-4 space-y-3">
            {/* Header + Refresh */}
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">Riwayat Transaksi</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadDashboardData}><RefreshCw className="w-4 h-4" /></Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Cari transaksi, ref ID..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="pl-9 h-9 text-sm bg-muted/40 border-border/60 rounded-xl" />
            </div>

            {/* Type Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {typeFilterButtons.map(f => (
                <button key={f.key} onClick={() => setTxTypeFilter(f.key)}
                  className={`shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-200 ${
                    txTypeFilter === f.key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                      : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground'
                  }`}>
                  {f.icon} {f.label}
                  {(txTypeCounts[f.key] || 0) > 0 && (
                    <span className={`ml-0.5 text-[10px] ${txTypeFilter === f.key ? 'opacity-80' : 'opacity-50'}`}>
                      {txTypeCounts[f.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Transaction List */}
            {filteredTx.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{txSearch || txTypeFilter !== 'all' ? 'Tidak ditemukan' : 'Belum ada transaksi'}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{txSearch ? 'Coba kata kunci lain' : 'Transaksi akan muncul di sini'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTx.map(tx => {
                  const isPositive = tx.amount >= 0;
                  const isExpanded = txDetailId === tx.id;
                  return (
                    <div key={tx.id} className={`rounded-xl border transition-all duration-200 overflow-hidden ${isExpanded ? 'border-primary/30 bg-primary/[0.02]' : 'border-border/50 bg-card/50 hover:border-border'}`}>
                      {/* Main Row — clickable to toggle detail */}
                      <button className="w-full p-3.5 text-left" onClick={() => setTxDetailId(isExpanded ? null : tx.id)}>
                        <div className="flex items-center gap-3">
                          {/* Icon */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            tx.type === 'topup' ? 'bg-success/10' :
                            tx.type === 'purchase' ? 'bg-destructive/10' :
                            tx.type === 'transfer_out' ? 'bg-warning/10' :
                            tx.type === 'transfer_in' ? 'bg-primary/10' : 'bg-muted'
                          }`}>
                            {getTypeIcon(tx.type)}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">{getTypeLabel(tx.type)}</span>
                              <span className={`text-sm font-mono font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                                {isPositive ? '+' : ''}{formatCoins(tx.amount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-muted-foreground">{formatDate(tx.created_at)}</span>
                              <span className="text-[11px] text-muted-foreground font-mono">Saldo: {formatCoins(tx.balance_after)}</span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="px-3.5 pb-3.5 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                          {/* Description — for purchase: split label & keysistem */}
                          {tx.description && tx.type === 'purchase' && (() => {
                            const parts = tx.description.split(' - ');
                            const label = parts.length > 1 ? parts.slice(0, -1).join(' - ') : '';
                            const keyPart = parts.length > 1 ? parts[parts.length - 1] : tx.description;
                            return (
                              <div className="space-y-1.5">
                                {label && <p className="text-xs text-muted-foreground">{label}</p>}
                                <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg">
                                  <code className="flex-1 font-mono text-xs text-foreground truncate">
                                    {visibleRefs.has(tx.id) ? keyPart : censorText(keyPart)}
                                  </code>
                                  <button onClick={(e) => { e.stopPropagation(); toggleRefVisibility(tx.id); }} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                    {visibleRefs.has(tx.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                          {tx.description && tx.type !== 'purchase' && (
                            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg">
                              <code className="flex-1 font-mono text-xs text-foreground truncate">{tx.description}</code>
                            </div>
                          )}

                          {/* Detail Grid */}
                          <div className="bg-muted/20 rounded-lg border border-border/40 divide-y divide-border/30">
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-[11px] text-muted-foreground">Tipe</span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${getTypeBadgeStyle(tx.type)}`}>{getTypeLabel(tx.type)}</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-[11px] text-muted-foreground">Jumlah</span>
                              <span className={`text-[11px] font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>{isPositive ? '+' : ''}{formatCoins(tx.amount)} XCoins</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-[11px] text-muted-foreground">Saldo Setelah</span>
                              <span className="text-[11px] font-medium text-foreground">{formatCoins(tx.balance_after)} XCoins</span>
                            </div>
                            {tx.reference_id && (
                              <div className="flex justify-between items-center px-3 py-2">
                                <span className="text-[11px] text-muted-foreground">Ref ID</span>
                                <code className="text-[11px] font-mono text-foreground truncate max-w-[180px]">{tx.reference_id}</code>
                              </div>
                            )}
                            <div className="flex justify-between px-3 py-2">
                              <span className="text-[11px] text-muted-foreground">Waktu</span>
                              <span className="text-[11px] text-foreground">{formatDate(tx.created_at)}</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            {tx.reference_id && (
                              <button onClick={(e) => { e.stopPropagation(); copyText(tx.reference_id, 'TX ID'); }}
                                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60 transition-colors">
                                <Copy className="w-3 h-3" /> TX ID
                              </button>
                            )}
                            {tx.description && (
                              <button onClick={(e) => { e.stopPropagation(); copyText(tx.description, 'Deskripsi'); }}
                                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors">
                                <Copy className="w-3 h-3" /> SALIN
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Top-up Tab */}
          <TabsContent value="topup" className="mt-4 space-y-4">
            {topupPayment ? (
              <Card className="glass-card">
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-lg font-display">Scan QRIS untuk Top Up</CardTitle>
                  <CardDescription>{formatRp(topupPayment.totalAmount)} = {formatCoins(topupPayment.totalAmount)} XCoins</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-center">
                    <img src={topupPayment.qris_url} alt="QRIS" className="w-64 h-64 rounded-lg bg-white p-2" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground animate-pulse-slow">Menunggu pembayaran...</p>
                    <p className="text-xs text-muted-foreground mt-1">ID: {topupPayment.transactionId}</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { 
                    if (topupInterval.current) clearInterval(topupInterval.current);
                    setTopupPayment(null); 
                  }}>
                    Batalkan
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-display"><Wallet className="w-5 h-5 text-primary" />Top Up XCoins</CardTitle>
                  <CardDescription>1 Rupiah = 1 XCoin</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[5000, 10000, 25000, 50000, 100000, 200000].map(amt => (
                      <button key={amt} onClick={() => setTopupAmount(amt.toString())} 
                        className={`p-3 rounded-lg border text-center transition-colors text-sm ${topupAmount === amt.toString() ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background/50 hover:border-primary/50'}`}>
                        {formatCoins(amt)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Atau masukkan jumlah</label>
                    <Input type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="Minimal 1000" className="bg-background/50 mt-1" />
                  </div>
                  {topupAmount && parseInt(topupAmount) >= 1000 && (
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <span className="text-sm text-muted-foreground">Anda akan mendapatkan</span>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-5 h-5 rounded-full object-cover" />
                        <span className="text-xl font-display font-bold text-primary">{formatCoins(parseInt(topupAmount))}</span>
                        <span className="text-sm text-muted-foreground">XCoins</span>
                      </div>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleTopup} disabled={loading || !topupAmount || parseInt(topupAmount) < 1000}>
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
                    Top Up via QRIS
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transfer Tab */}
          <TabsContent value="transfer" className="mt-4 space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-display"><Send className="w-5 h-5 text-secondary" />Transfer XCoins</CardTitle>
                <CardDescription>Kirim XCoins ke pengguna lain</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground">Nomor WhatsApp Penerima</label>
                  <Input value={transferPhone} onChange={e => setTransferPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="bg-background/50 mt-1" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Jumlah XCoins</label>
                  <Input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="Min: 100" className="bg-background/50 mt-1" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">PIN Konfirmasi</label>
                  <Input type="password" maxLength={6} value={transferPin} onChange={e => setTransferPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="bg-background/50 mt-1 text-center tracking-[0.5em] font-mono" />
                </div>
                {transferAmount && parseInt(transferAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/10 text-center">
                    <span className="text-sm text-muted-foreground">Sisa saldo setelah transfer:</span>
                    <div className="font-display font-bold text-secondary">{formatCoins(user.balance - parseInt(transferAmount))} XCoins</div>
                  </div>
                )}
                <Button className="w-full" variant="secondary" onClick={handleTransfer} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Transfer
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-warning" />Top 10 XCoins</h3>
              <Button variant="ghost" size="sm" onClick={loadDashboardData}><RefreshCw className="w-4 h-4" /></Button>
            </div>
            {leaderboard.map(entry => (
              <Card key={entry.rank} className={`glass-card transition-colors ${entry.isMe ? 'border-primary/50 glow-cyan' : 'hover:border-border/80'}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm ${
                    entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                    entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                    entry.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {entry.rank}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.display_name}</span>
                      {entry.isMe && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">Kamu</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{entry.phone}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-4 h-4 rounded-full object-cover" />
                    <span className="font-mono font-bold text-sm">{formatCoins(entry.balance)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {/* Pay with XCoins button */}
        <Card className="glass-card mt-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/')}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/images/xcoins-default-logo.png" alt="XCoins" className="w-6 h-6 rounded-full object-cover" />
              <div>
                <span className="text-sm font-medium">Beli Paket dengan XCoins</span>
                <p className="text-xs text-muted-foreground">Bayar langsung dengan saldo XCoins</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default XCoinsPage;
