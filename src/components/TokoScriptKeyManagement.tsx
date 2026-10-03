import React, { useState, useEffect } from 'react';
import { TokoScriptKey, TokoScriptProduct } from '@/types/tokoScript';
import {
  getTokoScriptKeys,
  saveTokoScriptKeys,
  createTokoScriptKey,
  deleteTokoScriptKey,
  resetTokoScriptKeyHwid,
  addTokoScriptKeyHwidSlot,
  extendTokoScriptKeyDays,
  freezeTokoScriptKeys,
  unfreezeTokoScriptKeys,
  generateTokoScriptKeyString,
  updateTokoScriptKey,
} from '@/lib/tokoScriptKeyStore';
import { getTokoScripts, getScriptRawId } from '@/lib/tokoScriptStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Clock,
  Shield,
  Pause,
  Play,
  Search,
  ExternalLink,
  Laptop,
  CheckCircle,
  AlertTriangle,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TokoScriptKeyManagementProps {
  products?: TokoScriptProduct[];
}

export const TokoScriptKeyManagement: React.FC<TokoScriptKeyManagementProps> = ({ products: initialProducts }) => {
  const [keys, setKeys] = useState<TokoScriptKey[]>([]);
  const [products, setProducts] = useState<TokoScriptProduct[]>(initialProducts || []);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'frozen' | 'expired'>('all');

  // Create Key Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [targetProductId, setTargetProductId] = useState('');
  const [customKeyString, setCustomKeyString] = useState('');
  const [durationPreset, setDurationPreset] = useState<number>(30);
  const [isPermanent, setIsPermanent] = useState(false);
  const [maxHwidInput, setMaxHwidInput] = useState<number>(1);
  const [customerNameInput, setCustomerNameInput] = useState('');

  // HWID Detail Modal
  const [hwidModalOpen, setHwidModalOpen] = useState(false);
  const [selectedKeyForHwid, setSelectedKeyForHwid] = useState<TokoScriptKey | null>(null);

  // Edit Key Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<TokoScriptKey | null>(null);
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editMaxHwid, setEditMaxHwid] = useState(1);
  const [editCustomerNote, setEditCustomerNote] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fetchedKeys, fetchedProducts] = await Promise.all([
        getTokoScriptKeys(),
        getTokoScripts(),
      ]);
      setKeys(fetchedKeys);
      setProducts(fetchedProducts);
      if (fetchedProducts.length > 0 && !targetProductId) {
        setTargetProductId(fetchedProducts[0].id);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Gagal memuat data key', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();

    const handleUpdate = () => {
      getTokoScriptKeys().then(setKeys);
    };

    window.addEventListener('toko_script_keys_updated', handleUpdate);
    return () => {
      window.removeEventListener('toko_script_keys_updated', handleUpdate);
    };
  }, []);

  // Helper safe date parser
  const parseDate = (d?: string | null) => {
    if (!d) return new Date();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // Stats calculation
  const now = new Date();
  const activeKeys = keys.filter(k => !k.frozenUntil && (k.isLifetime || parseDate(k.expired) >= now));
  const frozenKeys = keys.filter(k => !!k.frozenUntil);
  const expiredKeys = keys.filter(k => !k.frozenUntil && !k.isLifetime && parseDate(k.expired) < now);

  // Filtered keys
  const filteredKeys = keys.filter(k => {
    // Product filter
    if (selectedProductFilter !== 'all') {
      if (k.productId !== selectedProductFilter && k.productRawId !== selectedProductFilter) {
        return false;
      }
    }

    // Status filter
    if (statusFilter === 'active') {
      if (k.frozenUntil || (!k.isLifetime && parseDate(k.expired) < now)) return false;
    } else if (statusFilter === 'frozen') {
      if (!k.frozenUntil) return false;
    } else if (statusFilter === 'expired') {
      if (k.frozenUntil || k.isLifetime || parseDate(k.expired) >= now) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = k.key.toLowerCase().includes(q);
      const matchProd = (k.productTitle || '').toLowerCase().includes(q);
      const matchBuyer = (k.customerName || '').toLowerCase().includes(q);
      const matchUser = (k.robloxUsers || []).some(u => u.username.toLowerCase().includes(q) || u.hwid.toLowerCase().includes(q));
      if (!matchKey && !matchProd && !matchBuyer && !matchUser) return false;
    }

    return true;
  });

  const handleOpenCreateModal = () => {
    if (products.length === 0) {
      toast({
        title: 'Katalog Script Masih Kosong',
        description: 'Tambahkan produk script terlebih dahulu di tab Produk Toko Script sebelum membuat key!',
        variant: 'destructive',
      });
      return;
    }
    const target = targetProductId || products[0].id;
    const selectedProd = products.find(p => p.id === target) || products[0];
    setTargetProductId(selectedProd.id);
    setCustomKeyString(generateTokoScriptKeyString(selectedProd.title));
    setDurationPreset(30);
    setIsPermanent(false);
    setMaxHwidInput(1);
    setCustomerNameInput('');
    setIsCreateModalOpen(true);
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProductId) {
      toast({ title: 'Pilih Produk Script', description: 'Pilih produk yang akan diikat dengan key ini.', variant: 'destructive' });
      return;
    }

    const prod = products.find(p => p.id === targetProductId);
    if (!prod) return;

    try {
      const newKey = await createTokoScriptKey({
        key: customKeyString.trim() || generateTokoScriptKeyString(prod.title),
        productId: prod.id,
        productTitle: prod.title,
        productRawId: getScriptRawId(prod),
        durationDays: isPermanent ? 999999 : durationPreset,
        maxHwid: maxHwidInput || 1,
        customerName: customerNameInput.trim() || 'Manual Developer',
        isLifetime: isPermanent,
      });

      toast({
        title: 'Key Berhasil Dibuat!',
        description: `Key ${newKey.key} terikat khusus ke "${prod.title}". Tidak dapat dipakai di script lain.`,
      });

      setIsCreateModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast({ title: 'Gagal Membuat Key', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteKey = async (keyItem: TokoScriptKey) => {
    if (!confirm(`Hapus key "${keyItem.key}" untuk produk "${keyItem.productTitle}"?`)) return;
    const ok = await deleteTokoScriptKey(keyItem.id);
    if (ok) {
      toast({ title: 'Key Dihapus', description: `Key ${keyItem.key} telah dihapus dari sistem.` });
      await loadAll();
    }
  };

  const handleToggleFreeze = async (keyItem: TokoScriptKey) => {
    const isCurrentlyFrozen = !!keyItem.frozenUntil;
    if (isCurrentlyFrozen) {
      // Unfreeze
      const remainingMs = keyItem.frozenRemainingMs || 0;
      const newExp = new Date(Date.now() + remainingMs).toISOString();
      await updateTokoScriptKey(keyItem.id, {
        frozenUntil: null,
        frozenRemainingMs: null,
        expired: newExp,
      });
      toast({
        title: 'Key Dilanjutkan',
        description: `Key ${keyItem.key} aktif kembali. Masa aktif diperpanjang utuh.`,
      });
    } else {
      // Freeze
      const remainingMs = new Date(keyItem.expired).getTime() - Date.now();
      if (remainingMs <= 0 && !keyItem.isLifetime) {
        toast({ title: 'Key Sudah Expired', description: 'Key yang sudah kadaluarsa tidak dapat dibekukan.', variant: 'destructive' });
        return;
      }
      await updateTokoScriptKey(keyItem.id, {
        frozenUntil: new Date().toISOString(),
        frozenRemainingMs: remainingMs > 0 ? remainingMs : 0,
      });
      toast({
        title: 'Key Dibekukan',
        description: `Key ${keyItem.key} dibekukan sementara. Sisa waktu di-pause.`,
      });
    }
    await loadAll();
  };

  const handleQuickAddDays = async (keyItem: TokoScriptKey, days: number) => {
    try {
      const newExp = await extendTokoScriptKeyDays(keyItem.id, days);
      toast({
        title: `Durasi +${days} Hari Berhasil`,
        description: `Masa aktif key ${keyItem.key} diperpanjang hingga ${new Date(newExp).toLocaleDateString('id-ID')}.`,
      });
      await loadAll();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
    }
  };

  const handleQuickAddHwid = async (keyItem: TokoScriptKey) => {
    const newMax = await addTokoScriptKeyHwidSlot(keyItem.id, 1);
    toast({
      title: 'Slot HWID Ditambah',
      description: `Key ${keyItem.key} kini memiliki kuota ${newMax} perangkat Roblox.`,
    });
    await loadAll();
  };

  const handleResetHwid = async (keyItem: TokoScriptKey) => {
    if (!confirm(`Reset semua HWID perangkat Roblox yang terdaftar untuk key "${keyItem.key}"?`)) return;
    await resetTokoScriptKeyHwid(keyItem.id);
    toast({
      title: 'HWID Direset',
      description: `Seluruh perangkat untuk key ${keyItem.key} telah dikosongkan. Pembeli dapat login di perangkat baru.`,
    });
    await loadAll();
  };

  const handleCopyLoaderCode = (keyItem: TokoScriptKey) => {
    const origin = window.location.origin;
    const rawId = keyItem.productRawId || keyItem.productId;
    const code = `_G.Axstools = "${keyItem.key}"\nloadstring(game:HttpGet("${origin}/api/public/raw/${rawId}?key=" .. _G.Axstools))()`;
    navigator.clipboard.writeText(code);
    toast({
      title: 'Kode Loader Disalin!',
      description: `Script loader siap dijalankan di executor untuk produk "${keyItem.productTitle}".`,
    });
  };

  const handleBatchFreezeAll = async () => {
    const targetName = selectedProductFilter === 'all' ? 'seluruh katalog script' : 'produk terpilih';
    if (!confirm(`Bekukan (Freeze) semua key aktif untuk ${targetName}? Waktu sisa akan disimpan aman.`)) return;
    setLoading(true);
    const res = await freezeTokoScriptKeys(selectedProductFilter);
    toast({ title: 'Batch Freeze Selesai', description: res.message });
    await loadAll();
  };

  const handleBatchUnfreezeAll = async () => {
    const targetName = selectedProductFilter === 'all' ? 'seluruh katalog script' : 'produk terpilih';
    if (!confirm(`Lanjutkan (Unfreeze) semua key yang dibekukan untuk ${targetName}?`)) return;
    setLoading(true);
    const res = await unfreezeTokoScriptKeys(selectedProductFilter);
    toast({ title: 'Batch Unfreeze Selesai', description: res.message });
    await loadAll();
  };

  const openEditModal = (keyItem: TokoScriptKey) => {
    setEditingKey(keyItem);
    try {
      setEditExpiryDate(parseDate(keyItem.expired).toISOString().slice(0, 16));
    } catch {
      setEditExpiryDate(new Date().toISOString().slice(0, 16));
    }
    setEditMaxHwid(keyItem.maxHwid || 1);
    setEditCustomerNote(keyItem.customerName || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEditKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;

    try {
      await updateTokoScriptKey(editingKey.id, {
        expired: new Date(editExpiryDate).toISOString(),
        maxHwid: editMaxHwid || 1,
        customerName: editCustomerNote.trim(),
      });

      toast({ title: 'Key Berhasil Diupdate', description: `Pengaturan key ${editingKey.key} telah disimpan.` });
      setIsEditModalOpen(false);
      await loadAll();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info Banner: Strict Product Binding Rule */}
      <div className="p-4 rounded-2xl border border-primary/40 bg-primary/10 shadow-lg shadow-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Pusat Kontrol Key System Toko Script
            </h3>
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/40 text-[10px]">
              Eksklusif Per-Produk
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Sistem key ini <strong>BERBEDA DARI AREXANS TOOLS</strong>. Setiap key toko script terikat khusus ke <strong>1 produk script yang dibeli</strong> dan otomatis ditolak jika dijalankan pada script lain. Kuota default adalah 1 HWID slot.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <Button
            size="sm"
            onClick={handleOpenCreateModal}
            className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl gap-1.5 shadow-md shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Buat Key Script Baru
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadAll}
            disabled={loading}
            className="text-xs rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 space-y-1">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-primary" />
            Total Key Script
          </span>
          <div className="text-xl font-bold font-mono text-foreground">
            {keys.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
          <span className="text-[11px] text-emerald-300 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            Key Aktif Berjalan
          </span>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {activeKeys.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-1">
          <span className="text-[11px] text-blue-300 flex items-center gap-1.5">
            <Pause className="w-3.5 h-3.5 text-blue-400" />
            Key Dibekukan (Frozen)
          </span>
          <div className="text-xl font-bold font-mono text-blue-400">
            {frozenKeys.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 space-y-1">
          <span className="text-[11px] text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            Key Kadaluarsa
          </span>
          <div className="text-xl font-bold font-mono text-destructive">
            {expiredKeys.length}
          </div>
        </div>
      </div>

      {/* Filter & Batch Actions Bar */}
      <div className="p-4 rounded-xl bg-card/60 border border-border/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari key, nama script, atau pembeli..."
              className="pl-8 text-xs h-9 rounded-xl bg-background/80"
            />
          </div>

          {/* Product Filter */}
          <select
            value={selectedProductFilter}
            onChange={(e) => setSelectedProductFilter(e.target.value)}
            className="text-xs h-9 px-3 rounded-xl bg-background/80 border border-border/80 text-foreground font-medium"
          >
            <option value="all">Semua Produk Script ({products.length})</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs h-9 px-3 rounded-xl bg-background/80 border border-border/80 text-foreground font-medium"
          >
            <option value="all">Semua Status</option>
            <option value="active">🟢 Hanya Aktif ({activeKeys.length})</option>
            <option value="frozen">❄️ Hanya Dibekukan ({frozenKeys.length})</option>
            <option value="expired">🔴 Hanya Kadaluarsa ({expiredKeys.length})</option>
          </select>
        </div>

        {/* Batch Freeze/Unfreeze Buttons */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBatchFreezeAll}
            className="text-xs h-9 rounded-xl border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-1.5"
            title="Bekukan seluruh key toko script untuk maintenance"
          >
            <Pause className="w-3.5 h-3.5" />
            Freeze Batch
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleBatchUnfreezeAll}
            className="text-xs h-9 rounded-xl border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
            title="Lanjutkan seluruh key yang dibekukan"
          >
            <Play className="w-3.5 h-3.5" />
            Unfreeze Batch
          </Button>
        </div>
      </div>

      {/* Keys Table */}
      {filteredKeys.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center space-y-3 border-dashed border-border/80">
          <Key className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Tidak Ada Key Ditemukan</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {searchQuery || selectedProductFilter !== 'all' || statusFilter !== 'all'
                ? 'Tidak ada key yang cocok dengan filter atau kata kunci pencarian Anda.'
                : 'Belum ada key toko script yang dibuat. Klik tombol "Buat Key Script Baru" untuk men-generate key pertama.'}
            </p>
          </div>
          <Button size="sm" onClick={handleOpenCreateModal} className="text-xs rounded-xl">
            <Plus className="w-4 h-4 mr-1.5" />
            Buat Key Sekarang
          </Button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-border/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-muted-foreground border-b border-border/80">
                <tr>
                  <th className="text-left p-3.5 font-semibold">Key License</th>
                  <th className="text-left p-3.5 font-semibold">Produk Terikat (Strict)</th>
                  <th className="text-left p-3.5 font-semibold">Status & Durasi</th>
                  <th className="text-left p-3.5 font-semibold">HWID & User Roblox</th>
                  <th className="text-left p-3.5 font-semibold">Pembeli / Catatan</th>
                  <th className="text-right p-3.5 font-semibold">Aksi Kontrol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredKeys.map((k) => {
                  const expDate = parseDate(k.expired);
                  const isExp = !k.isLifetime && expDate < now;
                  const isFrozen = !!k.frozenUntil;
                  const daysLeft = k.isLifetime
                    ? 'Permanen'
                    : isExp
                    ? 'Expired'
                    : Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) + ' Hari';

                  return (
                    <tr key={k.id} className="hover:bg-muted/20 transition-colors">
                      {/* Key */}
                      <td className="p-3.5 align-middle">
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded-md bg-muted/80 font-mono font-bold text-primary text-xs">
                            {k.key}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(k.key);
                              toast({ title: 'Disalin!', description: `Key ${k.key} telah disalin.` });
                            }}
                            className="p-1 hover:text-primary transition-colors text-muted-foreground"
                            title="Salin Key"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Bound Product */}
                      <td className="p-3.5 align-middle">
                        <div className="space-y-1">
                          <span className="font-bold text-foreground block">
                            {k.productTitle || 'Script Toko'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1 font-semibold">
                            <Lock className="w-2.5 h-2.5" />
                            Hanya 1 Produk Ini
                          </span>
                        </div>
                      </td>

                      {/* Status & Expiry */}
                      <td className="p-3.5 align-middle">
                        <div className="space-y-1">
                          {isFrozen ? (
                            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/40 text-[10px] font-bold">
                              ❄️ DIBEKUKAN
                            </Badge>
                          ) : isExp ? (
                            <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/40 text-[10px] font-bold">
                              🔴 EXPIRED
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] font-bold">
                              🟢 AKTIF ({daysLeft})
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground block font-mono">
                            {k.isLifetime ? 'Akses Permanen' : parseDate(k.expired).toLocaleDateString('id-ID')}
                          </span>
                        </div>
                      </td>

                      {/* HWID & Roblox User */}
                      <td className="p-3.5 align-middle">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Laptop className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-mono text-xs font-semibold">
                              {k.hwids?.length || 0} / {k.maxHwid || 1} Slot
                            </span>
                            <button
                              onClick={() => {
                                setSelectedKeyForHwid(k);
                                setHwidModalOpen(true);
                              }}
                              className="text-[10px] text-primary hover:underline ml-1"
                            >
                              Detail
                            </button>
                          </div>
                          {(k.robloxUsers && k.robloxUsers.length > 0) && (
                            <span className="text-[10px] text-muted-foreground block truncate max-w-[140px]" title={k.robloxUsers.map(u => u.username).join(', ')}>
                              User: {k.robloxUsers[0].username}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Buyer / Notes */}
                      <td className="p-3.5 align-middle">
                        <span className="text-xs text-muted-foreground block max-w-[130px] truncate" title={k.customerName}>
                          {k.customerName || '-'}
                        </span>
                        {k.transactionId && (
                          <span className="text-[10px] font-mono text-primary/80 block">
                            {k.transactionId}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Salin Loader Code */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyLoaderCode(k)}
                            className="h-7 px-2 text-[11px] rounded-lg text-primary hover:bg-primary/10 gap-1"
                            title="Salin script loader untuk dijalankan di Roblox"
                          >
                            <Copy className="w-3 h-3" />
                            Loader
                          </Button>

                          {/* Quick +7 Hari */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleQuickAddDays(k, 7)}
                            className="h-7 px-1.5 text-[10px] rounded-lg text-emerald-400 hover:bg-emerald-500/10"
                            title="Tambah +7 Hari"
                          >
                            +7H
                          </Button>

                          {/* Freeze / Unfreeze */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleFreeze(k)}
                            className={`h-7 px-2 text-[11px] rounded-lg ${
                              isFrozen
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : 'text-blue-400 hover:bg-blue-500/10'
                            }`}
                            title={isFrozen ? 'Lanjutkan Key (Unfreeze)' : 'Bekukan Key (Freeze)'}
                          >
                            {isFrozen ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                          </Button>

                          {/* Edit Key */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditModal(k)}
                            className="h-7 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
                            title="Edit Pengaturan Key"
                          >
                            Edit
                          </Button>

                          {/* Delete Key */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteKey(k)}
                            className="h-7 px-2 text-[11px] rounded-lg text-destructive hover:bg-destructive/10"
                            title="Hapus Key"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Buat Key Script Baru */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md w-full p-5 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Buat Key Toko Script Baru
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Key ini akan terikat secara eksklusif ke 1 produk yang Anda pilih.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateKey} className="space-y-4 pt-2">
            {/* Target Script Product */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Pilih Produk Script Tujuan *</Label>
              <select
                value={targetProductId}
                onChange={(e) => {
                  const newTarget = e.target.value;
                  setTargetProductId(newTarget);
                  const prod = products.find(p => p.id === newTarget);
                  if (prod) {
                    setCustomKeyString(generateTokoScriptKeyString(prod.title));
                  }
                }}
                className="w-full text-xs h-9 px-3 rounded-xl bg-background/80 border border-border/80 text-foreground font-medium"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title} (ID: {getScriptRawId(p)})
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Key or Auto-generate */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">String License Key *</Label>
                <button
                  type="button"
                  onClick={() => {
                    const prod = products.find(p => p.id === targetProductId);
                    setCustomKeyString(generateTokoScriptKeyString(prod?.title || 'TS'));
                  }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Acak Key Baru
                </button>
              </div>
              <Input
                value={customKeyString}
                onChange={(e) => setCustomKeyString(e.target.value.toUpperCase())}
                placeholder="TS-PROD-XXXX-XXXX"
                className="text-xs h-9 font-mono font-bold rounded-xl"
                required
              />
            </div>

            {/* Durasi Paket */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Masa Aktif Durasi *</Label>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={isPermanent}
                    onCheckedChange={setIsPermanent}
                    id="perm-toggle"
                  />
                  <Label htmlFor="perm-toggle" className="text-[11px] text-muted-foreground font-medium cursor-pointer">
                    Permanen (Lifetime)
                  </Label>
                </div>
              </div>

              {!isPermanent && (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[1, 3, 7, 14, 30, 60, 90, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDurationPreset(d)}
                      className={`text-xs py-1.5 rounded-lg border font-medium transition-all ${
                        durationPreset === d
                          ? 'border-primary bg-primary/20 text-primary font-bold'
                          : 'border-border/70 hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      {d} Hari
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* HWID Slots */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Slot HWID Perangkat</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={maxHwidInput}
                  onChange={(e) => setMaxHwidInput(parseInt(e.target.value) || 1)}
                  className="text-xs h-9 rounded-xl font-mono"
                />
                <span className="text-[10px] text-muted-foreground">Default 1 perangkat</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan / Pembeli</Label>
                <Input
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  placeholder="Contoh: Budi (WA 0812...)"
                  className="text-xs h-9 rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs rounded-xl"
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl"
              >
                Buat & Kunci ke Produk Ini
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Edit Key */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md w-full p-5 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base font-bold text-foreground">
              Edit Key Toko Script
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Key: {editingKey?.key} ({editingKey?.productTitle})
            </DialogDescription>
          </DialogHeader>

          {editingKey && (
            <form onSubmit={handleSaveEditKey} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tanggal & Waktu Expired</Label>
                <Input
                  type="datetime-local"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className="text-xs h-9 rounded-xl font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Slot Maksimal HWID</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editMaxHwid}
                  onChange={(e) => setEditMaxHwid(parseInt(e.target.value) || 1)}
                  className="text-xs h-9 rounded-xl font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan Pembeli</Label>
                <Input
                  value={editCustomerNote}
                  onChange={(e) => setEditCustomerNote(e.target.value)}
                  placeholder="Nama / kontak pembeli"
                  className="text-xs h-9 rounded-xl"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-xs rounded-xl"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl"
                >
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: Detail HWID & User Roblox */}
      <Dialog open={hwidModalOpen} onOpenChange={setHwidModalOpen}>
        <DialogContent className="max-w-md w-full p-5 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Laptop className="w-4 h-4 text-primary" />
              Detail Perangkat Roblox Terdaftar
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-mono">
              Key: {selectedKeyForHwid?.key} ({selectedKeyForHwid?.productTitle})
            </DialogDescription>
          </DialogHeader>

          {selectedKeyForHwid && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/70">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Kuota Perangkat</span>
                  <span className="text-[11px] text-muted-foreground block">
                    {selectedKeyForHwid.hwids?.length || 0} dari {selectedKeyForHwid.maxHwid || 1} slot terpakai
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleQuickAddHwid(selectedKeyForHwid);
                      setHwidModalOpen(false);
                    }}
                    className="text-xs h-8 rounded-lg"
                  >
                    +1 Slot
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      handleResetHwid(selectedKeyForHwid);
                      setHwidModalOpen(false);
                    }}
                    className="text-xs h-8 rounded-lg"
                  >
                    Reset HWID
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Riwayat Username & HWID Login:</Label>
                {(!selectedKeyForHwid.robloxUsers || selectedKeyForHwid.robloxUsers.length === 0) ? (
                  <div className="p-4 rounded-xl bg-muted/20 border border-border/60 text-center text-xs text-muted-foreground">
                    Belum ada perangkat Roblox yang mengeksekusi script dengan key ini.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {selectedKeyForHwid.robloxUsers.map((u, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-card border border-border/70 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground">Roblox: {u.username}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {parseDate(u.registeredAt).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground break-all">
                          HWID: {u.hwid}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
