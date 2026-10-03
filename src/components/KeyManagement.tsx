import { FC, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { 
  Key, Plus, Trash2, Edit2, RefreshCw, Save, 
  Users, Calendar, Shield, Copy, AlertTriangle,
  Download, Upload, Pause, Play, Clock, CheckSquare, Square
} from 'lucide-react';
import DurationCodeManager from '@/components/DurationCodeManager';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface KeyItem {
  key: string;
  expired: string;
  role: string;
  maxHwid: number;
  frozenUntil: string | null;
  frozenRemainingMs?: number;
  hwids: string[];
  robloxUsers: {
    hwid: string;
    username: string;
    registeredAt: string;
  }[];
}

interface KeyManagementProps {
  onRefresh?: () => void;
}

const TIME_UNITS: Record<string, number> = {
  'm': 60 * 1000,
  'j': 60 * 60 * 1000,
  'h': 24 * 60 * 60 * 1000,
  'b': 30 * 24 * 60 * 60 * 1000,
  't': 365 * 24 * 60 * 60 * 1000,
  'menit': 60 * 1000,
  'jam': 60 * 60 * 1000,
  'hari': 24 * 60 * 60 * 1000,
  'bulan': 30 * 24 * 60 * 60 * 1000,
  'tahun': 365 * 24 * 60 * 60 * 1000,
};

const parseBulkTime = (input: string): { ms: number; isAdd: boolean } | null => {
  const trimmed = input.trim();
  let isAdd = true;
  let workingInput = trimmed;

  if (workingInput.startsWith('+')) {
    isAdd = true;
    workingInput = workingInput.substring(1).trim();
  } else if (workingInput.startsWith('-')) {
    isAdd = false;
    workingInput = workingInput.substring(1).trim();
  }

  const parts = workingInput.split(/[,\s]+/).filter(p => p.length > 0);
  let totalMs = 0;
  
  for (const part of parts) {
    const match = part.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = TIME_UNITS[unit];
      if (multiplier) {
        totalMs += value * multiplier;
      }
    }
  }

  if (totalMs === 0) return null;
  return { ms: totalMs, isAdd };
};

const formatMsReadable = (ms: number): string => {
  if (ms <= 0) return '0';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  return parts.join(' ') || '0 menit';
};

// Convert ms remaining -> combo string like "1t 2b 5h 12j 20m"
const msToComboString = (ms: number): string => {
  if (ms <= 0) return '';
  const YEAR = 365 * 24 * 60 * 60 * 1000;
  const MONTH = 30 * 24 * 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const MIN = 60 * 1000;
  const years = Math.floor(ms / YEAR); ms -= years * YEAR;
  const months = Math.floor(ms / MONTH); ms -= months * MONTH;
  const days = Math.floor(ms / DAY); ms -= days * DAY;
  const hours = Math.floor(ms / HOUR); ms -= hours * HOUR;
  const minutes = Math.round(ms / MIN);
  const parts: string[] = [];
  if (years) parts.push(`${years}t`);
  if (months) parts.push(`${months}b`);
  if (days) parts.push(`${days}h`);
  if (hours) parts.push(`${hours}j`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
};

// Helper to convert Date to local datetime-local format (YYYY-MM-DDTHH:MM)
const toLocalDatetimeString = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const KeyManagement: FC<KeyManagementProps> = ({ onRefresh }) => {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<KeyItem | null>(null);
  const [isNewKey, setIsNewKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'frozen' | 'expired'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkTimeInput, setBulkTimeInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editTimeInput, setEditTimeInput] = useState('');
  const [expiryCombo, setExpiryCombo] = useState('');
  const [expiryComboError, setExpiryComboError] = useState('');

  // Realtime countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/get-keys`);
      const data = await response.json();
      if (data.keys) {
        setKeys(data.keys);
      }
    } catch (error) {
      console.error('Failed to fetch keys:', error);
      toast({ title: 'Error', description: 'Gagal mengambil data keys', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomStr = (length: number) => {
      let result = '';
      for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };
    return `AXSTOOLS-${randomStr(4)}-${randomStr(4)}`;
  };

  const handleCreateKey = async () => {
    if (!editingKey) return;
    
    setLoading(true);
    try {
      const keyToCreate = editingKey.key || generateKey();
      
      const response = await fetch(`${API_BASE}/create-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: keyToCreate,
          role: editingKey.role || 'VIP',
          expired: new Date(editingKey.expired).toISOString(),
          max_hwid: editingKey.maxHwid || 1
        })
      });
      
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Berhasil', description: `Key ${result.key} berhasil dibuat` });
        setEditingKey(null);
        setIsNewKey(false);
        fetchKeys();
      } else {
        toast({ title: 'Error', description: result.error || 'Gagal membuat key', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to create key:', error);
      toast({ title: 'Error', description: 'Gagal membuat key', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateKey = async () => {
    if (!editingKey) return;
    
    // Build update payload - only validate expired if it was changed
    const updatePayload: Record<string, any> = {
      key: editingKey.key,
      role: editingKey.role,
      maxHwid: editingKey.maxHwid,
      hwids: editingKey.hwids,
      robloxUsers: editingKey.robloxUsers,
      frozenUntil: editingKey.frozenUntil,
      frozenRemainingMs: editingKey.frozenRemainingMs,
    };

    // Try to parse expired - if valid send ISO, otherwise keep original string
    if (editingKey.expired) {
      const expDate = new Date(editingKey.expired);
      updatePayload.expired = isNaN(expDate.getTime()) ? editingKey.expired : expDate.toISOString();
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/update-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Berhasil', description: 'Key berhasil diupdate' });
        setEditingKey(null);
        fetchKeys();
      } else {
        toast({ title: 'Error', description: result.error || 'Gagal update key', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to update key:', error);
      toast({ title: 'Error', description: 'Gagal update key', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!confirm(`Yakin ingin menghapus key "${key}"?`)) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/delete-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Berhasil', description: 'Key berhasil dihapus' });
        fetchKeys();
      } else {
        toast({ title: 'Error', description: result.error || 'Gagal menghapus key', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to delete key:', error);
      toast({ title: 'Error', description: 'Gagal menghapus key', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllKeys = async () => {
    if (!confirm(`⚠️ PERINGATAN!\n\nAnda akan menghapus SEMUA ${keys.length} keys!\n\nAksi ini tidak dapat dibatalkan.\n\nLanjutkan?`)) return;
    if (!confirm(`Ketik "HAPUS SEMUA" untuk konfirmasi:\n\nApakah Anda yakin ingin menghapus semua keys?`)) return;
    
    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const keyItem of keys) {
      try {
        const response = await fetch(`${API_BASE}/delete-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyItem.key })
        });
        
        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    toast({ 
      title: 'Delete All Selesai', 
      description: `${successCount} berhasil dihapus, ${errorCount} gagal`,
      variant: errorCount > 0 ? 'destructive' : 'default'
    });
    fetchKeys();
    setLoading(false);
  };

  const toggleFreezeKey = async (keyItem: KeyItem) => {
    setLoading(true);
    try {
      const now = new Date();
      const expiredDate = new Date(keyItem.expired);
      
      let updateData: any = { key: keyItem.key };
      
      if (keyItem.frozenUntil) {
        // Unfreeze: Calculate new expiry based on remaining time
        const remainingMs = keyItem.frozenRemainingMs || 0;
        const newExpiry = new Date(now.getTime() + remainingMs);
        updateData.expired = newExpiry.toISOString();
        updateData.frozenUntil = null;
        updateData.frozenRemainingMs = null;
      } else {
        // Freeze: Store remaining time
        const remainingMs = expiredDate.getTime() - now.getTime();
        updateData.frozenUntil = now.toISOString();
        updateData.frozenRemainingMs = remainingMs > 0 ? remainingMs : 0;
      }

      const response = await fetch(`${API_BASE}/update-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      const result = await response.json();
      if (result.success) {
        toast({ 
          title: 'Berhasil', 
          description: keyItem.frozenUntil ? 'Key berhasil di-unfreeze' : 'Key berhasil di-freeze' 
        });
        fetchKeys();
      } else {
        toast({ title: 'Error', description: result.error || 'Gagal update key', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to toggle freeze:', error);
      toast({ title: 'Error', description: 'Gagal toggle freeze', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const freezeAllKeys = async (freeze: boolean) => {
    if (!confirm(freeze ? 'Freeze semua key?' : 'Unfreeze semua key?')) return;
    
    setLoading(true);
    const now = new Date();
    
    for (const key of keys) {
      if (freeze && !key.frozenUntil) {
        const expiredDate = new Date(key.expired);
        const remainingMs = expiredDate.getTime() - now.getTime();
        await fetch(`${API_BASE}/update-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: key.key,
            frozenUntil: now.toISOString(),
            frozenRemainingMs: remainingMs > 0 ? remainingMs : 0
          })
        });
      } else if (!freeze && key.frozenUntil) {
        const remainingMs = key.frozenRemainingMs || 0;
        const newExpiry = new Date(now.getTime() + remainingMs);
        await fetch(`${API_BASE}/update-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: key.key,
            expired: newExpiry.toISOString(),
            frozenUntil: null,
            frozenRemainingMs: null
          })
        });
      }
    }
    
    toast({ title: 'Berhasil', description: freeze ? 'Semua key di-freeze' : 'Semua key di-unfreeze' });
    fetchKeys();
    setLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: 'Key berhasil disalin' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeRemaining = (keyItem: KeyItem) => {
    if (keyItem.frozenUntil) {
      const remainingMs = keyItem.frozenRemainingMs || 0;
      const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
      return { 
        text: `⏸️ ${days}d ${hours}h ${minutes}m ${seconds}s`, 
        className: 'text-blue-400',
        frozen: true 
      };
    }
    
    const role = (keyItem.role || '').toLowerCase();
    const isPermanent = role === 'admin' || role === 'developer';
    if (isPermanent) {
      return { text: '∞ PERMANEN', className: 'text-cyan-400', frozen: false };
    }
    
    const now = currentTime;
    const expired = new Date(keyItem.expired);
    const diff = expired.getTime() - now.getTime();
    
    if (diff <= 0) {
      return { text: 'EXPIRED', className: 'text-destructive', frozen: false };
    }
    
    if (diff > 50 * 365 * 24 * 60 * 60 * 1000) {
      return { text: '∞ PERMANEN', className: 'text-cyan-400', frozen: false };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) {
      return { text: `${days}d ${hours}h ${minutes}m ${seconds}s`, className: 'text-secondary', frozen: false };
    } else if (hours > 0) {
      return { text: `${hours}h ${minutes}m ${seconds}s`, className: 'text-yellow-400', frozen: false };
    } else {
      return { text: `${minutes}m ${seconds}s`, className: 'text-destructive', frozen: false };
    }
  };

  const isExpired = (keyItem: KeyItem) => {
    if (keyItem.frozenUntil) return false;
    const role = (keyItem.role || '').toLowerCase();
    if (role === 'admin' || role === 'developer') return false;
    return new Date(keyItem.expired) < new Date();
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_hsl(195_100%_55%/0.35)]';
      case 'developer':
        return 'bg-gradient-to-r from-blue-500/25 to-cyan-500/25 text-blue-200 border border-blue-400/40 shadow-[0_0_14px_hsl(210_100%_55%/0.45)]';
      case 'vip':
        return 'bg-gradient-to-r from-purple-500/30 to-fuchsia-500/30 text-purple-200 border border-purple-400/50 shadow-[0_0_14px_hsl(280_90%_65%/0.45)] animate-pulse-slow';
      case 'normal':
        return 'bg-gradient-to-r from-emerald-500/25 to-green-500/25 text-emerald-200 border border-emerald-400/40 shadow-[0_0_12px_hsl(142_76%_45%/0.35)]';
      default:
        return 'bg-muted text-muted-foreground border border-border';
    }
  };

  const filteredKeys = keys.filter(k => {
    const matchesSearch = k.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.robloxUsers.some(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (statusFilter === 'frozen') return !!k.frozenUntil;
    if (statusFilter === 'expired') return !k.frozenUntil && new Date(k.expired) < new Date();
    if (statusFilter === 'active') return !k.frozenUntil && new Date(k.expired) >= new Date();
    return true;
  });

  const frozenCount = keys.filter(k => k.frozenUntil).length;
  const expiredCount = keys.filter(k => !k.frozenUntil && new Date(k.expired) < new Date()).length;
  const activeCount = keys.length - frozenCount - expiredCount;

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredKeys.map(k => k.key)));
    }
  };

  const toggleKeySelection = (key: string) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
    setSelectedKeys(newSet);
  };

  const applyBulkTimeAdjustment = async () => {
    if (selectedKeys.size === 0) {
      toast({ title: 'Error', description: 'Pilih setidaknya satu key', variant: 'destructive' });
      return;
    }
    const parsed = parseBulkTime(bulkTimeInput);
    if (!parsed) {
      toast({ title: 'Error', description: 'Format waktu tidak valid. Contoh: +7h, -1b, +30m', variant: 'destructive' });
      return;
    }
    const action = parsed.isAdd ? 'Tambah' : 'Kurangi';
    if (!confirm(`${action} ${formatMsReadable(parsed.ms)} untuk ${selectedKeys.size} key?`)) return;

    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const keyName of selectedKeys) {
      const keyItem = keys.find(k => k.key === keyName);
      if (!keyItem) continue;
      try {
        const currentExpiry = new Date(keyItem.expired);
        const newExpiry = new Date(currentExpiry.getTime() + (parsed.isAdd ? parsed.ms : -parsed.ms));
        const res = await fetch(`${API_BASE}/update-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyName, expired: newExpiry.toISOString() })
        });
        const r = await res.json();
        if (r.success) ok++; else fail++;
      } catch { fail++; }
    }
    toast({ title: 'Bulk Update Selesai', description: `${ok} berhasil, ${fail} gagal`, variant: fail > 0 ? 'destructive' : 'default' });
    setBulkTimeInput('');
    setSelectedKeys(new Set());
    fetchKeys();
    setBulkLoading(false);
  };

  const deleteSelectedKeys = async () => {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Hapus ${selectedKeys.size} key yang dipilih?`)) return;
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const keyName of selectedKeys) {
      try {
        const res = await fetch(`${API_BASE}/delete-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyName })
        });
        const r = await res.json();
        if (r.success) ok++; else fail++;
      } catch { fail++; }
    }
    toast({ title: 'Bulk Delete Selesai', description: `${ok} dihapus, ${fail} gagal`, variant: fail > 0 ? 'destructive' : 'default' });
    setSelectedKeys(new Set());
    fetchKeys();
    setBulkLoading(false);
  };

  const handleQuickAddHwidSlot = async (k: KeyItem) => {
    const newMax = (k.maxHwid || 1) + 1;
    try {
      const response = await fetch(`${API_BASE}/update-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k.key, maxHwid: newMax }),
      });
      const res = await response.json();
      if (res.success) {
        toast({ title: 'Slot HWID Ditambah', description: `Key ${k.key} kini memiliki ${newMax} slot HWID.` });
        fetchKeys();
      } else {
        toast({ title: 'Gagal', description: res.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const startNewKey = () => {
    const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // default +1 hari

    setEditingKey({
      key: '',
      expired: toLocalDatetimeString(defaultExpiry),
      role: 'VIP',
      maxHwid: 1,
      frozenUntil: null,
      hwids: [],
      robloxUsers: []
    });
    setExpiryCombo('1h');
    setExpiryComboError('');
    setIsNewKey(true);
  };

  // Export keys to JSON file with complete format
  const exportKeys = () => {
    const exportData = keys.map(k => ({
      key: k.key,
      expired: k.expired,
      created: new Date().toISOString(), // Add created field
      role: k.role,
      maxHwid: k.maxHwid,
      Freeze: k.frozenUntil ? true : false, // Add Freeze status
      frozenUntil: k.frozenUntil,
      frozenRemainingMs: k.frozenRemainingMs,
      hwids: k.hwids,
      robloxUsers: k.robloxUsers
    }));
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `axs-keys-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Berhasil', description: `${keys.length} keys berhasil diekspor` });
  };

  // Import keys from JSON file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedKeys: KeyItem[] = JSON.parse(text);
      
      if (!Array.isArray(importedKeys)) {
        toast({ title: 'Error', description: 'Format file tidak valid', variant: 'destructive' });
        return;
      }

      setLoading(true);
      let successCount = 0;
      let errorCount = 0;

      for (const keyData of importedKeys) {
        try {
          const response = await fetch(`${API_BASE}/create-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: keyData.key,
              role: keyData.role || 'VIP',
              expired: keyData.expired,
              max_hwid: keyData.maxHwid || 1
            })
          });
          
          const result = await response.json();
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
      }

      toast({ 
        title: 'Import Selesai', 
        description: `${successCount} berhasil, ${errorCount} gagal` 
      });
      fetchKeys();
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Error', description: 'Gagal membaca file JSON', variant: 'destructive' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Auto-cleanup state
  const [autoDeleteKeysEnabled, setAutoDeleteKeysEnabled] = useState(false);
  const [autoDeleteKeysDays, setAutoDeleteKeysDays] = useState('7');

  useEffect(() => {
    const loadCleanupSettings = async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', ['auto_delete_keys_enabled', 'auto_delete_keys_days']);
      if (data) {
        for (const s of data) {
          if (s.key === 'auto_delete_keys_enabled') setAutoDeleteKeysEnabled(s.value === 'on');
          if (s.key === 'auto_delete_keys_days') setAutoDeleteKeysDays(s.value);
        }
      }
    };
    loadCleanupSettings();
  }, []);

  const updateCleanupSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle();
    if (existing) {
      await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
    } else {
      await supabase.from('app_settings').insert({ key, value, description: `Auto cleanup setting: ${key}` });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header dengan info */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h2 className="text-lg md:text-xl font-display font-semibold flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              License Keys Arexans Tools
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
              Kunci Utama Arexans Tools
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              Total: {keys.length} | Aktif: {activeCount} | Frozen: {frozenCount} | Expired: {expiredCount}
            </span>
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchKeys} disabled={loading} className="w-fit">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Auto-cleanup expired keys */}
        <Card className="glass-card">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium flex items-center gap-2 mb-2"><Trash2 className="w-4 h-4 text-muted-foreground" /> Auto-Cleanup Key Expired</p>
            <div className="flex gap-2 items-center">
              <Switch
                checked={autoDeleteKeysEnabled}
                onCheckedChange={checked => {
                  setAutoDeleteKeysEnabled(checked);
                  updateCleanupSetting('auto_delete_keys_enabled', checked ? 'on' : 'off');
                }}
              />
              <span className="text-xs text-muted-foreground">Hapus key expired lebih dari</span>
              <Input
                type="number"
                className="w-20 bg-background/50"
                value={autoDeleteKeysDays}
                onChange={e => {
                  setAutoDeleteKeysDays(e.target.value);
                  updateCleanupSetting('auto_delete_keys_days', e.target.value);
                }}
              />
              <span className="text-xs text-muted-foreground">hari</span>
            </div>
          </CardContent>
        </Card>
        
        {/* Search bar - full width on mobile */}
        <div className="w-full">
          <Input
            placeholder="🔍 Search key, role, username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background/50"
          />
        </div>

        {/* Status filter buttons */}
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'all', label: `Semua (${keys.length})` },
            { value: 'active', label: `Aktif (${activeCount})` },
            { value: 'frozen', label: `Frozen (${frozenCount})` },
            { value: 'expired', label: `Expired (${expiredCount})` },
          ] as const).map(f => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Action buttons - scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          <Button variant="outline" size="sm" onClick={exportKeys} disabled={keys.length === 0} className="whitespace-nowrap">
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()} 
            disabled={loading}
            className="whitespace-nowrap"
          >
            <Upload className="w-4 h-4 mr-1" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleDeleteAllKeys}
            disabled={loading || keys.length === 0}
            className="whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete All
          </Button>
          <Button size="sm" onClick={startNewKey} className="whitespace-nowrap">
            <Plus className="w-4 h-4 mr-1" />
            Add Key
          </Button>
        </div>
      </div>

      {/* Freeze All Controls */}
      <Card className="glass-card border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Pause className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="font-medium">Freeze Control</h3>
                <p className="text-sm text-muted-foreground">
                  Freeze akan menjeda countdown expiry, unfreeze akan melanjutkan dari sisa waktu
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => freezeAllKeys(true)}
                disabled={loading || frozenCount === keys.length}
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
              >
                <Pause className="w-4 h-4 mr-2" />
                Freeze All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => freezeAllKeys(false)}
                disabled={loading || frozenCount === 0}
                className="border-green-500/50 text-green-400 hover:bg-green-500/20"
              >
                <Play className="w-4 h-4 mr-2" />
                Unfreeze All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Selection & Duration Adjustment */}
      {filteredKeys.length > 0 && (
        <Card className="glass-card border-yellow-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleSelectAll}
                  className="border-yellow-500/50"
                >
                  {selectedKeys.size === filteredKeys.length ? (
                    <><Square className="w-4 h-4 mr-2" /> Batal Pilih Semua</>
                  ) : (
                    <><CheckSquare className="w-4 h-4 mr-2" /> Pilih Semua ({filteredKeys.length})</>
                  )}
                </Button>
                {selectedKeys.size > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={deleteSelectedKeys}
                    disabled={bulkLoading}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hapus ({selectedKeys.size})
                  </Button>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedKeys.size} dari {filteredKeys.length} dipilih
              </span>
            </div>

            {selectedKeys.size > 0 && (
              <div className="space-y-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <Label className="flex items-center gap-2 text-yellow-400">
                  <Clock className="w-4 h-4" />
                  Adjust Durasi untuk {selectedKeys.size} key
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={bulkTimeInput}
                    onChange={(e) => setBulkTimeInput(e.target.value)}
                    placeholder="Contoh: +7h, -1b, +30m, +1t"
                    className="bg-background/50 font-mono flex-1"
                  />
                  <Button 
                    onClick={applyBulkTimeAdjustment} 
                    disabled={bulkLoading || !bulkTimeInput.trim()}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black"
                  >
                    {bulkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Apply'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="text-xs text-muted-foreground mr-1">Quick:</span>
                  {[
                    { label: '+30m', value: '+30m' },
                    { label: '+1j', value: '+1j' },
                    { label: '+7h', value: '+7h' },
                    { label: '+1b', value: '+1b' },
                    { label: '+1t', value: '+1t' },
                    { label: '-7h', value: '-7h' },
                    { label: '-1b', value: '-1b' },
                  ].map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBulkTimeInput(value)}
                      className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-yellow-500/20 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  m=menit, j=jam, h=hari, b=bulan, t=tahun. Gunakan + atau - di depan.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editingKey && (
        <Card className="glass-card border-primary/50">
          <CardHeader>
            <CardTitle>{isNewKey ? 'Create New Key' : 'Edit Key'}</CardTitle>
            <CardDescription>
              {isNewKey ? 'Buat license key baru (format: AXSTOOLS-XXXX-XXXX)' : 'Edit data license key'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Key {isNewKey && '(kosongkan untuk auto-generate)'}</Label>
                <Input
                  value={editingKey.key}
                  onChange={(e) => setEditingKey({ ...editingKey, key: e.target.value })}
                  placeholder="AXSTOOLS-XXXX-XXXX"
                  className="bg-background/50 font-mono"
                  disabled={!isNewKey}
                />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  value={editingKey.role}
                  onChange={(e) => setEditingKey({ ...editingKey, role: e.target.value })}
                  className="w-full p-2 rounded-md bg-background/50 border border-border"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="Developer">Developer</option>
                  <option value="VIP">VIP</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="Free">Free</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Expired Duration (dari sekarang)</Label>
                <Input
                  type="text"
                  value={expiryCombo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExpiryCombo(val);
                    if (!val.trim()) {
                      setExpiryComboError('Wajib diisi');
                      return;
                    }
                    const parsed = parseBulkTime(val);
                    if (!parsed) {
                      setExpiryComboError('Format salah. Contoh: 1t 2b 1h 12j 20m');
                      return;
                    }
                    setExpiryComboError('');
                    const newExpiry = new Date(Date.now() + parsed.ms);
                    setEditingKey({ ...editingKey, expired: toLocalDatetimeString(newExpiry) });
                  }}
                  placeholder="Contoh: 1t 2b 1h 12j 20m"
                  className={`bg-background/50 font-mono ${expiryComboError ? 'border-destructive' : ''}`}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    t=tahun · b=bulan · h=hari · j=jam · m=menit
                  </span>
                  <span className="font-mono text-primary">
                    → {new Date(editingKey.expired).toLocaleString('id-ID')}
                  </span>
                </div>
                {expiryComboError && (
                  <p className="text-xs text-destructive mt-1">{expiryComboError}</p>
                )}
              </div>
              <div>
                <Label>Max HWID</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingKey.maxHwid}
                  onChange={(e) => setEditingKey({ ...editingKey, maxHwid: parseInt(e.target.value) })}
                  className="bg-background/50"
                />
              </div>
            </div>

            {/* Quick time adjustment */}
            <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Label className="flex items-center gap-2 text-primary">
                <Clock className="w-4 h-4" />
                Tambah/Kurangi Waktu (opsional)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={editTimeInput}
                  onChange={(e) => setEditTimeInput(e.target.value)}
                  placeholder="Contoh: +7h, -1b, +30m, +1t"
                  className="bg-background/50 font-mono flex-1"
                />
                <Button 
                  variant="outline"
                  size="sm"
                  disabled={!editTimeInput.trim()}
                  onClick={() => {
                    const parsed = parseBulkTime(editTimeInput);
                    if (!parsed) {
                      toast({ title: 'Error', description: 'Format waktu tidak valid', variant: 'destructive' });
                      return;
                    }
                    const currentExpiry = new Date(editingKey.expired);
                    const newExpiry = new Date(currentExpiry.getTime() + (parsed.isAdd ? parsed.ms : -parsed.ms));
                    setEditingKey({ ...editingKey, expired: toLocalDatetimeString(newExpiry) });
                    const remaining = newExpiry.getTime() - Date.now();
                    setExpiryCombo(remaining > 0 ? msToComboString(remaining) : '');
                    setExpiryComboError('');
                    setEditTimeInput('');
                    toast({ title: 'Diterapkan', description: `${parsed.isAdd ? '+' : '-'}${formatMsReadable(parsed.ms)}` });
                  }}
                >
                  Apply
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Quick:</span>
                {['+30m', '+1j', '+7h', '+1b', '+1t', '-7h', '-1b'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEditTimeInput(v)}
                    className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-primary/20 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">m=menit, j=jam, h=hari, b=bulan, t=tahun</p>
            </div>
            
            {!isNewKey && (
              <div>
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  HWIDs ({editingKey.hwids.length}/{editingKey.maxHwid})
                </Label>
                <div className="mt-2 space-y-2">
                  {editingKey.hwids.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada HWID terdaftar</p>
                  ) : editingKey.hwids.map((hwid, idx) => {
                    const rUser = editingKey.robloxUsers.find(u => u.hwid === hwid);
                    return (
                      <div key={idx} className="flex items-center justify-between bg-muted/30 p-2 rounded">
                        <div>
                          <span className="font-mono text-sm">{hwid}</span>
                          {rUser && <span className="text-xs text-muted-foreground ml-2">({rUser.username})</span>}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            const newHwids = editingKey.hwids.filter((_, i) => i !== idx);
                            const newRobloxUsers = editingKey.robloxUsers.filter(u => u.hwid !== hwid);
                            setEditingKey({ ...editingKey, hwids: newHwids, robloxUsers: newRobloxUsers });
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={isNewKey ? handleCreateKey : handleUpdateKey} 
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { setEditingKey(null); setIsNewKey(false); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duration Codes Management */}
      <DurationCodeManager />

      {/* Keys List */}
      <div className="grid gap-3">
        {loading && keys.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              Loading keys...
            </CardContent>
          </Card>
        ) : filteredKeys.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {searchQuery ? 'Tidak ada key yang cocok' : 'Belum ada key'}
            </CardContent>
          </Card>
        ) : (
          filteredKeys.map((k) => {
            const timeRemaining = getTimeRemaining(k);
            return (
              <Card key={k.key} className={`glass-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_hsl(210_100%_55%/0.55)] animate-fade-in ${k.role.toLowerCase() === 'vip' ? 'hover:border-purple-400/60' : k.role.toLowerCase() === 'normal' ? 'hover:border-emerald-400/60' : 'hover:border-primary/50'} ${isExpired(k) ? 'opacity-60' : ''} ${k.frozenUntil ? 'border-blue-500/30' : ''} ${selectedKeys.has(k.key) ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Checkbox
                        checked={selectedKeys.has(k.key)}
                        onCheckedChange={() => toggleKeySelection(k.key)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-sm bg-muted px-2 py-1 rounded truncate max-w-[300px]">
                          {k.key}
                        </code>
                        <button
                          onClick={() => copyToClipboard(k.key)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleColor(k.role)}`}>
                          {k.role}
                        </span>
                        {k.frozenUntil && (
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 flex items-center gap-1">
                            <Pause className="w-3 h-3" />
                            FROZEN
                          </span>
                        )}
                        {isExpired(k) && (
                          <span className="px-2 py-0.5 rounded text-xs bg-destructive/20 text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(k.expired)}
                        </span>
                        <span className={`flex items-center gap-1 font-mono font-bold ${timeRemaining.className}`}>
                          <Clock className="w-4 h-4" />
                          {timeRemaining.text}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {k.robloxUsers.length}/{k.maxHwid} HWID
                        </span>
                        {k.robloxUsers.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Shield className="w-4 h-4" />
                            {k.robloxUsers.map(u => u.username).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    </div>
                    <div className="flex gap-1.5 sm:gap-2 items-center">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleQuickAddHwidSlot(k)}
                        className="text-cyan-400 hover:text-cyan-300 gap-1 text-xs px-2 h-8"
                        title="Tambah +1 Slot HWID Permanen"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">+1 HWID</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => toggleFreezeKey(k)}
                        className={k.frozenUntil ? 'text-green-400 hover:text-green-300 h-8 w-8 p-0' : 'text-blue-400 hover:text-blue-300 h-8 w-8 p-0'}
                        title={k.frozenUntil ? 'Unfreeze' : 'Freeze'}
                      >
                        {k.frozenUntil ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setEditingKey({ ...k, expired: toLocalDatetimeString(new Date(k.expired)) });
                          const remaining = new Date(k.expired).getTime() - Date.now();
                          setExpiryCombo(remaining > 0 ? msToComboString(remaining) : '');
                          setExpiryComboError('');
                          setIsNewKey(false);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteKey(k.key)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default KeyManagement;
