import React, { useState, useEffect } from 'react';
import {
  TokoScriptProduct,
  ScriptPackage,
  MediaAdItem,
  ResellerAccount,
  CommissionWithdrawal,
  ResellerSale,
  ResellerGlobalSettings,
} from '@/types/tokoScript';
import {
  getTokoScripts,
  saveTokoScripts,
  addTokoScript,
  updateTokoScript,
  deleteTokoScript,
  DEFAULT_SCRIPT_PACKAGES,
  getResellerAccounts,
  getCommissionWithdrawals,
  getResellerSales,
  developerResetResellerCommission,
  developerCreateReseller,
  developerUpdateReseller,
  developerDeleteReseller,
  getResellerGlobalSettings,
  saveResellerGlobalSettings,
  clearAllResellerLogs,
  getScriptRawId,
  generateScriptLoaderCode,
  DEFAULT_RESELLER_GLOBAL_SETTINGS,
  RESELLER_REGISTRATION_PRICE,
  getTokoScriptHomeVisibility,
  setTokoScriptHomeVisibility,
} from '@/lib/tokoScriptStore';
import { uploadMediaFile } from '@/utils/mediaUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Plus,
  Trash2,
  Edit2,
  UploadCloud,
  Film,
  Image as ImageIcon,
  DollarSign,
  Users,
  UserPlus,
  CheckCircle,
  RefreshCw,
  ShoppingBag,
  Clock,
  Sparkles,
  Link,
  ShieldCheck,
  TrendingUp,
  Lock,
  Percent,
  Sliders,
  AlertTriangle,
  Eraser,
  Wrench,
  Pause,
  Play,
  Code2,
  Terminal,
  Copy,
  ExternalLink,
  Key,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { freezeProductKeys, unfreezeProductKeys } from '@/lib/maintenanceStore';
import { TokoScriptKeyManagement } from './TokoScriptKeyManagement';

export const TokoScriptAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'keysystem' | 'resellers' | 'withdrawals'>('products');
  const [products, setProducts] = useState<TokoScriptProduct[]>([]);
  const [resellers, setResellers] = useState<ResellerAccount[]>([]);
  const [withdrawals, setWithdrawals] = useState<CommissionWithdrawal[]>([]);
  const [sales, setSales] = useState<ResellerSale[]>([]);
  const [loading, setLoading] = useState(false);

  // Global settings state
  const [globalSettings, setGlobalSettings] = useState<ResellerGlobalSettings>(DEFAULT_RESELLER_GLOBAL_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Product modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  // Product form fields
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRawId, setFormRawId] = useState('');
  const [formLuaScript, setFormLuaScript] = useState('');
  const [formMedia, setFormMedia] = useState<MediaAdItem[]>([]);
  const [formPackages, setFormPackages] = useState<ScriptPackage[]>(DEFAULT_SCRIPT_PACKAGES);
  const [formCommissionPct, setFormCommissionPct] = useState(20);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsMaintenance, setFormIsMaintenance] = useState(false);
  const [formMaintenanceNotice, setFormMaintenanceNotice] = useState('Sedang perbaikan/update script oleh developer.');

  // New media input state
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaType, setNewMediaType] = useState<'image' | 'video'>('image');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Reset commission modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedResellerForReset, setSelectedResellerForReset] = useState<ResellerAccount | null>(null);
  const [resetReason, setResetReason] = useState('Komisi telah ditransfer ke rekening reseller');

  // Reseller CRUD modal state
  const [isResellerModalOpen, setIsResellerModalOpen] = useState(false);
  const [editingResellerId, setEditingResellerId] = useState<string | null>(null);
  const [resName, setResName] = useState('');
  const [resUsername, setResUsername] = useState('');
  const [resPassword, setResPassword] = useState('');
  const [resEmail, setResEmail] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resPayoutMethod, setResPayoutMethod] = useState('DANA');
  const [resPayoutAccountNumber, setResPayoutAccountNumber] = useState('');
  const [resPayoutAccountName, setResPayoutAccountName] = useState('');
  const [resReferralCode, setResReferralCode] = useState('');
  const [resCommissionPct, setResCommissionPct] = useState(20);
  const [resCommissionScope, setResCommissionScope] = useState<'toko_script' | 'arexans_tools' | 'both'>('both');
  const [resBuyerDiscountPct, setResBuyerDiscountPct] = useState(10);
  const [resIsActive, setResIsActive] = useState(true);

  // Status tampilan Toko Script di halaman awal (home)
  const [showOnHome, setShowOnHome] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [prodData, resData, wdData, slData, settingsData, homeVisible] = await Promise.all([
        getTokoScripts(),
        getResellerAccounts(),
        getCommissionWithdrawals(),
        getResellerSales(),
        getResellerGlobalSettings(),
        getTokoScriptHomeVisibility(),
      ]);
      setProducts(prodData);
      setResellers(resData);
      setWithdrawals(wdData);
      setSales(slData);
      setGlobalSettings(settingsData);
      setShowOnHome(homeVisible);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHomeVisibility = async (newVal: boolean) => {
    setTogglingVisibility(true);
    try {
      setShowOnHome(newVal);
      await setTokoScriptHomeVisibility(newVal);
      toast({
        title: newVal ? 'Toko Script Aktif di Halaman Utama' : 'Toko Script Disembunyikan',
        description: newVal
          ? 'Toko Script kini muncul di halaman utama berdampingan dengan Arexans Tools.'
          : 'Halaman utama sekarang hanya menampilkan Arexans Tools saja.',
      });
    } catch (err: any) {
      toast({ title: 'Gagal Mengubah Visibilitas', description: err.message, variant: 'destructive' });
      setShowOnHome(!newVal);
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleSaveGlobalSettings = async () => {
    setSavingSettings(true);
    try {
      await saveResellerGlobalSettings(globalSettings);
      toast({
        title: 'Pengaturan Kemitraan Disimpan',
        description: 'Pengaturan komisi default dan cakupan produk diskon berhasil diperbarui.',
      });
    } catch (e: any) {
      toast({ title: 'Gagal Menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearAllLogs = async () => {
    if (!confirm('PERHATIAN: Apakah Anda yakin ingin mengosongkan SEMUA log simulasi dan riwayat transaksi reseller? Tabel riwayat penjualan & penarikan komisi akan direset menjadi bersih kosong (Rp 0).')) {
      return;
    }

    try {
      const res = await clearAllResellerLogs();
      if (res.success) {
        toast({ title: 'Log Dikosongkan', description: res.message });
        loadAllData();
      } else {
        toast({ title: 'Gagal', description: res.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleClearSingleResellerLog = async (resellerId: string, name: string) => {
    if (!confirm(`Kosongkan semua log dan riwayat transaksi untuk reseller "${name}"? Saldo aktif dan riwayat akan kembali Rp 0.`)) {
      return;
    }

    try {
      const res = await clearAllResellerLogs(resellerId);
      if (res.success) {
        toast({ title: 'Log Reseller Dikosongkan', description: res.message });
        loadAllData();
      } else {
        toast({ title: 'Gagal', description: res.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleOpenNewProduct = () => {
    setEditingId(null);
    setFormTitle('');
    setFormDescription('');
    setFormRawId('');
    setFormLuaScript('');
    setFormMedia([]);
    setFormPackages(JSON.parse(JSON.stringify(DEFAULT_SCRIPT_PACKAGES)));
    setFormCommissionPct(20);
    setFormIsActive(true);
    setFormIsMaintenance(false);
    setFormMaintenanceNotice('Sedang perbaikan/update script oleh developer.');
    setIsModalOpen(true);
  };

  const handleEditProduct = (prod: TokoScriptProduct) => {
    setEditingId(prod.id);
    setFormTitle(prod.title);
    setFormDescription(prod.description);
    setFormRawId(prod.rawId || '');
    setFormLuaScript(prod.luaScript || '');
    setFormMedia(prod.media || []);
    setFormPackages(
      prod.packages && prod.packages.length > 0
        ? JSON.parse(JSON.stringify(prod.packages))
        : JSON.parse(JSON.stringify(DEFAULT_SCRIPT_PACKAGES))
    );
    setFormCommissionPct(prod.resellerCommissionPct || 20);
    setFormIsActive(prod.isActive);
    setFormIsMaintenance(!!prod.isMaintenance);
    setFormMaintenanceNotice(prod.maintenanceNotice || 'Sedang perbaikan/update script oleh developer.');
    setIsModalOpen(true);
  };

  const handleToggleProductMaintenance = async (prod: TokoScriptProduct) => {
    const nextState = !prod.isMaintenance;
    try {
      await updateTokoScript(prod.id, {
        isMaintenance: nextState,
        maintenanceStartedAt: nextState ? new Date().toISOString() : null,
      });

      if (nextState) {
        const res = await freezeProductKeys('all');
        toast({
          title: 'Produk Dikunci Maintenance',
          description: `Script "${prod.title}" dikunci. ${res?.count || 0} key pelanggan dibekukan sementara agar tidak rugi.`,
        });
      } else {
        const res = await unfreezeProductKeys('all');
        toast({
          title: 'Maintenance Selesai',
          description: `Script "${prod.title}" dibuka kembali normal. ${res?.count || 0} key aktif dilanjutkan secara utuh.`,
        });
      }

      loadAllData();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus produk script ini?')) return;
    await deleteTokoScript(id);
    toast({ title: 'Produk Dihapus', description: 'Script berhasil dihapus dari katalog Toko Script.' });
    loadAllData();
  };

  // Add media URL directly
  const handleAddMediaUrl = () => {
    if (!newMediaUrl.trim()) return;
    const item: MediaAdItem = {
      id: 'm-' + Math.random().toString(36).slice(2, 8),
      url: newMediaUrl.trim(),
      type: newMediaType,
    };
    setFormMedia(prev => [...prev, item]);
    setNewMediaUrl('');
  };

  // Upload file media
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      const res = await uploadMediaFile(file, (msg) => setUploadProgress(msg));
      const item: MediaAdItem = {
        id: 'm-' + Math.random().toString(36).slice(2, 8),
        url: res.url,
        type: res.type,
      };
      setFormMedia(prev => [...prev, item]);
      toast({ title: 'Upload Berhasil', description: `Media ${res.name} berhasil ditambahkan.` });
    } catch (err: any) {
      toast({ title: 'Upload Gagal', description: err.message || 'Gagal upload file', variant: 'destructive' });
    } finally {
      setUploadingMedia(false);
      setUploadProgress('');
      e.target.value = '';
    }
  };

  const handleRemoveMedia = (id: string) => {
    setFormMedia(prev => prev.filter(m => m.id !== id));
  };

  // Package modifications
  const handleUpdatePackage = (index: number, field: keyof ScriptPackage, value: any) => {
    setFormPackages(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddCustomPackage = () => {
    const newPkg: ScriptPackage = {
      id: 'pkg-' + Math.random().toString(36).slice(2, 8),
      name: 'Paket Kustom',
      days: 30,
      price: 50000,
      is_active: true,
      description: 'Deskripsi paket kustom',
    };
    setFormPackages(prev => [...prev, newPkg]);
  };

  const handleRemovePackage = (index: number) => {
    setFormPackages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveProduct = async () => {
    if (!formTitle.trim()) {
      toast({ title: 'Judul Wajib Diisi', description: 'Masukkan nama script.', variant: 'destructive' });
      return;
    }

    setSavingProduct(true);
    try {
      const cleanRawId = formRawId.trim() ? formRawId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : undefined;

      if (editingId) {
        const existingProd = products.find((p) => p.id === editingId);
        const resolvedRawId = cleanRawId || existingProd?.rawId || editingId;

        // Optimistically update local state so UI instantly reflects changes
        setProducts(prev => prev.map(p => p.id === editingId ? {
          ...p,
          title: formTitle.trim(),
          description: formDescription.trim(),
          rawId: resolvedRawId,
          luaScript: formLuaScript,
          media: formMedia,
          packages: formPackages,
          resellerCommissionPct: Number(formCommissionPct) || 20,
          isActive: formIsActive,
          isMaintenance: formIsMaintenance,
          maintenanceNotice: formMaintenanceNotice.trim(),
          updatedAt: new Date().toISOString(),
        } : p));

        await updateTokoScript(editingId, {
          title: formTitle.trim(),
          description: formDescription.trim(),
          rawId: resolvedRawId,
          luaScript: formLuaScript,
          media: formMedia,
          packages: formPackages,
          resellerCommissionPct: Number(formCommissionPct) || 20,
          isActive: formIsActive,
          isMaintenance: formIsMaintenance,
          maintenanceNotice: formMaintenanceNotice.trim(),
          maintenanceStartedAt: formIsMaintenance ? (existingProd?.maintenanceStartedAt || new Date().toISOString()) : null,
        });

        // If maintenance status toggled, freeze or unfreeze keys automatically
        if (existingProd && existingProd.isMaintenance !== formIsMaintenance) {
          if (formIsMaintenance) {
            const res = await freezeProductKeys('toko_script');
            toast({
              title: 'Script Dikunci Maintenance',
              description: `Script "${formTitle.trim()}" dikunci. ${res?.count || 0} key pelanggan dibekukan sementara agar tidak rugi.`,
            });
          } else {
            const res = await unfreezeProductKeys('toko_script');
            toast({
              title: 'Maintenance Selesai',
              description: `Script "${formTitle.trim()}" dibuka normal. ${res?.count || 0} key dilanjutkan durasinya secara utuh.`,
            });
          }
        } else {
          toast({ title: 'Script Diperbarui', description: 'Perubahan produk & script berhasil disimpan.' });
        }
      } else {
        const newProduct = await addTokoScript({
          title: formTitle.trim(),
          description: formDescription.trim(),
          rawId: cleanRawId,
          luaScript: formLuaScript,
          media: formMedia,
          packages: formPackages,
          resellerCommissionPct: Number(formCommissionPct) || 20,
          isActive: formIsActive,
          isMaintenance: formIsMaintenance,
          maintenanceNotice: formMaintenanceNotice.trim(),
        });
        if (newProduct) {
          setProducts(prev => [...prev, newProduct]);
        }
        toast({ title: 'Script Ditambahkan', description: 'Script baru kini tersedia di Toko Script.' });
      }

      setIsModalOpen(false);
      loadAllData();
    } catch (err: any) {
      console.error('Save product error:', err);
      toast({ title: 'Gagal Menyimpan', description: err.message || 'Terjadi kesalahan saat menyimpan.', variant: 'destructive' });
    } finally {
      setSavingProduct(false);
    }
  };

  // Reset commission action
  const handleConfirmResetCommission = async () => {
    if (!selectedResellerForReset) return;
    try {
      const res = await developerResetResellerCommission(selectedResellerForReset.id, resetReason);
      if (res.success) {
        toast({ title: 'Komisi Direset', description: res.message });
        setResetModalOpen(false);
        setSelectedResellerForReset(null);
        loadAllData();
      } else {
        toast({ title: 'Gagal', description: res.message, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // Reseller CRUD methods
  const handleOpenNewReseller = () => {
    setEditingResellerId(null);
    setResName('');
    setResUsername('');
    setResPassword('');
    setResEmail('');
    setResPhone('');
    setResPayoutMethod('QRIS');
    setResPayoutAccountNumber('');
    setResPayoutAccountName('');
    setResReferralCode('');
    // Komisi & Scope diset default dari global settings
    setResCommissionPct(globalSettings.defaultCommissionPct || 20);
    setResCommissionScope(globalSettings.defaultScope || 'both');
    setResBuyerDiscountPct(0);
    setResIsActive(true);
    setIsResellerModalOpen(true);
  };

  const handleEditReseller = (r: ResellerAccount) => {
    setEditingResellerId(r.id);
    setResName(r.name || '');
    setResUsername(r.username);
    setResPassword(r.password);
    setResEmail(r.email || '');
    setResPhone(r.phone);
    setResPayoutMethod(r.payoutMethod || 'QRIS');
    setResPayoutAccountNumber(r.payoutAccountNumber || '');
    setResPayoutAccountName(r.payoutAccountName || r.username);
    setResReferralCode(r.referralCode || '');
    setResCommissionPct(r.commissionPct || 20);
    setResCommissionScope(r.commissionScope || 'both');
    setResBuyerDiscountPct(0);
    setResIsActive(r.isActive);
    setIsResellerModalOpen(true);
  };

  const handleDeleteReseller = async (id: string, name: string) => {
    if (!confirm(`Hapus akun reseller "@${name}"? Aksi ini tidak dapat dibatalkan.`)) return;
    await developerDeleteReseller(id);
    toast({ title: 'Reseller Dihapus', description: `Akun reseller @${name} telah dihapus.` });
    loadAllData();
  };

  const handleSaveReseller = async () => {
    if (!resUsername.trim() || !resPassword.trim()) {
      toast({ title: 'Data Belum Lengkap', description: 'Username dan password wajib diisi.', variant: 'destructive' });
      return;
    }

    try {
      if (editingResellerId) {
        const res = await developerUpdateReseller(editingResellerId, {
          username: resUsername.trim().toLowerCase(),
          password: resPassword,
          phone: resPhone.trim(),
          payoutMethod: resPayoutMethod as any,
          payoutAccountNumber: resPayoutAccountNumber.trim(),
          payoutAccountName: resPayoutAccountName.trim() || resUsername.trim(),
          // Komisi tidak diubah saat edit (atur komisi saat pembuatan akun saja)
          commissionScope: resCommissionScope,
          isActive: resIsActive,
        });

        if (res.success) {
          toast({ title: 'Berhasil Diperbarui', description: `Akun reseller @${resUsername} berhasil diupdate.` });
          setIsResellerModalOpen(false);
          loadAllData();
        } else {
          toast({ title: 'Gagal', description: res.message, variant: 'destructive' });
        }
      } else {
        const res = await developerCreateReseller({
          username: resUsername.trim().toLowerCase(),
          password: resPassword,
          phone: resPhone.trim(),
          payoutMethod: resPayoutMethod,
          payoutAccountNumber: resPayoutAccountNumber.trim(),
          payoutAccountName: resPayoutAccountName.trim() || resUsername.trim(),
          commissionPct: Number(resCommissionPct) || 20,
          commissionScope: resCommissionScope,
        });

        if (res.success) {
          toast({ title: 'Reseller Dibuat', description: `Akun reseller @${resUsername} berhasil dibuat.` });
          setIsResellerModalOpen(false);
          loadAllData();
        } else {
          toast({ title: 'Gagal', description: res.message, variant: 'destructive' });
        }
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  // Reseller overall stats
  const totalOmzetReseller = resellers.reduce((sum, r) => sum + (r.totalSalesAmount || 0), 0);
  const totalKomisiAktif = resellers.reduce((sum, r) => sum + (r.activeCommission || 0), 0);
  const totalKomisiDitarik = resellers.reduce((sum, r) => sum + (r.totalWithdrawnCommission || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl glass-card border-border/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-display text-foreground">
              Toko Script & Sistem Bagi Hasil Reseller
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Atur produk script, durasi/harga paket, multi-media ads, dan kelola komisi bagi hasil reseller.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAllData}
            disabled={loading}
            className="text-xs rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleOpenNewProduct}
            className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl gap-1.5 shadow-md shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Tambah Script Baru
          </Button>
        </div>
      </div>

      {/* Visibility on Homepage Toggle Banner */}
      <div className="p-4 rounded-2xl glass-card border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-xl shadow-lg">
        <div className="flex items-start sm:items-center gap-3">
          <div className={`p-2.5 rounded-xl transition-colors ${showOnHome ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-muted/60 text-muted-foreground border border-border'}`}>
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                Tampilkan Toko Script di Halaman Utama
              </span>
              <Badge variant={showOnHome ? 'default' : 'outline'} className={`text-[10px] ${showOnHome ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'text-muted-foreground'}`}>
                {showOnHome ? 'Aktif di Halaman Utama' : 'Disembunyikan / Nonaktif'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showOnHome
                ? 'Tab Toko Script ditampilkan di halaman depan bersama Arexans Tools.'
                : 'Toko Script disembunyikan dari halaman utama (hanya Arexans Tools yang tampil).'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Label htmlFor="toko-visibility-switch" className="text-xs font-medium text-muted-foreground cursor-pointer">
            {showOnHome ? 'Nonaktifkan / Sembunyikan' : 'Aktifkan di Halaman Utama'}
          </Label>
          <Switch
            id="toko-visibility-switch"
            checked={showOnHome}
            disabled={togglingVisibility}
            onCheckedChange={handleToggleHomeVisibility}
          />
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
        <TabsList className="bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="products" className="text-xs gap-1.5 rounded-lg">
            <ShoppingBag className="w-3.5 h-3.5" />
            Produk Toko Script ({products.length})
          </TabsTrigger>
          <TabsTrigger value="keysystem" className="text-xs gap-1.5 rounded-lg">
            <Key className="w-3.5 h-3.5 text-primary" />
            Key System Script
          </TabsTrigger>
          <TabsTrigger value="resellers" className="text-xs gap-1.5 rounded-lg">
            <Users className="w-3.5 h-3.5" />
            Mitra Reseller ({resellers.length})
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-xs gap-1.5 rounded-lg">
            <DollarSign className="w-3.5 h-3.5" />
            Riwayat Pencairan Komisi ({withdrawals.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SCRIPT PRODUCTS */}
        <TabsContent value="products" className="space-y-4">
          {products.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 text-center space-y-3 border-dashed border-border/80">
              <ShoppingBag className="w-10 h-10 text-muted-foreground/50 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">Belum Ada Produk Script</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Toko Script saat ini masih kosong sesuai permintaan awal. Klik tombol di bawah untuk menambahkan script pertama Anda!
                </p>
              </div>
              <Button
                onClick={handleOpenNewProduct}
                size="sm"
                className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Tambah Script Sekarang
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="glass-card rounded-2xl overflow-hidden border border-border/70 flex flex-col justify-between"
                >
                  <div className="p-4 space-y-3">
                    {/* Media Preview */}
                    <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden border border-border/60">
                      {prod.media && prod.media.length > 0 ? (
                        prod.media[0].type === 'video' ? (
                          <video src={prod.media[0].url} className="w-full h-full object-cover" />
                        ) : (
                          <img
                            src={prod.media[0].url}
                            alt={prod.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/arexans-icon.jpg';
                            }}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          Tidak ada media
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-black/70 text-white font-medium backdrop-blur-sm">
                          {prod.media?.length || 0} Media
                        </span>
                        {prod.isMaintenance && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500 text-black animate-pulse">
                            🔴 Maintenance
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                            prod.isActive
                              ? 'bg-emerald-500/80 text-white'
                              : 'bg-destructive/80 text-white'
                          }`}
                        >
                          {prod.isActive ? 'Aktif' : 'Non-aktif'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-sm text-foreground">{prod.title}</h4>
                        {prod.isMaintenance && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                            Terkunci
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {prod.description || 'Tidak ada deskripsi'}
                      </p>
                    </div>

                    {/* Packages Preview */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">Paket Durasi:</span>
                      <div className="flex flex-wrap gap-1">
                        {prod.packages?.map((pkg) => (
                          <span
                            key={pkg.id}
                            className={`text-[10px] px-2 py-0.5 rounded-md border ${
                              pkg.is_active
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-muted/40 border-border text-muted-foreground line-through'
                            }`}
                          >
                            {pkg.name}: {formatRupiah(pkg.price)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      Komisi Reseller:{' '}
                      <strong className="text-foreground">{prod.resellerCommissionPct || 20}%</strong>
                    </div>

                    {/* Script Lua Status & Loadstring Action */}
                    {prod.luaScript && prod.luaScript.trim() ? (
                      <div className="p-2 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-cyan-300 font-medium">
                          <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="truncate">Script Terpasang ({prod.luaScript.split('\n').length} baris)</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const code = generateScriptLoaderCode("keysystem", getScriptRawId(prod));
                              navigator.clipboard.writeText(code);
                              toast({ title: 'Loadstring Disalin!', description: 'Format loader resmi berhasil disalin.' });
                            }}
                            className="px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-mono flex items-center gap-1 transition-colors"
                            title="Salin loadstring"
                          >
                            <Copy className="w-3 h-3" />
                            Loadstring
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              window.open(`/api/public/raw/${getScriptRawId(prod)}?key=DEV_TEST_KEY`, '_blank');
                            }}
                            className="px-2 py-0.5 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 transition-colors"
                            title="Buka / Test Endpoint Raw"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Test
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Belum ada script Lua terpasang</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEditProduct(prod)}
                          className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-medium"
                        >
                          + Pasang
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2">
                    <Button
                      variant={prod.isMaintenance ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => handleToggleProductMaintenance(prod)}
                      className={`h-8 px-2.5 text-xs rounded-xl font-semibold gap-1.5 ${
                        prod.isMaintenance
                          ? 'bg-destructive/20 border-destructive/50 text-destructive hover:bg-destructive/30'
                          : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                      }`}
                      title={prod.isMaintenance ? 'Buka dari maintenance & lanjutkan key' : 'Kunci maintenance & bekukan key pembeli'}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      {prod.isMaintenance ? 'Buka Normal' : 'Kunci Maintenance'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditProduct(prod)}
                      className="h-8 px-2.5 text-xs rounded-xl"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="h-8 px-2.5 text-xs rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: KEY SYSTEM TOKO SCRIPT (Strict 1 Key = 1 Product) */}
        <TabsContent value="keysystem" className="space-y-4">
          <TokoScriptKeyManagement products={products} />
        </TabsContent>

        {/* TAB 3: RESELLERS */}
        <TabsContent value="resellers" className="space-y-4">
          {/* Global Reseller Settings Card */}
          <div className="glass-card p-5 rounded-2xl border-primary/30 bg-primary/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  Pengaturan Kemitraan & Diskon Reseller (Global)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Atur default komisi akun baru, harga aktivasi otomatis Pakasir, serta cakupan produk diskon.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleSaveGlobalSettings}
                disabled={savingSettings}
                className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-1.5 h-9"
              >
                {savingSettings ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                Simpan Pengaturan Reseller
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-background/60 border border-border/80 space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-emerald-400" />
                  Default Komisi Akun Baru (%)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={globalSettings.defaultCommissionPct}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      defaultCommissionPct: Number(e.target.value) || 20,
                    })
                  }
                  className="h-8 text-xs font-mono font-bold text-emerald-400 rounded-lg"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ditetapkan saat pembuatan akun reseller baru.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-background/60 border border-border/80 space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                  Cakupan Produk Komisi Default
                </Label>
                <select
                  value={globalSettings.defaultScope}
                  onChange={(e: any) =>
                    setGlobalSettings({
                      ...globalSettings,
                      defaultScope: e.target.value,
                    })
                  }
                  className="w-full h-8 text-xs rounded-lg bg-background border border-border px-2 text-foreground font-medium"
                >
                  <option value="both">Keduanya (Toko Script & Tools)</option>
                  <option value="toko_script">Hanya Toko Script</option>
                  <option value="arexans_tools">Hanya Arexans Tools</option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Produk yang berhak mendapatkan komisi bagi hasil.
                </p>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card p-4 rounded-2xl border-border/70 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                Total Omzet Penjualan Reseller
              </span>
              <div className="text-lg md:text-xl font-bold font-mono text-primary">
                {formatRupiah(totalOmzetReseller)}
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl border-emerald-500/30 bg-emerald-950/15 space-y-1">
              <span className="text-xs text-emerald-300 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Komisi Aktif Siap Ditarik
              </span>
              <div className="text-lg md:text-xl font-bold font-mono text-emerald-400">
                {formatRupiah(totalKomisiAktif)}
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl border-border/70 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                Total Komisi Sudah Direset/Dicairkan
              </span>
              <div className="text-lg md:text-xl font-bold font-mono text-cyan-400">
                {formatRupiah(totalKomisiDitarik)}
              </div>
            </div>
          </div>

          {/* Resellers Table */}
          <div className="glass-card rounded-2xl border border-border/70 overflow-hidden">
            <div className="p-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-foreground">Daftar Mitra Reseller</h3>
                <p className="text-xs text-muted-foreground">
                  Pembuatan akun via manual Developer atau otomatis beli seharga Rp 80.000 via Pakasir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearAllLogs}
                  className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border-amber-500/40 rounded-xl gap-1.5"
                  title="Kosongkan semua log simulasi atau riwayat transaksi"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Kosongkan</span> Log Simulasi
                </Button>
                <Button
                  size="sm"
                  onClick={handleOpenNewReseller}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-1.5 shadow-md shadow-emerald-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  Tambah Reseller Manual
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left p-3">Username Reseller</th>
                    <th className="text-left p-3">Komisi & Scope</th>
                    <th className="text-left p-3">Metode Payout (QRIS/DANA/SeaBank)</th>
                    <th className="text-right p-3">Total Penjualan</th>
                    <th className="text-right p-3">Komisi Aktif</th>
                    <th className="text-right p-3">Total Ditarik</th>
                    <th className="text-center p-3">Aksi Developer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {resellers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        Belum ada reseller terdaftar (Log Bersih / Dikosongkan). Tambah reseller manual atau beli otomatis via Pakasir (Rp 80.000).
                      </td>
                    </tr>
                  ) : (
                    resellers.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-foreground flex items-center gap-1.5 font-mono">
                            @{r.username}
                            {!r.isActive && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-destructive/20 text-destructive border border-destructive/30 font-sans">
                                Nonaktif
                              </span>
                            )}
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono inline-block mt-0.5 ${r.registeredVia === 'pakasir_purchase' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                            {r.registeredVia === 'pakasir_purchase' ? 'Beli Pakasir (80rb)' : 'Manual Developer'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-emerald-400 font-mono flex items-center gap-1">
                            <Lock className="w-3 h-3 text-muted-foreground" title="Komisi diatur saat pembuatan akun saja" />
                            {r.commissionPct || 20}%
                          </div>
                          <span className="text-[10px] text-muted-foreground block">
                            {r.commissionScope === 'both' ? 'Keduanya (Tools & Script)' : r.commissionScope === 'toko_script' ? 'Hanya Toko Script' : 'Hanya Arexans Tools'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-mono text-[10px]">
                              {r.payoutMethod || 'QRIS'}
                            </span>
                            <span>{r.phone}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {r.payoutAccountNumber} ({r.payoutAccountName})
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-bold font-mono">{formatRupiah(r.totalSalesAmount)}</div>
                          <div className="text-[10px] text-muted-foreground">{r.totalSalesCount} transaksi</div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-bold font-mono text-emerald-400">
                            {formatRupiah(r.activeCommission)}
                          </div>
                          {r.activeCommission > 0 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Siap cair
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">
                          {formatRupiah(r.totalWithdrawnCommission)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={r.activeCommission <= 0}
                              onClick={() => {
                                setSelectedResellerForReset(r);
                                setResetReason(`Transfer komisi ${formatRupiah(r.activeCommission)} ke ${r.payoutMethod} ${r.payoutAccountNumber}`);
                                setResetModalOpen(true);
                              }}
                              className={`h-7 px-2 text-xs rounded-lg ${
                                r.activeCommission > 0
                                  ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                                  : 'opacity-40'
                              }`}
                              title="Reset Komisi setelah transfer (reset ke Rp 0)"
                            >
                              Reset
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleClearSingleResellerLog(r.id, r.name)}
                              className="h-7 w-7 p-0 rounded-lg text-amber-400 hover:bg-amber-500/10"
                              title="Kosongkan Log Transaksi Reseller Ini"
                            >
                              <Eraser className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditReseller(r)}
                              className="h-7 w-7 p-0 rounded-lg hover:bg-muted"
                              title="Edit Reseller"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteReseller(r.id, r.name)}
                              className="h-7 w-7 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                              title="Hapus Reseller"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: WITHDRAWALS & PAYOUT LOG */}
        <TabsContent value="withdrawals" className="space-y-4">
          <div className="glass-card rounded-2xl border border-border/70 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h3 className="font-bold text-sm text-foreground">Riwayat Pencairan Komisi Reseller</h3>
              <p className="text-xs text-muted-foreground">
                Setiap kali komisi berhasil dicairkan, saldo aktif reseller direset ulang ke Rp 0.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left p-3">Tanggal</th>
                    <th className="text-left p-3">Reseller</th>
                    <th className="text-left p-3">Rekening Tujuan</th>
                    <th className="text-right p-3">Nominal Ditarik</th>
                    <th className="text-left p-3">Catatan</th>
                    <th className="text-center p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {withdrawals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Belum ada riwayat pencairan komisi.
                      </td>
                    </tr>
                  ) : (
                    withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-muted/20">
                        <td className="p-3 text-muted-foreground">
                          {new Date(w.requestedAt).toLocaleString('id-ID')}
                        </td>
                        <td className="p-3">
                          <div className="font-bold">{w.resellerName}</div>
                          <div className="text-[10px] text-primary font-mono">{w.resellerCode}</div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold">{w.payoutMethod}</span>: {w.accountNumber} ({w.accountName})
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">
                          {formatRupiah(w.amount)}
                        </td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">
                          {w.notes || '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                            Berhasil (Reset)
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* CREATE / EDIT SCRIPT PRODUCT MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingId ? 'Edit Produk Script' : 'Tambah Produk Script Baru'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Atur judul, deskripsi, upload/url multi-media ads, durasi & harga per paket.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* 1. Judul & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Nama / Judul Script *</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Auto Farm & Aim Script VIP"
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Status Produk</Label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-background/50">
                  <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                  <span className="text-xs font-medium">{formIsActive ? 'Aktif' : 'Nonaktif'}</span>
                </div>
              </div>
            </div>

            {/* Kunci Maintenance Per-Produk */}
            <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Kunci Maintenance Produk Ini
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Jika diaktifkan, publik tidak dapat membeli script ini dan masa aktif key pembeli otomatis dibekukan sementara agar pembeli tidak rugi.
                  </p>
                </div>
                <Switch
                  checked={formIsMaintenance}
                  onCheckedChange={setFormIsMaintenance}
                />
              </div>

              {formIsMaintenance && (
                <div className="pt-1.5 space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Pesan / Alasan Maintenance untuk Pembeli:</Label>
                  <Input
                    value={formMaintenanceNotice}
                    onChange={(e) => setFormMaintenanceNotice(e.target.value)}
                    placeholder="Contoh: Sedang update patch Roblox terbaru..."
                    className="h-8 text-xs bg-background/80"
                  />
                </div>
              )}
            </div>

            {/* 2. Deskripsi */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deskripsi Script</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Jelaskan fitur-fitur unggulan script, game yang didukung, cara penggunaan, dan keunggulan lainnya..."
                rows={3}
                className="text-xs rounded-xl resize-none"
              />
            </div>

            {/* 3. PASANG SCRIPT LUA (SCRIPT LANGSUNG JALAN / EXECUTABLE) */}
            <div className="space-y-3.5 p-4 rounded-2xl border border-cyan-500/40 bg-cyan-950/20 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Pasang Script Lua (Script Langsung Jalan / Executable) *
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sesuai instruksi Anda: Pasang script yang langsung jalan di sini. Sistem akan otomatis memasang wrapper proteksi <strong>Key System & HWID sendiri (Default 1 HWID slot)</strong>.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-300 bg-cyan-950/40">
                  {formLuaScript ? `${formLuaScript.split('\n').length} Baris Script` : 'Belum Ada Script'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <span>Custom Raw ID / Slug Endpoint</span>
                    <span className="text-[10px] text-muted-foreground">(Opsional)</span>
                  </Label>
                  <Input
                    value={formRawId}
                    onChange={(e) => setFormRawId(e.target.value)}
                    placeholder={editingId || "contoh: bloxfruits-vip"}
                    className="h-8 text-xs font-mono rounded-lg bg-background/60"
                  />
                  <span className="text-[10px] text-muted-foreground block truncate">
                    Endpoint: /api/public/raw/{formRawId.trim() || editingId || 'id'}
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Proteksi HWID Otomatis</Label>
                  <div className="p-2 rounded-lg border border-border/60 bg-background/40 text-[11px] space-y-0.5 text-muted-foreground">
                    <div className="font-semibold text-foreground flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Default Kuota: 1 Slot HWID</span>
                    </div>
                    <p className="text-[10px]">
                      Jika pembeli ingin memakai di device lain, mereka wajib membayar penambahan +1 slot HWID permanen di portal web.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-muted-foreground">Kode Script Lua Asli:</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formLuaScript.length} karakter
                  </span>
                </div>
                <Textarea
                  value={formLuaScript}
                  onChange={(e) => setFormLuaScript(e.target.value)}
                  placeholder={`-- Paste script Lua langsung jalan Anda di sini\n-- Contoh:\nprint("Axstools script running!")\nloadstring(game:HttpGet("https://raw.githubusercontent.com/..."))()`}
                  rows={8}
                  className="text-xs font-mono rounded-xl resize-y bg-black/70 border-cyan-500/30 text-cyan-200 placeholder:text-muted-foreground/50 leading-relaxed"
                />
              </div>

              {/* Live Loadstring Loader Output Preview */}
              <div className="p-3 rounded-xl border border-border/70 bg-black/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5 text-primary" />
                    Output Loadstring yang Diberikan ke Pembeli Saat Selesai Order:
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10 gap-1"
                    onClick={() => {
                      const sampleKey = "AXS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
                      const sampleRawId = formRawId.trim() || editingId || 'id';
                      const code = generateScriptLoaderCode(sampleKey, sampleRawId);
                      navigator.clipboard.writeText(code);
                      toast({ title: 'Disalin!', description: 'Contoh loadstring berhasil disalin ke clipboard.' });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Salin Contoh
                  </Button>
                </div>
                <pre className="p-2.5 rounded-lg bg-black/80 text-[11px] font-mono text-emerald-400 whitespace-pre-wrap break-all border border-white/5">
                  {generateScriptLoaderCode("keysystem", formRawId.trim() || editingId || 'id')}
                </pre>
              </div>
            </div>

            {/* 3. MULTI-MEDIA ADS (Gambar / Video > 1) */}
            <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-card/40">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-primary" />
                    Media Ads Promosi (Gambar & Video Lebih Dari 1)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Upload file atau tempel URL video/gambar demo. Anda bisa menambahkan lebih dari satu media!
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {formMedia.length} Media
                </Badge>
              </div>

              {/* Upload or URL input box */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-3">
                  <select
                    value={newMediaType}
                    onChange={(e: any) => setNewMediaType(e.target.value)}
                    className="w-full h-9 text-xs rounded-xl bg-background border border-border px-2 text-foreground"
                  >
                    <option value="image">Gambar (Image)</option>
                    <option value="video">Video (MP4/WebM)</option>
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <Input
                    value={newMediaUrl}
                    onChange={(e) => setNewMediaUrl(e.target.value)}
                    placeholder="https://catbox.moe/... atau URL gambar/video"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>

                <div className="sm:col-span-3 flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMediaUrl}
                    className="h-9 text-xs rounded-xl flex-1"
                  >
                    + URL
                  </Button>

                  <label className="h-9 px-2.5 rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center cursor-pointer text-xs transition">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={handleUploadFile}
                      disabled={uploadingMedia}
                    />
                  </label>
                </div>
              </div>

              {uploadingMedia && (
                <div className="text-[11px] text-primary flex items-center gap-1.5 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {uploadProgress || 'Mengunggah media ads...'}
                </div>
              )}

              {/* Added Media Previews */}
              {formMedia.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {formMedia.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="relative rounded-lg overflow-hidden aspect-video border border-border/80 bg-slate-950 group"
                    >
                      {m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.url} alt="Media" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white">
                        {m.type.toUpperCase()}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(m.id)}
                        className="absolute top-1 right-1 p-1 rounded bg-destructive text-white opacity-0 group-hover:opacity-100 transition shadow"
                        title="Hapus media ini"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. PAKET DURASI & HARGA */}
            <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-card/40">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-primary" />
                    Atur Durasi & Harga Paket
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Contoh: 2 Minggu (14 hari), 30 Hari, 90 Hari, 180 Hari, Lifetime.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomPackage}
                  className="h-7 text-xs rounded-lg gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Tambah Paket
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {formPackages.map((pkg, idx) => (
                  <div
                    key={pkg.id || idx}
                    className="p-2.5 rounded-xl border border-border/60 bg-background/50 flex flex-col sm:flex-row items-center gap-2"
                  >
                    <div className="flex-1 grid grid-cols-3 gap-2 w-full">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Nama Paket</span>
                        <Input
                          value={pkg.name}
                          onChange={(e) => handleUpdatePackage(idx, 'name', e.target.value)}
                          placeholder="2 Minggu / 30 Hari"
                          className="h-8 text-xs rounded-lg"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Durasi (Hari)</span>
                        <Input
                          type="number"
                          value={pkg.days}
                          onChange={(e) => handleUpdatePackage(idx, 'days', Number(e.target.value))}
                          placeholder="14 / 30 / 999999"
                          className="h-8 text-xs rounded-lg"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Harga (Rp)</span>
                        <Input
                          type="number"
                          value={pkg.price}
                          onChange={(e) => handleUpdatePackage(idx, 'price', Number(e.target.value))}
                          placeholder="25000"
                          className="h-8 text-xs rounded-lg font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">Aktif:</span>
                        <Switch
                          checked={pkg.is_active}
                          onCheckedChange={(val) => handleUpdatePackage(idx, 'is_active', val)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePackage(idx)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                        title="Hapus paket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Komisi Reseller (%) */}
            <div className="space-y-1.5 p-4 rounded-xl border border-border/70 bg-card/40">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-foreground">
                    Komisi Bagi Hasil Reseller (%)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Persentase komisi yang didapat reseller ketika berhasil menjual script ini.
                  </p>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={formCommissionPct}
                    onChange={(e) => setFormCommissionPct(Number(e.target.value))}
                    className="h-9 text-xs rounded-xl font-bold text-primary font-mono text-right"
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-xl text-xs h-10"
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleSaveProduct}
                disabled={savingProduct}
                className="flex-1 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground h-10 shadow-md shadow-primary/20 gap-1.5"
              >
                {savingProduct ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  editingId ? 'Simpan Perubahan' : 'Buat Produk Script'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DEVELOPER RESET COMMISSION MODAL */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="max-w-md p-5 bg-card/95 backdrop-blur-2xl border-border/80 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Reset / Bayar Komisi Reseller
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Konfirmasi bahwa komisi bagi hasil telah ditransfer ke rekening reseller. Saldo aktif reseller akan direset ulang ke Rp 0.
            </DialogDescription>
          </DialogHeader>

          {selectedResellerForReset && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-muted/40 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nama Reseller:</span>
                  <strong className="text-foreground">{selectedResellerForReset.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kode Referral:</span>
                  <span className="font-mono text-primary font-bold">{selectedResellerForReset.referralCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tujuan Transfer:</span>
                  <span>{selectedResellerForReset.payoutMethod} - {selectedResellerForReset.payoutAccountNumber}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-1">
                  <span className="text-muted-foreground">Nominal yang Direset:</span>
                  <strong className="text-emerald-400 font-mono text-sm">
                    {formatRupiah(selectedResellerForReset.activeCommission)}
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan / Bukti Transfer Developer</Label>
                <Input
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Contoh: Transfer DANA Ref #12345 Selesai"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetModalOpen(false)}
                  className="flex-1 rounded-xl text-xs h-10"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmResetCommission}
                  className="flex-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white h-10"
                >
                  Konfirmasi & Reset ke Rp 0
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CREATE / EDIT RESELLER MANUAL DIALOG */}
      <Dialog open={isResellerModalOpen} onOpenChange={setIsResellerModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6 bg-card/95 backdrop-blur-2xl border-border/80 shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              {editingResellerId ? 'Edit Akun Reseller' : 'Tambah Akun Reseller Manual'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Atur data akun, komisi bagi hasil, dan cakupan produk kemitraan reseller.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Username Reseller *</Label>
                <Input
                  value={resUsername}
                  onChange={(e) => setResUsername(e.target.value.toLowerCase())}
                  placeholder="budistore"
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Password Akun *</Label>
                <Input
                  value={resPassword}
                  onChange={(e) => setResPassword(e.target.value)}
                  placeholder="Password login portal"
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">No. WhatsApp / HP *</Label>
              <Input
                value={resPhone}
                onChange={(e) => setResPhone(e.target.value)}
                placeholder="0812xxxxxxxx (untuk koordinasi pencairan)"
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            {/* Payout Info (Wajib QRIS / DANA / SEABANK - QRIS Diutamakan) */}
            <div className="p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">Rekening / E-Wallet Pencairan Komisi:</span>
                <span className="text-[10px] text-muted-foreground">Wajib QRIS / DANA / SeaBank</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <select
                  value={resPayoutMethod}
                  onChange={(e) => setResPayoutMethod(e.target.value)}
                  className="h-8 text-xs rounded-lg bg-background border border-border px-2 text-foreground font-semibold"
                >
                  <option value="QRIS">QRIS (Diutamakan)</option>
                  <option value="DANA">DANA</option>
                  <option value="SEABANK">SeaBank</option>
                </select>
                <Input
                  value={resPayoutAccountNumber}
                  onChange={(e) => setResPayoutAccountNumber(e.target.value)}
                  placeholder={resPayoutMethod === 'QRIS' ? 'ID/No HP QRIS / Link' : 'No. HP / No. Rekening'}
                  className="col-span-2 h-8 text-xs rounded-lg"
                  required
                />
              </div>
              <Input
                value={resPayoutAccountName}
                onChange={(e) => setResPayoutAccountName(e.target.value)}
                placeholder="Atas Nama Rekening / Merchant QRIS"
                className="h-8 text-xs rounded-lg"
                required
              />
            </div>

            {/* KOMISI BAGI HASIL (%) DIATUR SAAT PEMBUATAN AKUN */}
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-emerald-300">
                    Komisi Bagi Hasil Reseller (%)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {editingResellerId
                      ? '🔒 Komisi ditetapkan saat pembuatan akun (Terkunci)'
                      : 'Diatur saat pembuatan akun saja (misal: 20%).'}
                  </p>
                </div>
                <div className="w-28">
                  {editingResellerId ? (
                    <div className="h-8 px-2.5 rounded-lg bg-muted/60 border border-border flex items-center justify-end font-mono font-bold text-xs text-muted-foreground gap-1">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span>{resCommissionPct}%</span>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={resCommissionPct}
                      onChange={(e) => setResCommissionPct(Number(e.target.value))}
                      className="h-8 text-xs font-mono font-bold text-right text-emerald-400 rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* SETTINGS PRODUK YANG DISKON/KOMISI RESELLER */}
              <div className="space-y-1.5 border-t border-emerald-500/20 pt-2">
                <Label className="text-xs font-bold text-emerald-300">
                  Cakupan Produk yang Diskon / Komisi Reseller:
                </Label>
                <select
                  value={resCommissionScope}
                  onChange={(e: any) => setResCommissionScope(e.target.value)}
                  className="w-full h-8 text-xs rounded-lg bg-background border border-emerald-500/40 px-2 text-foreground font-medium"
                >
                  <option value="both">Keduanya (Toko Script & Arexans Tools)</option>
                  <option value="toko_script">Hanya Toko Script</option>
                  <option value="arexans_tools">Hanya Arexans Tools</option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Reseller hanya akan menerima komisi & memberikan diskon dari produk yang sesuai dengan cakupan ini.
                </p>
              </div>

              {/* DISKON UNTUK PEMBELI (%) */}
              <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2">
                <div>
                  <Label className="text-xs font-bold text-emerald-300">
                    Diskon untuk Pembeli (%)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Potongan harga bagi pembeli yang menggunakan referral ini.
                  </p>
                </div>
                <div className="w-20">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={resBuyerDiscountPct}
                    onChange={(e) => setResBuyerDiscountPct(Number(e.target.value))}
                    className="h-8 text-xs font-mono font-bold text-right text-cyan-400 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Status Aktif */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
              <span className="text-xs font-semibold">Status Akun Reseller:</span>
              <div className="flex items-center gap-2">
                <Switch checked={resIsActive} onCheckedChange={setResIsActive} />
                <span className="text-xs font-bold">{resIsActive ? 'Aktif' : 'Non-aktif'}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResellerModalOpen(false)}
                className="flex-1 rounded-xl text-xs h-10"
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleSaveReseller}
                className="flex-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white h-10 shadow-md shadow-emerald-500/20"
              >
                {editingResellerId ? 'Simpan Perubahan' : 'Buat Akun Reseller'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
