import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import GlobalBackground from '@/components/GlobalBackground';
import { ArrowLeft, Package, CheckCircle, XCircle, Gift, Loader2, Clock, Search, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  id: string;
  transaction_id: string;
  customer_name: string;
  customer_whatsapp: string | null;
  package_name: string;
  package_duration: number;
  original_amount: number;
  total_amount: number;
  status: string;
  license_key: string | null;
  paid_at: string | null;
  created_at: string;
}

interface ClaimResult {
  key: string;
  package: string;
  days: number;
  expired: string;
  expiredDisplay: string;
}

const getDeviceId = (): string => {
  let id = localStorage.getItem('arexans_device_id');
  if (!id) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fp', 2, 2); }
    const fp = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, new Date().getTimezoneOffset(), canvas.toDataURL()].join('|');
    let hash = 0;
    for (let i = 0; i < fp.length; i++) { hash = ((hash << 5) - hash) + fp.charCodeAt(i); hash = hash & hash; }
    id = 'USR-' + Math.abs(hash).toString(36).toUpperCase();
    localStorage.setItem('arexans_device_id', id);
  }
  return id;
};

const censorKey = (key: string) => {
  return '•'.repeat(key.length);
};

const History = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const deviceId = getDeviceId();

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('transactions')
        .select('*') as any)
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions((data as Transaction[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = transactions;
    if (statusFilter !== 'all') {
      list = list.filter(tx => tx.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        tx.transaction_id.toLowerCase().includes(q) ||
        tx.package_name.toLowerCase().includes(q) ||
        tx.customer_name.toLowerCase().includes(q) ||
        (tx.license_key && tx.license_key.toLowerCase().includes(q))
      );
    }
    return list;
  }, [transactions, search, statusFilter]);

  const handleClaim = async (transactionId: string) => {
    setClaimingId(transactionId);
    setClaimResult(null);
    try {
      const response = await supabase.functions.invoke('claim-key', { body: { transactionId } });
      if (response.error) throw response.error;
      const data = response.data;
      if (!data.success) {
        toast({ title: 'Gagal', description: data.error || 'Gagal klaim key', variant: 'destructive' });
        return;
      }
      setClaimResult({ key: data.key, package: data.package, days: data.days, expired: data.expired, expiredDisplay: data.expiredDisplay });
      loadTransactions();
      toast({ title: 'Berhasil!', description: 'Key berhasil diklaim! Redirecting ke Cek Key...' });
      // Redirect to KeySystem for loadstring
      setTimeout(() => {
        navigate(`/key-system?key=${encodeURIComponent(data.key)}`);
      }, 1500);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Gagal klaim key', variant: 'destructive' });
    } finally {
      setClaimingId(null);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Disalin!', description: `${label} berhasil disalin` });
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatRupiah = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      paid: 'bg-success/20 text-success border-success/30',
      claimable: 'bg-warning/20 text-warning border-warning/30',
      claimed: 'bg-secondary/20 text-secondary border-secondary/30',
      pending: 'bg-muted/20 text-muted-foreground border-border',
      expired: 'bg-destructive/20 text-destructive border-destructive/30',
    };
    const icons: Record<string, React.ReactNode> = {
      paid: <CheckCircle className="w-3 h-3" />,
      claimable: <Gift className="w-3 h-3" />,
      claimed: <CheckCircle className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      expired: <XCircle className="w-3 h-3" />,
    };
    const labels: Record<string, string> = {
      paid: 'Berhasil', claimable: 'Klaim', claimed: 'Diklaim', pending: 'Pending', expired: 'Expired',
    };
    return (
      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[status] || 'bg-muted text-muted-foreground'}`}>
        {icons[status]} {labels[status] || status}
      </span>
    );
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: transactions.length };
    transactions.forEach(tx => { counts[tx.status] = (counts[tx.status] || 0) + 1; });
    return counts;
  }, [transactions]);

  const filterButtons = [
    { key: 'all', label: 'Semua' },
    { key: 'pending', label: 'Pending' },
    { key: 'paid', label: 'Berhasil' },
    { key: 'claimable', label: 'Klaim' },
    { key: 'claimed', label: 'Diklaim' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <GlobalBackground />
      <div className="relative z-10 min-h-screen flex flex-col items-center p-4">
        <div className="w-full max-w-2xl space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
            <h1 className="text-lg font-display font-bold text-foreground">Riwayat Transaksi</h1>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari ID transaksi, paket, atau key..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted/50 border-border"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {filterButtons.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  statusFilter === f.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {f.label} {(statusCounts[f.key] || 0) > 0 && <span className="ml-1 opacity-70">{statusCounts[f.key]}</span>}
              </button>
            ))}
          </div>

          {/* Claim Result */}
          {claimResult && (
            <Card className="glass-card border-success/50 bg-success/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-success text-base flex items-center gap-2">
                  <Gift className="w-5 h-5" /> Key Berhasil Diklaim!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg">
                  <code className="flex-1 font-mono text-sm text-success truncate">{claimResult.key}</code>
                  <Button variant="ghost" size="sm" onClick={() => copyText(claimResult.key, 'Key')}>Salin</Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/20 p-2 rounded">
                    <span className="text-muted-foreground text-xs">Paket</span>
                    <p className="font-medium text-foreground">{claimResult.package}</p>
                  </div>
                  <div className="bg-muted/20 p-2 rounded">
                    <span className="text-muted-foreground text-xs">Durasi</span>
                    <p className="font-medium text-foreground">{claimResult.days} hari</p>
                  </div>
                  <div className="col-span-2 bg-muted/20 p-2 rounded">
                    <span className="text-muted-foreground text-xs">Berlaku hingga</span>
                    <p className="font-medium text-foreground">{claimResult.expiredDisplay}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setClaimResult(null)}>Tutup</Button>
              </CardContent>
            </Card>
          )}

          {/* Transaction List */}
          <div className="space-y-2.5">
            {loading ? (
              <Card className="glass-card">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                  <p>Memuat riwayat...</p>
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{search ? 'Tidak ditemukan' : 'Belum ada transaksi'}</p>
                  <p className="text-xs mt-1 opacity-60">{search ? 'Coba kata kunci lain' : 'Transaksi yang kamu buat akan muncul di sini'}</p>
                </CardContent>
              </Card>
            ) : (
              filtered.map((tx) => (
                <Card key={tx.id} className="glass-card border-border/50 overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    {/* Row 1: Package + Status + Payment Method */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="font-display font-semibold text-sm text-foreground">{tx.package_name}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{tx.package_duration}d</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tx.transaction_id.startsWith('XPAY-') ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                          {tx.transaction_id.startsWith('XPAY-') ? 'XCoins' : 'QRIS'}
                        </span>
                      </div>
                      {getStatusBadge(tx.status)}
                    </div>

                    {/* Row 2: Date + Amount */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{formatDate(tx.created_at)}</span>
                      <span className="font-display font-bold text-foreground">{formatRupiah(tx.total_amount)}</span>
                    </div>

                    {/* Row 3: Key with show/hide */}
                    {tx.license_key && (
                      <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg">
                        <code className="flex-1 font-mono text-xs text-foreground truncate">
                          {visibleKeys.has(tx.id) ? tx.license_key : censorKey(tx.license_key)}
                        </code>
                        <button
                          onClick={() => toggleKeyVisibility(tx.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          {visibleKeys.has(tx.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {/* Row 4: Action buttons (text) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => copyText(tx.transaction_id, 'ID Transaksi')}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border transition-colors"
                      >
                        TX ID
                      </button>
                      {tx.license_key && (
                        <button
                          onClick={() => copyText(tx.license_key!, 'Key')}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors"
                        >
                          SALIN KEY
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(detailId === tx.id ? null : tx.id)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                          detailId === tx.id
                            ? 'bg-accent text-accent-foreground border-accent'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border-border'
                        }`}
                      >
                        DETAIL
                      </button>
                    </div>

                    {/* Detail panel */}
                    {detailId === tx.id && (
                      <div className="bg-muted/20 p-3 rounded-lg space-y-1.5 text-xs border border-border/50 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ID Transaksi</span>
                          <code className="font-mono text-foreground truncate max-w-[200px]">{tx.transaction_id}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Harga Asli</span>
                          <span className="text-foreground">{formatRupiah(tx.original_amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Bayar</span>
                          <span className="font-semibold text-foreground">{formatRupiah(tx.total_amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tanggal</span>
                          <span className="text-foreground">{formatDate(tx.created_at)}</span>
                        </div>
                        {tx.paid_at && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dibayar</span>
                            <span className="text-foreground">{formatDate(tx.paid_at)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Claim button - only for manually set claimable status */}
                    {tx.status === 'claimable' && (
                      <Button className="w-full" size="sm" onClick={() => handleClaim(tx.transaction_id)} disabled={claimingId === tx.transaction_id}>
                        {claimingId === tx.transaction_id ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Mengklaim...</>
                        ) : (
                          <><Gift className="w-4 h-4 mr-2" /> Klaim Key</>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default History;
