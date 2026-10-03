import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { 
  Settings, Package, Image, List, CreditCard, LogOut, Save, 
  Plus, Trash2, Edit2, Eye, EyeOff, RefreshCw, MessageSquare, Shield, ShieldX, ShieldOff, Key, FileText, FileCode, Upload, Tag, CheckCircle, Copy, Database, MapPin, Coins, Users, Film, Search, ReceiptText, Clock3, CircleDollarSign, X, ShoppingBag,
  Wrench, Pause, Play, Lock, AlertTriangle
} from 'lucide-react';
import GlobalBackground from '@/components/GlobalBackground';
import DeviceApprovalScreen from '@/components/DeviceApprovalScreen';
import DeviceManagement from '@/components/DeviceManagement';
import KeyManagement from '@/components/KeyManagement';
import ApiDocumentation from '@/components/ApiDocumentation';
import ScriptManagement from '@/components/ScriptManagement';
import WhitelistManagement from '@/components/WhitelistManagement';
import LuaUploadManager from '@/components/LuaUploadManager';
import MainLuaRecordings from '@/components/MainLuaRecordings';
import { MediaUploadField } from '@/components/MediaUploadField';
import DiscountManagement from '@/components/DiscountManagement';
import BackupRestore from '@/components/BackupRestore';
import StorageMonitor from '@/components/StorageMonitor';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { PaymentGatewaySettings } from '@/components/PaymentGatewaySettings';
import DeveloperAccessLogs from '@/components/DeveloperAccessLogs';
import { TokoScriptAdmin } from '@/components/TokoScriptAdmin';
import {
  getMaintenanceState,
  saveMaintenanceState,
  freezeProductKeys,
  unfreezeProductKeys,
  isDeveloperTesting,
  setDeveloperTestingBypass,
  MaintenanceState,
  DEFAULT_MAINTENANCE_STATE,
} from '@/lib/maintenanceStore';

interface SiteSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

interface PackageItem {
  id: string;
  name: string;
  display_name: string;
  price_per_day: number;
  description: string | null;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
}

interface AdItem {
  id: string;
  title: string;
  media_url: string;
  media_type: string;
  link_url: string | null;
  is_active: boolean;
  sort_order: number;
}

interface BackgroundItem {
  id: string;
  title: string;
  background_url: string;
  background_type: string;
  is_muted: boolean;
  is_active: boolean;
  sort_order: number;
}

interface TransactionItem {
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
  created_at: string;
  paid_at: string | null;
  ip_address: string | null;
}

const transactionStatusStyle: Record<string, string> = {
  paid: 'bg-success/15 text-success border-success/25',
  claimed: 'bg-success/15 text-success border-success/25',
  claimable: 'bg-primary/15 text-primary border-primary/25',
  pending: 'bg-warning/15 text-warning border-warning/25',
  expired: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/25',
};

const transactionStatusLabel: Record<string, string> = {
  paid: 'Dibayar',
  claimed: 'Selesai',
  claimable: 'Siap diklaim',
  pending: 'Menunggu',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
};

interface SocialLink {
  id: string;
  name: string;
  icon_type: string;
  url: string;
  label: string;
  link_location: string;
  is_active: boolean;
  sort_order: number;
}

const Admin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Device detection hook
  const {
    deviceId,
    deviceName,
    deviceInfo,
    deviceStatus,
    allSessions,
    isChecking,
    isLoggedIn,
    registerDevice,
    loadAllSessions,
    approveDevice,
    removeDevice,
    persistLogin,
    clearLogin
  } = useDeviceDetection();
  
  // Use persistent login state
  const [authenticated, setAuthenticated] = useState(isLoggedIn);

  // Settings state
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  
  // Packages state
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  
  // Ads state
  const [ads, setAds] = useState<AdItem[]>([]);
  const [editingAd, setEditingAd] = useState<AdItem | null>(null);
  
  // Backgrounds state
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [editingBackground, setEditingBackground] = useState<BackgroundItem | null>(null);
  
   // Transactions state
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txTab, setTxTab] = useState<'keysystem' | 'xcoins'>('keysystem');
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [txSearch, setTxSearch] = useState('');

  // Social Links state
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [editingSocialLink, setEditingSocialLink] = useState<SocialLink | null>(null);

  // Blocked IPs state
  const [blockedIps, setBlockedIps] = useState<{id: string; ip_address: string; reason: string | null; blocked_by: string | null; created_at: string}[]>([]);
  const [newBlockIp, setNewBlockIp] = useState('');
  const [newBlockReason, setNewBlockReason] = useState('');

  // XCoins users state
  const [xcoinsUsers, setXcoinsUsers] = useState<{id: string; phone: string; display_name: string | null; balance: number; is_active: boolean; created_at: string}[]>([]);
  const [keysSubTab, setKeysSubTab] = useState<'keysystem' | 'xcoins'>('keysystem');
  const [xcoinsSearch, setXcoinsSearch] = useState('');
  const [editingXcoinsUser, setEditingXcoinsUser] = useState<{id: string; phone: string; display_name: string | null; balance: number; is_active: boolean} | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');

  // Maintenance Control state
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(DEFAULT_MAINTENANCE_STATE);
  const [devTestingBypass, setDevTestingBypass] = useState<boolean>(isDeveloperTesting());
  const [keyStats, setKeyStats] = useState<{ total: number; frozen: number; active: number }>({ total: 0, frozen: 0, active: 0 });
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const loadMaintenanceAndKeys = async () => {
    try {
      const mState = await getMaintenanceState();
      setMaintenanceState(mState);
      setDevTestingBypass(isDeveloperTesting());

      const { data } = await supabase.from('app_settings').select('value').eq('key', 'license_keys').maybeSingle();
      if (data?.value) {
        const keys = JSON.parse(data.value);
        const frozen = keys.filter((k: any) => !!k.frozenUntil).length;
        const active = keys.filter((k: any) => !k.frozenUntil && new Date(k.expired) >= new Date()).length;
        setKeyStats({ total: keys.length, frozen, active });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleGlobalMaintenance = async (checked: boolean) => {
    setMaintenanceLoading(true);
    try {
      const nextState: MaintenanceState = {
        ...maintenanceState,
        globalMaintenance: checked,
        arexansToolsMaintenance: checked,
        tokoScriptsMaintenance: checked,
      };
      await saveMaintenanceState(nextState);
      setMaintenanceState(nextState);

      if (checked) {
        const res = await freezeProductKeys('all');
        toast({
          title: '🔴 Maintenance SEMUANYA Aktif',
          description: `Seluruh produk dikunci untuk publik & ${res.count} key aktif dibekukan sementara agar pembeli tidak rugi.`,
        });
      } else {
        const res = await unfreezeProductKeys('all');
        toast({
          title: '🟢 Maintenance Selesai',
          description: `Semua produk dibuka kembali normal & ${res.count} key aktif dilanjutkan kembali secara utuh.`,
        });
      }
      await loadMaintenanceAndKeys();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleToggleArexansToolsMaintenance = async (checked: boolean) => {
    setMaintenanceLoading(true);
    try {
      const nextState: MaintenanceState = {
        ...maintenanceState,
        arexansToolsMaintenance: checked,
        globalMaintenance: checked && maintenanceState.tokoScriptsMaintenance,
      };
      await saveMaintenanceState(nextState);
      setMaintenanceState(nextState);

      if (checked) {
        const res = await freezeProductKeys('arexans_tools');
        toast({
          title: '🔴 Arexans Tools Maintenance',
          description: `Pembelian Arexans Tools dikunci & ${res.count} key dibekukan sementara.`,
        });
      } else {
        const res = await unfreezeProductKeys('arexans_tools');
        toast({
          title: '🟢 Arexans Tools Normal',
          description: `Pembelian Arexans Tools dibuka kembali & ${res.count} key dilanjutkan.`,
        });
      }
      await loadMaintenanceAndKeys();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleToggleTokoScriptsMaintenance = async (checked: boolean) => {
    setMaintenanceLoading(true);
    try {
      const nextState: MaintenanceState = {
        ...maintenanceState,
        tokoScriptsMaintenance: checked,
        globalMaintenance: checked && maintenanceState.arexansToolsMaintenance,
      };
      await saveMaintenanceState(nextState);
      setMaintenanceState(nextState);

      if (checked) {
        const res = await freezeProductKeys('toko_script');
        toast({
          title: '🔴 Toko Script Maintenance',
          description: `Seluruh Toko Script dikunci untuk publik & ${res.count} key dibekukan.`,
        });
      } else {
        const res = await unfreezeProductKeys('toko_script');
        toast({
          title: '🟢 Toko Script Normal',
          description: `Katalog Toko Script dibuka kembali & ${res.count} key dilanjutkan.`,
        });
      }
      await loadMaintenanceAndKeys();
    } catch (err: any) {
      toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleToggleDevTesting = (checked: boolean) => {
    setDeveloperTestingBypass(checked);
    setDevTestingBypass(checked);
    toast({
      title: checked ? '🛠️ Mode Testing Developer: AKTIF' : 'Mode Testing Developer: NONAKTIF',
      description: checked
        ? 'Anda dapat melakukan testing pembelian & generate key pada halaman utama meskipun produk sedang maintenance bagi publik.'
        : 'Mode testing dinonaktifkan.',
    });
  };

  const handleManualFreezeAll = async () => {
    if (!confirm('Bekukan (Freeze) semua key pelanggan sekarang? Waktu sisa akan disimpan dan tidak berkurang.')) return;
    setMaintenanceLoading(true);
    const res = await freezeProductKeys('all');
    setMaintenanceLoading(false);
    toast({ title: 'Key Dibekukan', description: res.message });
    await loadMaintenanceAndKeys();
  };

  const handleManualUnfreezeAll = async () => {
    if (!confirm('Lanjutkan (Unfreeze / Resume) semua key pelanggan sekarang? Masa aktif akan diperpanjang sesuai sisa waktu.')) return;
    setMaintenanceLoading(true);
    const res = await unfreezeProductKeys('all');
    setMaintenanceLoading(false);
    toast({ title: 'Key Dilanjutkan', description: res.message });
    await loadMaintenanceAndKeys();
  };

  const adjustXcoinsBalance = async (user: {id: string; balance: number; display_name: string | null}, delta: number) => {
    const newBalance = Math.max(0, user.balance + delta);
    const { error } = await supabase.from('xcoins_balances').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('xcoins_transactions').insert({
      user_id: user.id,
      type: delta >= 0 ? 'admin_credit' : 'admin_debit',
      amount: delta,
      balance_after: newBalance,
      description: `Admin ${delta >= 0 ? 'menambah' : 'mengurangi'} saldo (${Math.abs(delta)} XCoins)`,
    });
    toast({ title: 'Berhasil', description: `Saldo ${user.display_name || 'user'} sekarang ${newBalance}` });
    loadAllData();
  };

  const saveXcoinsUser = async () => {
    if (!editingXcoinsUser) return;
    const { error } = await supabase.from('xcoins_balances').update({
      display_name: editingXcoinsUser.display_name,
      phone: editingXcoinsUser.phone,
      balance: editingXcoinsUser.balance,
      is_active: editingXcoinsUser.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', editingXcoinsUser.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Berhasil', description: 'Data pengguna diupdate' });
    setEditingXcoinsUser(null);
    loadAllData();
  };

  const toggleBlockXcoinsUser = async (user: {id: string; phone: string; is_active: boolean}) => {
    const { error } = await supabase.from('xcoins_balances').update({ is_active: !user.is_active, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Berhasil', description: `Pengguna ${user.phone} ${!user.is_active ? 'diaktifkan' : 'diblokir'}` });
    loadAllData();
  };

  const deleteXcoinsUser = async (id: string, phone: string) => {
    if (!confirm(`Yakin hapus pengguna XCoins ${phone}? Aksi ini tidak bisa dibatalkan.`)) return;
    await supabase.from('xcoins_transactions').delete().eq('user_id', id);
    const { error } = await supabase.from('xcoins_balances').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Berhasil', description: `Pengguna ${phone} dihapus` });
    loadAllData();
  };

  const filteredXcoinsUsers = xcoinsUsers.filter(u => {
    if (!xcoinsSearch.trim()) return true;
    const q = xcoinsSearch.toLowerCase();
    return u.phone.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q);
  });

  // IP Geolocation state
  const [geoIp, setGeoIp] = useState<string | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // Transaction editing state
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);

  const keySystemTx = transactions.filter(tx => tx.package_name !== 'XCOINS_TOPUP');
  const xcoinsTx = transactions.filter(tx => tx.package_name === 'XCOINS_TOPUP');
  const filteredTxList = (txTab === 'xcoins' ? xcoinsTx : keySystemTx).filter(tx => {
    if (!txSearch.trim()) return true;
    const q = txSearch.toLowerCase();
    return tx.transaction_id.toLowerCase().includes(q) || 
           tx.customer_name.toLowerCase().includes(q) || 
           (tx.customer_whatsapp || '').toLowerCase().includes(q) || 
           (tx.license_key || '').toLowerCase().includes(q) || 
           tx.package_name.toLowerCase().includes(q) ||
           tx.status.toLowerCase().includes(q);
  });
  const currentTxList = filteredTxList;
  const completedTxCount = currentTxList.filter(tx => ['paid', 'claimed', 'claimable'].includes(tx.status)).length;
  const pendingTxCount = currentTxList.filter(tx => tx.status === 'pending').length;
  const completedTxValue = currentTxList
    .filter(tx => ['paid', 'claimed'].includes(tx.status))
    .reduce((total, tx) => total + tx.total_amount, 0);

  const copyTransactionValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: 'Berhasil disalin', description: `${label} disalin ke clipboard` });
  };

  const toggleSelectTx = (id: string) => {
    setSelectedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTxIds.size === currentTxList.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(currentTxList.map(tx => tx.id)));
    }
  };

  const deleteSelectedTransactions = async () => {
    if (selectedTxIds.size === 0) return;
    if (!confirm(`Yakin hapus ${selectedTxIds.size} transaksi?`)) return;
    const ids = Array.from(selectedTxIds);
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `${ids.length} transaksi dihapus` });
      setSelectedTxIds(new Set());
      loadAllData();
    }
  };

  const saveTransaction = async (tx: TransactionItem) => {
    const { error } = await supabase.from('transactions').update({
      customer_name: tx.customer_name,
      customer_whatsapp: tx.customer_whatsapp,
      package_name: tx.package_name,
      package_duration: tx.package_duration,
      original_amount: tx.original_amount,
      total_amount: tx.total_amount,
      status: tx.status,
      license_key: tx.license_key,
    }).eq('id', tx.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Transaksi berhasil diupdate" });
      setEditingTransaction(null);
      loadAllData();
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!confirm('Yakin hapus transaksi ini?')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Transaksi berhasil dihapus" });
      loadAllData();
    }
  };

  const blockIp = async (ip: string) => {
    if (!confirm(`Yakin blokir IP ${ip}? User dengan IP ini tidak bisa mengakses website lagi.`)) return;
    const reason = prompt('Alasan blokir (opsional):') || 'Diblokir oleh admin';
    const { error } = await supabase.from('blocked_ips').insert({ ip_address: ip, reason });
    if (error) {
      if (error.code === '23505') {
        toast({ title: "Info", description: "IP ini sudah diblokir sebelumnya" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Berhasil", description: `IP ${ip} berhasil diblokir` });
    }
  };

  const setTransactionPaid = async (id: string) => {
    // Get the transaction first to check if it's XCOINS_TOPUP
    const tx = transactions.find(t => t.id === id);
    
    const { error } = await supabase.from('transactions').update({
      status: 'claimable',
      paid_at: new Date().toISOString()
    }).eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    
    // If it's an XCoins topup, auto-credit the user's balance
    if (tx && tx.package_name === 'XCOINS_TOPUP' && tx.license_key) {
      try {
        const userId = tx.license_key; // license_key stores user ID for XCoins topups
        const amount = tx.total_amount;
        
        // Get current balance
        const { data: userData } = await supabase
          .from('xcoins_balances')
          .select('balance, display_name')
          .eq('id', userId)
          .single();
        
        if (userData) {
          const newBalance = userData.balance + amount;
          
          // Update balance
          await supabase.from('xcoins_balances')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', userId);
          
          // Record transaction
          await supabase.from('xcoins_transactions').insert({
            user_id: userId,
            type: 'deposit',
            amount: amount,
            balance_after: newBalance,
            description: `Deposit ${amount} XCoins (manual approve)`,
            reference_id: tx.transaction_id
          });
          
          // Update transaction status to claimed
          await supabase.from('transactions').update({ status: 'claimed' }).eq('id', id);
          
          toast({ title: "Berhasil", description: `Transaksi diset paid & saldo ${userData.display_name || 'user'} ditambah ${amount} XCoins` });
        } else {
          toast({ title: "Berhasil", description: "Transaksi diset paid (user XCoins tidak ditemukan)" });
        }
      } catch (e) {
        console.error('XCoins credit error:', e);
        toast({ title: "Berhasil", description: "Transaksi diset paid (gagal kredit XCoins)" });
      }
    } else {
      toast({ title: "Berhasil", description: "Transaksi berhasil diset paid (claimable)" });
    }
    loadAllData();
  };

  // Effect to load data on mount if already logged in
  useEffect(() => {
    if (isLoggedIn) {
      setAuthenticated(true);
      loadAllData();
    }
  }, [isLoggedIn]);

  // Developer presence heartbeat — Qris 1 (ArexansPay) marked offline only when admin device benar-benar
  // kehilangan koneksi (baterai habis / tanpa wifi/internet). Selama perangkat masih online, ping tetap jalan.
  useEffect(() => {
    if (!authenticated) return;
    const ping = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // jangan ping saat offline
      try {
        await supabase.from('app_settings').upsert(
          { key: 'developer_last_seen', value: String(Date.now()), description: 'Developer device heartbeat (ms epoch)' },
          { onConflict: 'key' }
        );
      } catch (e) { /* ignore */ }
    };
    ping();
    const iv = setInterval(ping, 20000);
    const onOnline = () => ping();
    window.addEventListener('online', onOnline);
    return () => { clearInterval(iv); window.removeEventListener('online', onOnline); };
  }, [authenticated]);


  // Record who opens / tries to enter the developer page
  const logAccess = async (event: 'visit' | 'login_success' | 'login_failed') => {
    try {
      await supabase.functions.invoke('dev-access-log', {
        body: {
          action: 'log',
          event,
          deviceId,
          deviceName,
          deviceInfo,
          isApprovedDevice: deviceStatus === 'approved',
        },
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (deviceStatus === 'loading') return;
    logAccess('visit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_key')
      .maybeSingle();
    
    if (data && data.value === password) {
      setAuthenticated(true);
      try { sessionStorage.setItem('admin_pwd_cache', password); } catch {}
      persistLogin();
      loadAllData();
      logAccess('login_success');
    } else {
      toast({ title: "Error", description: "Password salah!", variant: "destructive" });
      logAccess('login_failed');
    }
    setLoading(false);
  };
  
  const handleLogout = () => {
    setAuthenticated(false);
    clearLogin();
  };

  const loadAllData = async () => {
    const [settingsRes, packagesRes, adsRes, backgroundsRes, transactionsRes, socialLinksRes, blockedIpsRes, xcoinsUsersRes] = await Promise.all([
      supabase.from('app_settings').select('*').order('key'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('ads').select('*').order('sort_order'),
      supabase.from('backgrounds').select('*').order('sort_order'),
      supabase.from('transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('social_links').select('*').order('sort_order'),
      supabase.from('blocked_ips').select('*').order('created_at', { ascending: false }),
      supabase.from('xcoins_balances').select('*').order('created_at', { ascending: false })
    ]);
    
    if (settingsRes.data) setSettings(settingsRes.data);
    if (packagesRes.data) setPackages(packagesRes.data);
    if (adsRes.data) setAds(adsRes.data);
    if (backgroundsRes.data) setBackgrounds(backgroundsRes.data);
    if (transactionsRes.data) setTransactions(transactionsRes.data);
    if (socialLinksRes.data) setSocialLinks(socialLinksRes.data);
    if (blockedIpsRes.data) setBlockedIps(blockedIpsRes.data);
    if (xcoinsUsersRes.data) setXcoinsUsers(xcoinsUsersRes.data);
    await loadMaintenanceAndKeys();
  };

  const addBlockedIp = async () => {
    if (!newBlockIp.trim()) return;
    const { error } = await supabase.from('blocked_ips').insert({ ip_address: newBlockIp.trim(), reason: newBlockReason.trim() || 'Diblokir oleh admin' });
    if (error) {
      if (error.code === '23505') {
        toast({ title: "Info", description: "IP ini sudah diblokir sebelumnya" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Berhasil", description: `IP ${newBlockIp} berhasil diblokir` });
      setNewBlockIp('');
      setNewBlockReason('');
      loadAllData();
    }
  };

  const unblockIp = async (id: string, ip: string) => {
    if (!confirm(`Yakin unblock IP ${ip}?`)) return;
    const { error } = await supabase.from('blocked_ips').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `IP ${ip} berhasil di-unblock` });
      loadAllData();
    }
  };

  const lookupIpGeolocation = async (ip: string) => {
    setGeoIp(ip);
    setGeoData(null);
    setGeoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ip-geolocation', { body: { ip } });
      if (error) throw error;
      setGeoData(data);
    } catch {
      toast({ title: "Error", description: "Gagal mendapatkan lokasi IP", variant: "destructive" });
    } finally {
      setGeoLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `Setting ${key} berhasil diupdate` });
      setSettings(prev => {
        const exists = prev.some(s => s.key === key);
        if (exists) {
          return prev.map(s => s.key === key ? { ...s, value } : s);
        }
        return [...prev, { id: key, key, value, description: null }];
      });
    }
  };

  const savePackage = async (pkg: PackageItem) => {
    const { error } = await supabase
      .from('packages')
      .upsert(pkg);
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Package berhasil disimpan" });
      loadAllData();
      setEditingPackage(null);
    }
  };

  const deletePackage = async (id: string) => {
    const { error } = await supabase.from('packages').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Package berhasil dihapus" });
      loadAllData();
    }
  };

  const saveAd = async (ad: AdItem) => {
    const { error } = await supabase.from('ads').upsert(ad);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Ad berhasil disimpan" });
      loadAllData();
      setEditingAd(null);
    }
  };

  const deleteAd = async (id: string) => {
    const { error } = await supabase.from('ads').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Ad berhasil dihapus" });
      loadAllData();
    }
  };

  const saveBackground = async (bg: BackgroundItem) => {
    const { error } = await supabase.from('backgrounds').upsert(bg);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Background berhasil disimpan" });
      loadAllData();
      setEditingBackground(null);
    }
  };

  const deleteBackground = async (id: string) => {
    const { error } = await supabase.from('backgrounds').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Background berhasil dihapus" });
      loadAllData();
    }
  };

  const saveSocialLink = async (link: SocialLink) => {
    const { error } = await supabase.from('social_links').upsert(link);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Social link berhasil disimpan" });
      loadAllData();
      setEditingSocialLink(null);
    }
  };

  const deleteSocialLink = async (id: string) => {
    const { error } = await supabase.from('social_links').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Social link berhasil dihapus" });
      loadAllData();
    }
  };

  const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const paymentKeys = [
    'maintenance_mode', 'product_maintenance_state',
    'toko_scripts_catalog', 'reseller_accounts_data_v2', 'reseller_sales_data_v2', 'reseller_withdrawals_data_v2', 'reseller_global_settings_v2',
    'payment_gateway', 'pakasir_slug', 'pakasir_api_key', 'pakasir_mode', 'pakasir_webhook_key',
    'arexanspay_api_key', 'arexanspay_qris_id', 'arexanspay_webhook_key', 'arexanspay_number_id',
    'casaku_license_key', 'casaku_qris_id', 'casaku_webhook_secret', 'casaku_webhook_key',
    'casaku_package_ids', 'casaku_prefix', 'casaku_expired_minutes', 'casaku_require_device',
    'cashify_license_key', 'cashify_qris_id', 'cashify_webhook_key',
    'payment_simulation', 'discord_webhook_url', 'fonnte_token', 'xcoins_enabled', 'xcoins_only', 'xcoins_logo_url'
  ];

  // Show device approval screen if device is not approved
  if (deviceStatus === 'loading' || deviceStatus === 'new' || deviceStatus === 'pending') {
    return (
      <DeviceApprovalScreen
        deviceId={deviceId}
        deviceName={deviceName}
        onRegister={registerDevice}
        status={isChecking ? 'loading' : deviceStatus}
      />
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <GlobalBackground />
        <Card className="w-full max-w-md z-10 glass-card">
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl text-primary">Developer Login</CardTitle>
            <CardDescription>Masukkan password admin untuk melanjutkan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password admin"
                  className="bg-background/50"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Loading...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <GlobalBackground />
      
      <div className="relative z-10 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-primary">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Kelola toko AREXANS TOOLS</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                Ke Toko
              </Button>
              <Button variant="destructive" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>

          <Tabs defaultValue="settings" className="space-y-6">
            <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex w-max min-w-full md:w-auto bg-muted/50 gap-1">
                <TabsTrigger value="toko-script" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap bg-primary/15 text-primary border border-primary/30 font-semibold">
                  <ShoppingBag className="w-4 h-4" />
                  <span>Toko Script & Reseller</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Settings className="w-4 h-4" />
                  <span className="hidden xs:inline">Settings</span>
                </TabsTrigger>
                <TabsTrigger value="packages" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Package className="w-4 h-4" />
                  <span className="hidden xs:inline">Packages</span>
                </TabsTrigger>
                <TabsTrigger value="transactions" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <CreditCard className="w-4 h-4" />
                  <span className="hidden xs:inline">Trans</span>
                </TabsTrigger>
                <TabsTrigger value="keys" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Key className="w-4 h-4" />
                  <span className="hidden xs:inline">Keys</span>
                </TabsTrigger>
                <TabsTrigger value="docs" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <FileText className="w-4 h-4" />
                  <span className="hidden xs:inline">API</span>
                </TabsTrigger>
                <TabsTrigger value="scripts" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <FileCode className="w-4 h-4" />
                  <span className="hidden xs:inline">Scripts</span>
                </TabsTrigger>
                <TabsTrigger value="whitelist" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Shield className="w-4 h-4" />
                  <span className="hidden xs:inline">Whitelist</span>
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Upload className="w-4 h-4" />
                  <span className="hidden xs:inline">Upload</span>
                </TabsTrigger>
                <TabsTrigger value="recordings" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Film className="w-4 h-4 text-primary" />
                  <span className="hidden xs:inline">Rekaman</span>
                </TabsTrigger>
                <TabsTrigger value="ads" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Image className="w-4 h-4" />
                  <span className="hidden xs:inline">Ads</span>
                </TabsTrigger>
                <TabsTrigger value="backgrounds" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Image className="w-4 h-4" />
                  <span className="hidden xs:inline">BG</span>
                </TabsTrigger>
                <TabsTrigger value="social" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden xs:inline">Social</span>
                </TabsTrigger>
                <TabsTrigger value="devices" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Shield className="w-4 h-4" />
                  <span className="hidden xs:inline">Devices</span>
                </TabsTrigger>
                <TabsTrigger value="backup" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Database className="w-4 h-4" />
                  <span className="hidden xs:inline">Backup</span>
                </TabsTrigger>
                <TabsTrigger value="storage" className="gap-1.5 px-3 py-2 text-xs md:text-sm whitespace-nowrap">
                  <Database className="w-4 h-4" />
                  <span className="hidden xs:inline">Storage</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Toko Script & Reseller Tab */}
            <TabsContent value="toko-script" className="space-y-6">
              <TokoScriptAdmin />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              {/* PUSAT KONTROL MAINTENANCE PRODUK & PEMBEKUAN KEY (ANTI-RUGI) */}
              <Card className="glass-card border-destructive/40 bg-destructive/5 shadow-2xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-destructive/15 via-amber-500/10 to-transparent p-5 border-b border-border/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg md:text-xl font-bold flex items-center gap-2 text-foreground">
                        <Wrench className="w-5 h-5 text-destructive" />
                        Pusat Kontrol Maintenance & Pembekuan Key (Anti-Rugi)
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                        Kunci pembelian produk untuk publik saat sedang dalam perbaikan. Seluruh masa aktif key pelanggan otomatis <strong>DIBEKUKAN SEMENTARA</strong> dan waktu aktifnya dilanjutkan kembali setelah perbaikan selesai agar pembeli tidak dirugikan.
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadMaintenanceAndKeys}
                        disabled={maintenanceLoading}
                        className="text-xs h-8 rounded-xl"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${maintenanceLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-6">
                  {/* Status Ringkasan Key & Testing Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        Total License Key
                      </span>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {keyStats.total} Key
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-1">
                      <span className="text-xs text-blue-300 flex items-center gap-1.5">
                        <Pause className="w-3.5 h-3.5 text-blue-400" />
                        Key Sedang Dibekukan (Frozen)
                      </span>
                      <div className="text-lg font-bold font-mono text-blue-400">
                        {keyStats.frozen} Key (Waktu Aman Di-pause)
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                      <span className="text-xs text-emerald-300 flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                        Key Aktif Berjalan
                      </span>
                      <div className="text-lg font-bold font-mono text-emerald-400">
                        {keyStats.active} Key
                      </div>
                    </div>
                  </div>

                  {/* 2 Focused, Non-Duplicate Switch Controls */}
                  <div className="space-y-4 pt-1">
                    {/* Master Switch: Global Maintenance */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      maintenanceState.globalMaintenance
                        ? 'border-destructive/60 bg-destructive/15 shadow-lg shadow-destructive/10'
                        : 'border-border/80 bg-card/60'
                    } flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <Label className="text-base font-bold text-foreground flex items-center gap-2">
                            <Wrench className={`w-4 h-4 ${maintenanceState.globalMaintenance ? 'text-destructive animate-pulse' : 'text-primary'}`} />
                            Mode Maintenance Sistem (Anti-Rugi)
                          </Label>
                          {maintenanceState.globalMaintenance ? (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-bold animate-pulse">
                              🔴 MAINTENANCE AKTIF
                            </span>
                          ) : (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                              🟢 SISTEM NORMAL
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {maintenanceState.globalMaintenance
                            ? 'Seluruh transaksi publik sedang DITUTUP sementara. Durasi seluruh key pelanggan otomatis DIBEKUKAN (di-pause) agar pembeli tidak ada yang rugi.'
                            : 'Kunci seluruh pembelian publik di Arexans Tools & Toko Script. Ketika diaktifkan, seluruh key pelanggan otomatis dibekukan dan dilanjutkan kembali saat dimatikan.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <Switch
                          checked={maintenanceState.globalMaintenance}
                          onCheckedChange={handleToggleGlobalMaintenance}
                          disabled={maintenanceLoading}
                          className="scale-110"
                        />
                      </div>
                    </div>

                    {/* Mode Testing Developer */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                      devTestingBypass
                        ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                        : 'border-border/80 bg-card/60'
                    } flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Shield className={`w-4 h-4 ${devTestingBypass ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                            Mode Testing Developer (Bypass Pembelian)
                          </Label>
                          {devTestingBypass ? (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">
                              TESTING AKTIF
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                              NONAKTIF
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Ketika aktif, Anda sebagai developer tetap dapat mengakses halaman utama, memilih paket, dan testing order/checkout meskipun sistem sedang dalam mode maintenance publik.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <Switch
                          checked={devTestingBypass}
                          onCheckedChange={handleToggleDevTesting}
                        />
                      </div>
                    </div>

                    {/* Kontrol Kunci Parsial (Arexans Tools / Toko Script) */}
                    <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20">
                      <span className="text-xs font-semibold text-muted-foreground block mb-2.5">
                        Kunci Maintenance Parsial (Opsional per-layanan):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/70">
                          <div className="space-y-0.5 pr-2">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              Arexans Tools
                              {maintenanceState.arexansToolsMaintenance && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold">Kunci</span>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">Paket Normal, VIP, Lifetime</span>
                          </div>
                          <Switch
                            checked={maintenanceState.arexansToolsMaintenance}
                            onCheckedChange={handleToggleArexansToolsMaintenance}
                            disabled={maintenanceLoading || maintenanceState.globalMaintenance}
                          />
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/70">
                          <div className="space-y-0.5 pr-2">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              Toko Script
                              {maintenanceState.tokoScriptsMaintenance && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold">Kunci</span>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">Semua katalog script publik</span>
                          </div>
                          <Switch
                            checked={maintenanceState.tokoScriptsMaintenance}
                            onCheckedChange={handleToggleTokoScriptsMaintenance}
                            disabled={maintenanceLoading || maintenanceState.globalMaintenance}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <PaymentGatewaySettings onSettingsUpdated={loadAllData} />

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    General Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settings.filter(s => !paymentKeys.includes(s.key)).map(setting => (
                    <div key={setting.id} className="space-y-2">
                      <Label htmlFor={setting.key} className="capitalize">
                        {setting.key.replace(/_/g, ' ')}
                      </Label>
                      {setting.description && (
                        <p className="text-xs text-muted-foreground">{setting.description}</p>
                      )}
                      {setting.key === 'maintenance_mode' ? (
                        <div className="flex items-center gap-4">
                          <Switch
                            checked={setting.value === 'true'}
                            onCheckedChange={(checked) => updateSetting(setting.key, checked ? 'true' : 'false')}
                          />
                          <span className={`text-sm font-medium ${setting.value === 'true' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {setting.value === 'true' ? '🔴 Maintenance AKTIF - Website tidak bisa diakses' : '🟢 Website Normal'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            id={setting.key}
                            type={setting.key.includes('key') || setting.key.includes('password') ? 'password' : 'text'}
                            value={setting.value}
                            onChange={(e) => setSettings(prev => 
                              prev.map(s => s.key === setting.key ? { ...s, value: e.target.value } : s)
                            )}
                            className="bg-background/50"
                          />
                          <Button onClick={() => updateSetting(setting.key, setting.value)}>
                            <Save className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Packages Tab */}
            <TabsContent value="packages" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-display font-semibold">Manage Packages</h2>
                <Button onClick={() => setEditingPackage({
                  id: crypto.randomUUID(),
                  name: '',
                  display_name: '',
                  price_per_day: 2000,
                  description: '',
                  features: [],
                  is_active: true,
                  sort_order: packages.length
                })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Package
                </Button>
              </div>

              {editingPackage && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{editingPackage.name ? 'Edit' : 'New'} Package</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Name (ID)</Label>
                        <select
                          value={editingPackage.name}
                          onChange={e => setEditingPackage({ ...editingPackage, name: e.target.value })}
                          className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                        >
                          <option value="">-- Pilih Paket --</option>
                          <option value="NORMAL">NORMAL</option>
                          <option value="VIP">VIP</option>
                          <option value="LIFETIME">LIFETIME</option>
                        </select>
                      </div>
                      <div>
                        <Label>Display Name</Label>
                        <Input
                          value={editingPackage.display_name}
                          onChange={e => setEditingPackage({ ...editingPackage, display_name: e.target.value })}
                          placeholder="Normal Script"
                          className="bg-background/50"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Price per Day (IDR)</Label>
                        <Input
                          type="number"
                          value={editingPackage.price_per_day}
                          onChange={e => setEditingPackage({ ...editingPackage, price_per_day: parseInt(e.target.value) })}
                          className="bg-background/50"
                        />
                      </div>
                      <div>
                        <Label>Sort Order</Label>
                        <Input
                          type="number"
                          value={editingPackage.sort_order}
                          onChange={e => setEditingPackage({ ...editingPackage, sort_order: parseInt(e.target.value) })}
                          className="bg-background/50"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={editingPackage.description || ''}
                        onChange={e => setEditingPackage({ ...editingPackage, description: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                    <div>
                      <Label>Features (one per line)</Label>
                      <Textarea
                        value={(editingPackage.features || []).join('\n')}
                        onChange={e => setEditingPackage({ ...editingPackage, features: e.target.value.split('\n').filter(f => f.trim()) })}
                        className="bg-background/50"
                        rows={4}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editingPackage.is_active}
                        onCheckedChange={checked => setEditingPackage({ ...editingPackage, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => savePackage(editingPackage)}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingPackage(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4">
                {packages.map(pkg => (
                  <Card key={pkg.id} className="glass-card">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={pkg.is_active}
                          onCheckedChange={async (checked) => {
                            await savePackage({ ...pkg, is_active: checked });
                          }}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${pkg.name === 'LIFETIME' ? 'text-cyan-400' : pkg.name === 'VIP' ? 'text-secondary' : 'text-green-400'}`}>{pkg.display_name}</span>
                            <span className="text-xs text-muted-foreground">({pkg.name})</span>
                            {!pkg.is_active && <span className="text-xs text-destructive">[Hidden]</span>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {pkg.name === 'LIFETIME' ? formatRupiah(pkg.price_per_day) + ' (sekali bayar)' : formatRupiah(pkg.price_per_day) + '/hari'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingPackage(pkg)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deletePackage(pkg.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Discount & Promo Section (merged into Packages) */}
              <div className="border-t border-border pt-6 mt-6">
                <DiscountManagement />
              </div>
            </TabsContent>

            {/* Keys Tab */}
            <TabsContent value="keys" className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={keysSubTab === 'keysystem' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setKeysSubTab('keysystem')}
                  className="gap-1.5"
                >
                  <Key className="w-4 h-4" />
                  Key System
                </Button>
                <Button
                  variant={keysSubTab === 'xcoins' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setKeysSubTab('xcoins')}
                  className="gap-1.5"
                >
                  <Coins className="w-4 h-4" />
                  XCoins ({xcoinsUsers.length})
                </Button>
              </div>

              {keysSubTab === 'keysystem' && <KeyManagement />}

              {keysSubTab === 'xcoins' && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary" />
                      Manajemen Pengguna XCoins
                      <span className="text-sm font-normal text-muted-foreground">({filteredXcoinsUsers.length}/{xcoinsUsers.length})</span>
                    </CardTitle>
                    <CardDescription>Tambah/kurangi/edit saldo, blokir & hapus pengguna XCoins</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      placeholder="Cari nomor / nama..."
                      value={xcoinsSearch}
                      onChange={(e) => setXcoinsSearch(e.target.value)}
                    />

                    {filteredXcoinsUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Belum ada pengguna XCoins</p>
                    ) : (
                      <div className="space-y-2">
                        {filteredXcoinsUsers.map(user => {
                          const userTx = transactions.find(tx => tx.customer_whatsapp === user.phone || tx.customer_whatsapp === user.phone.replace(/^62/, '0'));
                          const lastIp = userTx?.ip_address;
                          return (
                            <div key={user.id} className="p-3 rounded-lg border border-border bg-muted/10 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium flex items-center gap-2 flex-wrap">
                                    {user.display_name || '-'}
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${user.is_active ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                                      {user.is_active ? 'Aktif' : 'Diblokir'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono">{user.phone}</div>
                                  {lastIp && (
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      IP: <span className="font-mono">{lastIp}</span>
                                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => lookupIpGeolocation(lastIp)}>
                                        <MapPin className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground">Saldo</div>
                                  <div className="font-mono font-bold text-primary">{new Intl.NumberFormat('id-ID').format(user.balance)}</div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => adjustXcoinsBalance(user, 1000)}>+1k</Button>
                                <Button size="sm" variant="outline" onClick={() => adjustXcoinsBalance(user, 5000)}>+5k</Button>
                                <Button size="sm" variant="outline" onClick={() => adjustXcoinsBalance(user, 10000)}>+10k</Button>
                                <Button size="sm" variant="outline" onClick={() => {
                                  const v = prompt('Jumlah penambahan (XCoins):', '0');
                                  const n = Number(v);
                                  if (Number.isFinite(n) && n > 0) adjustXcoinsBalance(user, n);
                                }}>+ Custom</Button>
                                <Button size="sm" variant="outline" onClick={() => {
                                  const v = prompt('Jumlah pengurangan (XCoins):', '0');
                                  const n = Number(v);
                                  if (Number.isFinite(n) && n > 0) adjustXcoinsBalance(user, -n);
                                }}>- Kurang</Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingXcoinsUser({ id: user.id, phone: user.phone, display_name: user.display_name, balance: user.balance, is_active: user.is_active })}>
                                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button size="sm" variant={user.is_active ? 'destructive' : 'default'} onClick={() => toggleBlockXcoinsUser(user)}>
                                  {user.is_active ? <><ShieldX className="w-3 h-3 mr-1" />Blokir</> : <><Shield className="w-3 h-3 mr-1" />Unblok</>}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteXcoinsUser(user.id, user.phone)}>
                                  <Trash2 className="w-3 h-3 mr-1" /> Hapus
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Edit XCoins user modal */}
              {editingXcoinsUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingXcoinsUser(null)}>
                  <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="p-6 space-y-4">
                      <h3 className="text-lg font-display font-bold">Edit Pengguna XCoins</h3>
                      <div className="space-y-2">
                        <Label>Nama Tampilan</Label>
                        <Input value={editingXcoinsUser.display_name || ''} onChange={(e) => setEditingXcoinsUser({ ...editingXcoinsUser, display_name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>No. WhatsApp</Label>
                        <Input value={editingXcoinsUser.phone} onChange={(e) => setEditingXcoinsUser({ ...editingXcoinsUser, phone: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Saldo (XCoins)</Label>
                        <Input type="number" value={editingXcoinsUser.balance} onChange={(e) => setEditingXcoinsUser({ ...editingXcoinsUser, balance: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="flex items-center justify-between p-2 border border-border rounded-lg">
                        <Label>Aktif</Label>
                        <Switch checked={editingXcoinsUser.is_active} onCheckedChange={(c) => setEditingXcoinsUser({ ...editingXcoinsUser, is_active: c })} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setEditingXcoinsUser(null)}>Batal</Button>
                        <Button onClick={saveXcoinsUser}><Save className="w-4 h-4 mr-1" />Simpan</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* API Documentation Tab */}
            <TabsContent value="docs" className="space-y-4">
              <ApiDocumentation />
            </TabsContent>

            {/* Scripts Tab */}
            <TabsContent value="scripts" className="space-y-4">
              <ScriptManagement />
            </TabsContent>

            {/* Whitelist Tab */}
            <TabsContent value="whitelist" className="space-y-4">
              <WhitelistManagement />
            </TabsContent>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-4">
              <LuaUploadManager />
            </TabsContent>

            {/* Recordings Tab */}
            <TabsContent value="recordings" className="space-y-4">
              <MainLuaRecordings />
            </TabsContent>

            {/* Ads Tab */}
            <TabsContent value="ads" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-display font-semibold">Manage Ads</h2>
                <Button onClick={() => setEditingAd({
                  id: crypto.randomUUID(),
                  title: '',
                  media_url: '',
                  media_type: 'image',
                  link_url: '',
                  is_active: true,
                  sort_order: ads.length
                })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Ad
                </Button>
              </div>

              {editingAd && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{editingAd.title ? 'Edit' : 'New'} Ad</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={editingAd.title}
                        onChange={e => setEditingAd({ ...editingAd, title: e.target.value })}
                        className="bg-background/50"
                        placeholder="Contoh: Banner Promo / Event Spesial"
                      />
                    </div>
                    
                    <MediaUploadField
                      label="Media Iklan (Gambar / Video)"
                      mediaUrl={editingAd.media_url}
                      mediaType={editingAd.media_type}
                      onMediaChange={(url, type) => {
                        setEditingAd(prev => prev ? { ...prev, media_url: url, media_type: type } : null);
                      }}
                      titleSuggestion={(title) => {
                        if (!editingAd.title) {
                          setEditingAd(prev => prev ? { ...prev, title } : null);
                        }
                      }}
                    />

                    <div>
                      <Label>Sort Order</Label>
                      <Input
                        type="number"
                        value={editingAd.sort_order}
                        onChange={e => setEditingAd({ ...editingAd, sort_order: parseInt(e.target.value) || 0 })}
                        className="bg-background/50"
                      />
                    </div>
                    <div>
                      <Label>Link URL (optional)</Label>
                      <Input
                        value={editingAd.link_url || ''}
                        onChange={e => setEditingAd({ ...editingAd, link_url: e.target.value })}
                        placeholder="https://..."
                        className="bg-background/50"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editingAd.is_active}
                        onCheckedChange={checked => setEditingAd({ ...editingAd, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveAd(editingAd)}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingAd(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {ads.map(ad => (
                  <Card key={ad.id} className="glass-card overflow-hidden">
                    <div className="aspect-video bg-muted">
                      {ad.media_type === 'video' ? (
                        <video src={ad.media_url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={ad.media_url} alt={ad.title} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{ad.title}</span>
                        {!ad.is_active && <span className="text-xs text-destructive ml-2">[Inactive]</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingAd(ad)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteAd(ad.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Backgrounds Tab */}
            <TabsContent value="backgrounds" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-display font-semibold">Manage Backgrounds</h2>
                <Button onClick={() => setEditingBackground({
                  id: crypto.randomUUID(),
                  title: '',
                  background_url: '',
                  background_type: 'image',
                  is_muted: true,
                  is_active: true,
                  sort_order: backgrounds.length
                })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Background
                </Button>
              </div>

              {editingBackground && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{editingBackground.title ? 'Edit' : 'New'} Background</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={editingBackground.title}
                        onChange={e => setEditingBackground({ ...editingBackground, title: e.target.value })}
                        className="bg-background/50"
                        placeholder="Contoh: Dark Cyber Neon / Anime City"
                      />
                    </div>

                    <MediaUploadField
                      label="Media Background (Gambar / Video)"
                      mediaUrl={editingBackground.background_url}
                      mediaType={editingBackground.background_type}
                      onMediaChange={(url, type) => {
                        setEditingBackground(prev => prev ? { ...prev, background_url: url, background_type: type } : null);
                      }}
                      titleSuggestion={(title) => {
                        if (!editingBackground.title) {
                          setEditingBackground(prev => prev ? { ...prev, title } : null);
                        }
                      }}
                    />

                    <div>
                      <Label>Sort Order</Label>
                      <Input
                        type="number"
                        value={editingBackground.sort_order}
                        onChange={e => setEditingBackground({ ...editingBackground, sort_order: parseInt(e.target.value) || 0 })}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={editingBackground.is_muted}
                          onCheckedChange={checked => setEditingBackground({ ...editingBackground, is_muted: checked })}
                        />
                        <Label>Muted (for video)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={editingBackground.is_active}
                          onCheckedChange={checked => setEditingBackground({ ...editingBackground, is_active: checked })}
                        />
                        <Label>Active</Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveBackground(editingBackground)}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingBackground(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {backgrounds.map(bg => (
                  <Card key={bg.id} className="glass-card overflow-hidden">
                    <div className="aspect-video bg-muted">
                      {bg.background_type === 'video' ? (
                        <video src={bg.background_url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={bg.background_url} alt={bg.title} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{bg.title}</span>
                        {!bg.is_active && <span className="text-xs text-destructive ml-2">[Inactive]</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingBackground(bg)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteBackground(bg.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions" className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-primary">Manajemen pembayaran</p>
                  <h2 className="mt-1 text-2xl font-display font-semibold">Transactions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Pantau, cari, dan kelola seluruh transaksi pelanggan.</p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  {selectedTxIds.size > 0 && (
                    <Button variant="destructive" size="sm" className="flex-1 sm:flex-none" onClick={deleteSelectedTransactions}>
                      <Trash2 className="w-4 h-4" />
                      Hapus {selectedTxIds.size}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => { loadAllData(); setSelectedTxIds(new Set()); }}>
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className="glass-card overflow-hidden"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><ReceiptText /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Ditampilkan</p><p className="text-xl font-semibold">{currentTxList.length}</p></div></CardContent></Card>
                <Card className="glass-card overflow-hidden"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/15 text-success"><CheckCircle /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Berhasil</p><p className="text-xl font-semibold">{completedTxCount}</p></div></CardContent></Card>
                <Card className="glass-card overflow-hidden"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning"><Clock3 /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Menunggu</p><p className="text-xl font-semibold">{pendingTxCount}</p></div></CardContent></Card>
                <Card className="glass-card col-span-2 overflow-hidden lg:col-span-1"><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent"><CircleDollarSign /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Nilai berhasil</p><p className="truncate text-lg font-semibold">{formatRupiah(completedTxValue)}</p></div></CardContent></Card>
              </div>

              <Card className="glass-card overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Trash2 className="w-4 h-4" /></span>
                    <div><p className="text-sm font-medium">Auto-cleanup transaksi</p><p className="text-xs text-muted-foreground">Hapus otomatis data transaksi lama.</p></div>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/40 p-2">
                      <Switch
                        aria-label="Aktifkan auto-cleanup transaksi"
                        checked={settings.find(s => s.key === 'auto_delete_transactions_enabled')?.value === 'on'}
                        onCheckedChange={checked => {
                          const key = 'auto_delete_transactions_enabled';
                          const val = checked ? 'on' : 'off';
                          const exists = settings.find(s => s.key === key);
                          if (exists) { updateSetting(key, val); }
                          else { supabase.from('app_settings').insert({ key, value: val, description: 'Auto delete old transactions' }).then(() => loadAllData()); }
                        }}
                      />
                      <Input
                        type="number"
                        aria-label="Umur transaksi dalam hari"
                        className="h-8 w-20 bg-background/50 text-center"
                        value={settings.find(s => s.key === 'auto_delete_transactions_days')?.value || '30'}
                        onChange={e => {
                          const key = 'auto_delete_transactions_days';
                          const val = e.target.value;
                          const exists = settings.find(s => s.key === key);
                          if (exists) { updateSetting(key, val); }
                          else { supabase.from('app_settings').insert({ key, value: val, description: 'Days before auto-deleting transactions' }).then(() => loadAllData()); }
                        }}
                      />
                      <span className="pr-1 text-xs text-muted-foreground">hari</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/40 p-3 lg:flex-row lg:items-center">
                <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/60 p-1 lg:w-auto">
                  <Button variant={txTab === 'keysystem' ? 'default' : 'ghost'} size="sm" onClick={() => { setTxTab('keysystem'); setSelectedTxIds(new Set()); }}>
                    KeySystem ({keySystemTx.length})
                  </Button>
                  <Button variant={txTab === 'xcoins' ? 'default' : 'ghost'} size="sm" onClick={() => { setTxTab('xcoins'); setSelectedTxIds(new Set()); }}>
                    XCoins ({xcoinsTx.length})
                  </Button>
                </div>
                <div className="relative flex-1 lg:ml-auto lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Cari ID, pelanggan, key, atau status..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="bg-background/50 pl-9 pr-9" />
                  {txSearch && <Button variant="ghost" size="icon" aria-label="Hapus pencarian" className="absolute right-0 top-0 h-10 w-9" onClick={() => setTxSearch('')}><X className="h-4 w-4" /></Button>}
                </div>
              </div>

              {editingTransaction && (
                <Card className="glass-card overflow-hidden border-primary/30">
                  <CardHeader className="border-b border-border/60 pb-4">
                    <div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">Edit transaksi</CardTitle><CardDescription className="mt-1 break-all font-mono">{editingTransaction.transaction_id}</CardDescription></div><Button variant="ghost" size="icon" aria-label="Tutup form edit" onClick={() => setEditingTransaction(null)}><X /></Button></div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Customer Name</Label>
                        <Input value={editingTransaction.customer_name} onChange={e => setEditingTransaction({...editingTransaction, customer_name: e.target.value})} className="bg-background/50" />
                      </div>
                      <div>
                        <Label>WhatsApp</Label>
                        <Input value={editingTransaction.customer_whatsapp || ''} onChange={e => setEditingTransaction({...editingTransaction, customer_whatsapp: e.target.value || null})} className="bg-background/50" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label>Package</Label>
                        <Input value={editingTransaction.package_name} onChange={e => setEditingTransaction({...editingTransaction, package_name: e.target.value})} className="bg-background/50" />
                      </div>
                      <div>
                        <Label>Duration (hari)</Label>
                        <Input type="number" value={editingTransaction.package_duration} onChange={e => setEditingTransaction({...editingTransaction, package_duration: parseInt(e.target.value) || 0})} className="bg-background/50" />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <select value={editingTransaction.status} onChange={e => setEditingTransaction({...editingTransaction, status: e.target.value})} className="w-full p-2 rounded-md bg-background/50 border border-border">
                          <option value="pending">pending</option>
                          <option value="paid">paid</option>
                          <option value="claimed">claimed</option>
                          <option value="expired">expired</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Original Amount</Label>
                        <Input type="number" value={editingTransaction.original_amount} onChange={e => setEditingTransaction({...editingTransaction, original_amount: parseInt(e.target.value) || 0})} className="bg-background/50" />
                      </div>
                      <div>
                        <Label>Total Amount</Label>
                        <Input type="number" value={editingTransaction.total_amount} onChange={e => setEditingTransaction({...editingTransaction, total_amount: parseInt(e.target.value) || 0})} className="bg-background/50" />
                      </div>
                    </div>
                    <div>
                      <Label>License Key</Label>
                      <Input value={editingTransaction.license_key || ''} onChange={e => setEditingTransaction({...editingTransaction, license_key: e.target.value || null})} className="bg-background/50" />
                    </div>
                    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setEditingTransaction(null)}>Batal</Button>
                      <Button onClick={() => saveTransaction(editingTransaction)}><Save className="w-4 h-4" />Simpan perubahan</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="hidden max-h-[680px] overflow-auto rounded-lg border border-border/70 bg-card/35 md:block">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="p-3 w-10"><Checkbox aria-label="Pilih semua transaksi" checked={selectedTxIds.size === currentTxList.length && currentTxList.length > 0} onCheckedChange={toggleSelectAll} /></th>
                      <th className="text-left p-3">ID</th>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-left p-3">{txTab === 'xcoins' ? 'Amount' : 'Package'}</th>
                      <th className="text-left p-3">Total</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">IP Address</th>
                      <th className="text-left p-3">Date</th>
                      <th className="text-right p-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTxList.map(tx => (
                      <tr key={tx.id} className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${selectedTxIds.has(tx.id) ? 'bg-primary/10' : ''}`}>
                        <td className="p-3"><Checkbox aria-label={`Pilih transaksi ${tx.transaction_id}`} checked={selectedTxIds.has(tx.id)} onCheckedChange={() => toggleSelectTx(tx.id)} /></td>
                        <td className="p-3">
                          <Button variant="ghost" size="sm" onClick={() => copyTransactionValue(tx.transaction_id, 'Transaction ID')} className="h-7 max-w-36 justify-start px-2 font-mono text-xs" title={tx.transaction_id}><span className="truncate">{tx.transaction_id}</span><Copy className="h-3 w-3" /></Button>
                        </td>
                        <td className="p-3">
                          <div>{tx.customer_name}</div>
                          {tx.customer_whatsapp && (
                            <Button variant="link" size="sm" onClick={() => copyTransactionValue(tx.customer_whatsapp || '', 'Nomor WhatsApp')} className="h-auto p-0 text-xs text-muted-foreground">{tx.customer_whatsapp}</Button>
                          )}
                        </td>
                        <td className="p-3">
                          {txTab === 'xcoins' ? (
                            <div>{formatRupiah(tx.original_amount)}</div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1">
                                <span>{tx.package_name}</span>
                                {tx.license_key && (
                                  <Button variant="ghost" size="icon" onClick={() => copyTransactionValue(tx.license_key || '', 'License key')} title="Salin license key" className="h-6 w-6 text-primary"><Copy className="w-3 h-3" /></Button>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{tx.package_duration} hari</div>
                            </>
                          )}
                        </td>
                        <td className="p-3">{formatRupiah(tx.total_amount)}</td>
                        <td className="p-3">
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${transactionStatusStyle[tx.status] || transactionStatusStyle.expired}`}>
                            {transactionStatusLabel[tx.status] || tx.status}
                          </span>
                        </td>
                        <td className="p-3">
                          {tx.ip_address ? (
                            <div className="flex items-center gap-1">
                              <Button variant="link" size="sm" onClick={() => copyTransactionValue(tx.ip_address || '', 'IP Address')} className="h-auto p-0 font-mono text-xs">{tx.ip_address}</Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="Blokir IP ini" onClick={() => blockIp(tx.ip_address!)}>
                                <Shield className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3 text-xs whitespace-nowrap"><div>{new Date(tx.created_at).toLocaleDateString('id-ID')}</div><div className="text-muted-foreground">{new Date(tx.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div></td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            {tx.status !== 'paid' && tx.status !== 'claimed' && (
                              <Button variant="ghost" size="sm" onClick={() => setTransactionPaid(tx.id)} title="Set Paid" className="text-green-400 hover:text-green-300 hover:bg-green-500/10">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setEditingTransaction(tx)} title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteTransaction(tx.id)} title="Delete" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {currentTxList.length === 0 && (
                      <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Tidak ada transaksi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {currentTxList.map(tx => (
                  <Card key={tx.id} className={`glass-card overflow-hidden ${selectedTxIds.has(tx.id) ? 'border-primary/50' : ''}`}>
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox aria-label={`Pilih transaksi ${tx.transaction_id}`} checked={selectedTxIds.has(tx.id)} onCheckedChange={() => toggleSelectTx(tx.id)} className="mt-1" />
                        <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{tx.customer_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString('id-ID')}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${transactionStatusStyle[tx.status] || transactionStatusStyle.expired}`}>{transactionStatusLabel[tx.status] || tx.status}</span></div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/35 p-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">{txTab === 'xcoins' ? 'Top-up' : 'Paket'}</p><p className="mt-1 font-medium">{txTab === 'xcoins' ? formatRupiah(tx.original_amount) : tx.package_name}</p>{txTab !== 'xcoins' && <p className="text-xs text-muted-foreground">{tx.package_duration} hari</p>}</div>
                        <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-semibold text-primary">{formatRupiah(tx.total_amount)}</p></div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">ID transaksi</span><Button variant="ghost" size="sm" className="h-7 min-w-0 max-w-[65%] px-2 font-mono text-xs" onClick={() => copyTransactionValue(tx.transaction_id, 'Transaction ID')}><span className="truncate">{tx.transaction_id}</span><Copy className="h-3 w-3" /></Button></div>
                        {tx.customer_whatsapp && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">WhatsApp</span><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copyTransactionValue(tx.customer_whatsapp || '', 'Nomor WhatsApp')}>{tx.customer_whatsapp}<Copy className="h-3 w-3" /></Button></div>}
                        {tx.license_key && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">License key</span><Button variant="ghost" size="sm" className="h-7 min-w-0 max-w-[65%] px-2 font-mono text-xs" onClick={() => copyTransactionValue(tx.license_key || '', 'License key')}><span className="truncate">{tx.license_key}</span><Copy className="h-3 w-3" /></Button></div>}
                        {tx.ip_address && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">IP address</span><div className="flex items-center"><Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-xs" onClick={() => copyTransactionValue(tx.ip_address || '', 'IP Address')}>{tx.ip_address}</Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Blokir IP" onClick={() => blockIp(tx.ip_address || '')}><Shield className="h-3.5 w-3.5" /></Button></div></div>}
                      </div>
                      <div className="flex justify-end gap-1 border-t border-border/60 pt-3">
                        {tx.status !== 'paid' && tx.status !== 'claimed' && <Button variant="ghost" size="sm" onClick={() => setTransactionPaid(tx.id)} className="text-success"><CheckCircle />Lunas</Button>}
                        <Button variant="ghost" size="sm" onClick={() => setEditingTransaction(tx)}><Edit2 />Edit</Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteTransaction(tx.id)} title="Hapus transaksi" className="text-destructive"><Trash2 /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {currentTxList.length === 0 && <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Tidak ada transaksi yang cocok.</div>}
              </div>
            </TabsContent>

            {/* Social Links Tab */}
            <TabsContent value="social" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-display font-semibold">Social Links</h2>
                <Button onClick={() => setEditingSocialLink({
                  id: crypto.randomUUID(),
                  name: '',
                  icon_type: 'link',
                  url: '',
                  label: '',
                  link_location: 'home',
                  is_active: true,
                  sort_order: socialLinks.length
                })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Link
                </Button>
              </div>

              {editingSocialLink && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{editingSocialLink.name ? 'Edit' : 'New'} Social Link</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={editingSocialLink.name}
                          onChange={e => setEditingSocialLink({ ...editingSocialLink, name: e.target.value })}
                          className="bg-background/50"
                        />
                      </div>
                      <div>
                        <Label>Label</Label>
                        <Input
                          value={editingSocialLink.label}
                          onChange={e => setEditingSocialLink({ ...editingSocialLink, label: e.target.value })}
                          className="bg-background/50"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>URL</Label>
                      <Input
                        value={editingSocialLink.url}
                        onChange={e => setEditingSocialLink({ ...editingSocialLink, url: e.target.value })}
                        placeholder="https://..."
                        className="bg-background/50"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Icon Type</Label>
                        <select
                          value={editingSocialLink.icon_type}
                          onChange={e => setEditingSocialLink({ ...editingSocialLink, icon_type: e.target.value })}
                          className="w-full p-2 rounded-md bg-background/50 border border-border"
                        >
                          <option value="link">Link</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="whatsapp-contact">WhatsApp Contact</option>
                          <option value="telegram">Telegram</option>
                          <option value="discord">Discord</option>
                          <option value="youtube">YouTube</option>
                          <option value="tiktok">TikTok</option>
                          <option value="instagram">Instagram</option>
                        </select>
                      </div>
                      <div>
                        <Label>Location</Label>
                        <select
                          value={editingSocialLink.link_location}
                          onChange={e => setEditingSocialLink({ ...editingSocialLink, link_location: e.target.value })}
                          className="w-full p-2 rounded-md bg-background/50 border border-border"
                        >
                          <option value="home">Home</option>
                          <option value="footer">Footer</option>
                          <option value="both">Both</option>
                        </select>
                      </div>
                      <div>
                        <Label>Sort Order</Label>
                        <Input
                          type="number"
                          value={editingSocialLink.sort_order}
                          onChange={e => setEditingSocialLink({ ...editingSocialLink, sort_order: parseInt(e.target.value) })}
                          className="bg-background/50"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editingSocialLink.is_active}
                        onCheckedChange={checked => setEditingSocialLink({ ...editingSocialLink, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveSocialLink(editingSocialLink)}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingSocialLink(null)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4">
                {socialLinks.map(link => (
                  <Card key={link.id} className="glass-card">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{link.name}</span>
                          <span className="text-xs text-muted-foreground">({link.icon_type})</span>
                          {!link.is_active && <span className="text-xs text-destructive">[Inactive]</span>}
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">{link.url}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingSocialLink(link)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteSocialLink(link.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Promo tab removed - merged into Packages */}

            {/* Devices + IP Block Tab (merged) */}
            <TabsContent value="devices" className="space-y-6">
              <DeviceManagement
                sessions={allSessions}
                currentDeviceId={deviceId}
                onApprove={approveDevice}
                onRemove={removeDevice}
                onRefresh={loadAllSessions}
              />

              <DeveloperAccessLogs />


              {/* IP Blocking Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldX className="w-5 h-5 text-destructive" />
                    IP Address Blocking
                    {blockedIps.length > 0 && (
                      <span className="min-w-[20px] h-[20px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1">
                        {blockedIps.length}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>Blokir IP address agar tidak bisa mengakses website</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Masukkan IP address (contoh: 192.168.1.1)"
                      value={newBlockIp}
                      onChange={(e) => setNewBlockIp(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Alasan blokir (opsional)"
                      value={newBlockReason}
                      onChange={(e) => setNewBlockReason(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={addBlockedIp} variant="destructive" className="gap-1.5">
                      <ShieldX className="w-4 h-4" />
                      Blokir
                    </Button>
                  </div>

                  {blockedIps.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Belum ada IP yang diblokir</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left p-3 font-medium">IP Address</th>
                            <th className="text-left p-3 font-medium">Alasan</th>
                            <th className="text-left p-3 font-medium hidden sm:table-cell">Tanggal Blokir</th>
                            <th className="text-right p-3 font-medium">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blockedIps.map((ip) => (
                            <tr key={ip.id} className="border-t">
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-xs">{ip.ip_address}</span>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Lacak lokasi" onClick={() => lookupIpGeolocation(ip.ip_address)}>
                                    <MapPin className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                              <td className="p-3 text-muted-foreground">{ip.reason || '-'}</td>
                              <td className="p-3 text-muted-foreground hidden sm:table-cell">
                                {new Date(ip.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="p-3 text-right">
                                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => unblockIp(ip.id, ip.ip_address)}>
                                  <ShieldOff className="w-3 h-3" />
                                  Unblock
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Backup Tab */}
            <TabsContent value="backup" className="space-y-4">
              <BackupRestore />
            </TabsContent>

            {/* Storage Tab */}
            <TabsContent value="storage" className="space-y-4">
              <StorageMonitor />
            </TabsContent>
          </Tabs>

          {/* IP Geolocation Modal */}
          {geoIp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setGeoIp(null)}>
              <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-display font-bold flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      Lokasi IP: {geoIp}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setGeoIp(null)}>✕</Button>
                  </div>

                  {geoLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                      <span className="ml-2 text-muted-foreground">Melacak lokasi...</span>
                    </div>
                  ) : geoData?.status === 'success' ? (
                    <div className="space-y-4">
                      {/* Map */}
                      <div className="rounded-lg overflow-hidden border border-border">
                        <iframe
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${geoData.lon - 0.05},${geoData.lat - 0.03},${geoData.lon + 0.05},${geoData.lat + 0.03}&layer=mapnik&marker=${geoData.lat},${geoData.lon}`}
                          className="w-full h-64"
                          style={{ border: 0 }}
                          title="IP Location Map"
                        />
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Negara</p>
                          <p className="font-medium">{geoData.country} ({geoData.countryCode})</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Provinsi/Region</p>
                          <p className="font-medium">{geoData.regionName}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Kota</p>
                          <p className="font-medium">{geoData.city}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Kode Pos</p>
                          <p className="font-medium">{geoData.zip || '-'}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Latitude</p>
                          <p className="font-mono font-medium">{geoData.lat}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Longitude</p>
                          <p className="font-mono font-medium">{geoData.lon}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Timezone</p>
                          <p className="font-medium">{geoData.timezone}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">ISP</p>
                          <p className="font-medium">{geoData.isp}</p>
                        </div>
                        <div className="col-span-2 bg-muted/50 rounded-lg p-3">
                          <p className="text-muted-foreground text-xs">Organisasi / AS</p>
                          <p className="font-medium">{geoData.org} — {geoData.as}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(`https://www.google.com/maps?q=${geoData.lat},${geoData.lon}`, '_blank')}>
                          <MapPin className="w-4 h-4 mr-1" />
                          Buka di Google Maps
                        </Button>
                        <Button variant="destructive" size="sm" className="flex-1" onClick={() => { blockIp(geoIp!); setGeoIp(null); }}>
                          <ShieldX className="w-4 h-4 mr-1" />
                          Blokir IP Ini
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Gagal mendapatkan lokasi untuk IP ini.</p>
                      <p className="text-xs mt-1">{geoData?.message || 'IP mungkin bersifat privat atau tidak terdaftar.'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
