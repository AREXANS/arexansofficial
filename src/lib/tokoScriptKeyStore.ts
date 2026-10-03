import { supabase } from '@/integrations/supabase/client';
import { TokoScriptKey, TokoScriptProduct } from '@/types/tokoScript';
import { getTokoScripts } from './tokoScriptStore';

const STORAGE_TOKO_KEYS = 'arexans_toko_script_keys_data';
const SETTING_TOKO_KEYS = 'toko_scripts_keys_data';

// Helper to reliably upsert app_settings without failing on conflict constraint
const upsertAppSetting = async (key: string, value: string, description?: string) => {
  try {
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .eq('key', key)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('app_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);
    } else {
      await supabase
        .from('app_settings')
        .insert({ key, value, description: description || null });
    }
  } catch (err) {
    console.warn(`[TokoScriptKeyStore] Error saving setting ${key}:`, err);
  }
};

/**
 * Ambil semua data key toko script dari Supabase atau localStorage
 */
export const getTokoScriptKeys = async (): Promise<TokoScriptKey[]> => {
  let localKeys: TokoScriptKey[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_TOKO_KEYS);
    if (raw) localKeys = JSON.parse(raw);
  } catch {}

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTING_TOKO_KEYS)
      .maybeSingle();

    if (data?.value) {
      const parsed: TokoScriptKey[] = JSON.parse(data.value);
      localStorage.setItem(STORAGE_TOKO_KEYS, JSON.stringify(parsed));
      return parsed;
    }
  } catch (err) {
    console.warn('[TokoScriptKeyStore] Failed to fetch keys from Supabase:', err);
  }

  return localKeys;
};

/**
 * Simpan seluruh array key toko script ke Supabase dan localStorage
 */
export const saveTokoScriptKeys = async (keys: TokoScriptKey[]): Promise<void> => {
  const json = JSON.stringify(keys);
  try {
    localStorage.setItem(STORAGE_TOKO_KEYS, json);
    window.dispatchEvent(new CustomEvent('toko_script_keys_updated', { detail: keys }));
  } catch {}

  await upsertAppSetting(SETTING_TOKO_KEYS, json, 'Database License Keys Toko Script');
};

/**
 * Generator custom key string acak untuk script toko
 */
export const generateTokoScriptKeyString = (prefix: string = 'TS'): string => {
  const cleanPrefix = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'TS';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randPart = (len: number) => {
    let res = '';
    for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  };
  return `${cleanPrefix}-${randPart(4)}-${randPart(4)}`;
};

/**
 * Buat key baru untuk produk toko script tertentu
 * PENTING: Tiap key HANYA terikat pada 1 produk (productId) yang ditentukan!
 */
export const createTokoScriptKey = async (payload: {
  key?: string;
  productId: string;
  productTitle: string;
  productRawId?: string;
  role?: string;
  durationDays: number;
  maxHwid?: number;
  customerName?: string;
  transactionId?: string;
  isLifetime?: boolean;
}): Promise<TokoScriptKey> => {
  const keys = await getTokoScriptKeys();
  const cleanKey = (payload.key || generateTokoScriptKeyString(payload.productTitle)).trim().toUpperCase();

  const isPermanent = payload.isLifetime || payload.durationDays >= 9999;
  const now = new Date();
  const expDate = new Date();
  if (isPermanent) {
    expDate.setFullYear(expDate.getFullYear() + 50); // 50 tahun untuk permanent
  } else {
    expDate.setDate(expDate.getDate() + (payload.durationDays || 30));
  }

  // Jika key sudah ada, kita update produk atau perpanjang
  const existingIndex = keys.findIndex(k => k.key.toUpperCase() === cleanKey);
  const newKeyItem: TokoScriptKey = {
    id: existingIndex >= 0 ? keys[existingIndex].id : 'tsk_' + Math.random().toString(36).slice(2, 10),
    key: cleanKey,
    productId: payload.productId,
    productTitle: payload.productTitle,
    productRawId: payload.productRawId,
    role: payload.role || (isPermanent ? 'Permanent' : `${payload.durationDays} Hari`),
    durationDays: payload.durationDays,
    createdAt: existingIndex >= 0 ? keys[existingIndex].createdAt : now.toISOString(),
    expired: expDate.toISOString(),
    isLifetime: isPermanent,
    maxHwid: payload.maxHwid || 1,
    hwids: existingIndex >= 0 ? keys[existingIndex].hwids : [],
    robloxUsers: existingIndex >= 0 ? keys[existingIndex].robloxUsers : [],
    frozenUntil: null,
    frozenRemainingMs: null,
    customerName: payload.customerName || (existingIndex >= 0 ? keys[existingIndex].customerName : 'Manual Developer'),
    transactionId: payload.transactionId || (existingIndex >= 0 ? keys[existingIndex].transactionId : undefined),
  };

  if (existingIndex >= 0) {
    keys[existingIndex] = newKeyItem;
  } else {
    keys.unshift(newKeyItem);
  }

  await saveTokoScriptKeys(keys);
  return newKeyItem;
};

/**
 * Update data key toko script
 */
export const updateTokoScriptKey = async (
  keyId: string,
  updates: Partial<TokoScriptKey>
): Promise<TokoScriptKey | null> => {
  const keys = await getTokoScriptKeys();
  const idx = keys.findIndex(k => k.id === keyId || k.key === keyId);
  if (idx === -1) return null;

  keys[idx] = {
    ...keys[idx],
    ...updates,
  };

  await saveTokoScriptKeys(keys);
  return keys[idx];
};

/**
 * Hapus key toko script
 */
export const deleteTokoScriptKey = async (keyId: string): Promise<boolean> => {
  const keys = await getTokoScriptKeys();
  const filtered = keys.filter(k => k.id !== keyId && k.key !== keyId);
  if (filtered.length === keys.length) return false;

  await saveTokoScriptKeys(filtered);
  return true;
};

/**
 * Reset HWID untuk key toko script (membersihkan perangkat yang terdaftar)
 */
export const resetTokoScriptKeyHwid = async (keyId: string): Promise<boolean> => {
  const keys = await getTokoScriptKeys();
  const idx = keys.findIndex(k => k.id === keyId || k.key === keyId);
  if (idx === -1) return false;

  keys[idx].hwids = [];
  keys[idx].robloxUsers = [];
  await saveTokoScriptKeys(keys);
  return true;
};

/**
 * Tambah +1 Slot HWID untuk key toko script
 */
export const addTokoScriptKeyHwidSlot = async (keyId: string, count: number = 1): Promise<number> => {
  const keys = await getTokoScriptKeys();
  const idx = keys.findIndex(k => k.id === keyId || k.key === keyId);
  if (idx === -1) return 1;

  const current = keys[idx].maxHwid || 1;
  const newMax = current + count;
  keys[idx].maxHwid = newMax;
  await saveTokoScriptKeys(keys);
  return newMax;
};

/**
 * Perpanjang masa aktif key (dalam hari)
 */
export const extendTokoScriptKeyDays = async (keyId: string, extraDays: number): Promise<string> => {
  const keys = await getTokoScriptKeys();
  const idx = keys.findIndex(k => k.id === keyId || k.key === keyId);
  if (idx === -1) throw new Error('Key tidak ditemukan');

  const keyItem = keys[idx];
  const now = new Date();
  const currentExpiry = new Date(keyItem.expired);
  const baseDate = currentExpiry > now ? currentExpiry : now;
  baseDate.setDate(baseDate.getDate() + extraDays);
  
  keyItem.expired = baseDate.toISOString();
  keyItem.isLifetime = false;
  await saveTokoScriptKeys(keys);
  return keyItem.expired;
};

/**
 * Bekukan (Freeze) Key Toko Script:
 * Simpan sisa masa aktif agar pembeli TIDAK rugi saat maintenance
 */
export const freezeTokoScriptKeys = async (
  targetProductId?: string
): Promise<{ success: boolean; count: number; message: string }> => {
  const keys = await getTokoScriptKeys();
  const now = new Date();
  let frozenCount = 0;

  const updated = keys.map(k => {
    // Jika targetProductId ditentukan, bekukan hanya untuk produk tersebut
    if (targetProductId && targetProductId !== 'all') {
      if (k.productId !== targetProductId && k.productRawId !== targetProductId) return k;
    }

    if (k.isLifetime) return k; // Lifetime tidak perlu freeze
    if (k.frozenUntil) return k; // Sudah di-freeze

    const exp = new Date(k.expired);
    const remainingMs = exp.getTime() - now.getTime();
    if (remainingMs > 0) {
      frozenCount++;
      return {
        ...k,
        frozenUntil: now.toISOString(),
        frozenRemainingMs: remainingMs,
      };
    }
    return k;
  });

  if (frozenCount > 0) {
    await saveTokoScriptKeys(updated);
  }

  return {
    success: true,
    count: frozenCount,
    message: `${frozenCount} key toko script berhasil dibekukan sementara. Masa aktif pembeli di-pause secara aman.`,
  };
};

/**
 * Lanjutkan (Unfreeze) Key Toko Script:
 * Tambahkan kembali sisa masa aktif secara utuh mulai dari sekarang
 */
export const unfreezeTokoScriptKeys = async (
  targetProductId?: string
): Promise<{ success: boolean; count: number; message: string }> => {
  const keys = await getTokoScriptKeys();
  const now = new Date();
  let unfrozenCount = 0;

  const updated = keys.map(k => {
    if (targetProductId && targetProductId !== 'all') {
      if (k.productId !== targetProductId && k.productRawId !== targetProductId) return k;
    }

    if (k.frozenUntil) {
      const remainingMs = k.frozenRemainingMs || 0;
      const newExpiry = new Date(now.getTime() + remainingMs);
      unfrozenCount++;
      return {
        ...k,
        expired: newExpiry.toISOString(),
        frozenUntil: null,
        frozenRemainingMs: null,
      };
    }
    return k;
  });

  if (unfrozenCount > 0) {
    await saveTokoScriptKeys(updated);
  }

  return {
    success: true,
    count: unfrozenCount,
    message: `${unfrozenCount} key toko script berhasil dilanjutkan. Durasi pembeli diperpanjang utuh tanpa potongan waktu.`,
  };
};

/**
 * Validasi Key Toko Script secara ketat:
 * 1. Key harus ada di database Toko Script
 * 2. Key HANYA BISA digunakan pada 1 produk (productId) yang dibeli! Jika beda produk, DITOLAK.
 * 3. Cek pembekuan (Maintenance)
 * 4. Cek kadaluarsa
 * 5. Cek batas HWID (Default 1 HWID slot)
 */
export const validateTokoScriptKey = async (params: {
  key: string;
  productId: string;
  productRawId?: string;
  hwid: string;
  robloxUsername?: string;
}): Promise<{
  valid: boolean;
  success: boolean;
  error?: string;
  keyData?: TokoScriptKey;
  frozen?: boolean;
  hwidLimitReached?: boolean;
}> => {
  const cleanKey = (params.key || '').trim().toUpperCase();
  const keys = await getTokoScriptKeys();
  const catalog = await getTokoScripts();

  const keyItem = keys.find(k => k.key.toUpperCase() === cleanKey);

  // Jika key tidak ditemukan di database Toko Script
  if (!keyItem) {
    // Cek apakah ini key Arexans Tools (dari license_keys)
    try {
      const { data: axsSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'license_keys')
        .maybeSingle();

      if (axsSetting?.value) {
        const axsKeys: any[] = JSON.parse(axsSetting.value);
        if (axsKeys.some(k => (k.key || '').toUpperCase() === cleanKey)) {
          return {
            valid: false,
            success: false,
            error: 'Key ini adalah Key Arexans Tools! Key Arexans Tools TIDAK DAPAT digunakan pada Toko Script. Tiap produk Toko Script memerlukan key khusus yang dibeli untuk produk tersebut.',
          };
        }
      }
    } catch {}

    return {
      valid: false,
      success: false,
      error: 'Key tidak valid atau belum terdaftar di sistem Toko Script.',
    };
  }

  // ATURAN KRUSIAL: CEK KECOCOKAN PRODUK (1 KEY HANYA UNTUK 1 PRODUK YANG DIBELI)
  const targetId = (params.productId || '').trim().toLowerCase();
  const targetRawId = (params.productRawId || '').trim().toLowerCase();
  const keyProdId = (keyItem.productId || '').trim().toLowerCase();
  const keyProdRawId = (keyItem.productRawId || '').trim().toLowerCase();

  // Cari produk katalog untuk memastikan pemetaan ID & RawId
  const currentCatalogItem = catalog.find(p => 
    p.id.toLowerCase() === targetId || 
    (p.rawId && p.rawId.toLowerCase() === targetId) ||
    (targetRawId && (p.id.toLowerCase() === targetRawId || (p.rawId && p.rawId.toLowerCase() === targetRawId)))
  );

  const keyCatalogItem = catalog.find(p =>
    p.id.toLowerCase() === keyProdId ||
    (p.rawId && p.rawId.toLowerCase() === keyProdId) ||
    (keyProdRawId && (p.id.toLowerCase() === keyProdRawId || (p.rawId && p.rawId.toLowerCase() === keyProdRawId)))
  );

  const isSameProduct = (
    keyProdId === targetId ||
    (targetRawId && keyProdId === targetRawId) ||
    (keyProdRawId && keyProdRawId === targetId) ||
    (currentCatalogItem && keyCatalogItem && currentCatalogItem.id === keyCatalogItem.id)
  );

  if (!isSameProduct) {
    const authorizedProduct = keyItem.productTitle || keyCatalogItem?.title || keyItem.productId;
    const attemptedProduct = currentCatalogItem?.title || params.productId;
    return {
      valid: false,
      success: false,
      error: `Akses Ditolak: Key "${cleanKey}" HANYA BERLAKU untuk produk "${authorizedProduct}". Key ini TIDAK DAPAT digunakan untuk menjalankan "${attemptedProduct}"!`,
    };
  }

  // CEK APAKAH KEY SEDANG DI-FREEZE (MAINTENANCE)
  if (keyItem.frozenUntil) {
    return {
      valid: false,
      success: false,
      frozen: true,
      error: `Key sedang dibekukan sementara karena produk "${keyItem.productTitle}" sedang dalam perbaikan (maintenance). Sisa masa aktif Anda tersimpan aman dan tidak berkurang.`,
    };
  }

  // CEK EXPIRED (KECUALI LIFETIME)
  if (!keyItem.isLifetime) {
    const expDate = new Date(keyItem.expired);
    const now = new Date();
    if (expDate < now) {
      return {
        valid: false,
        success: false,
        error: `Masa aktif key untuk "${keyItem.productTitle}" telah habis (expired pada ${expDate.toLocaleDateString('id-ID')}). Silakan beli perpanjangan di web.`,
      };
    }
  }

  // CEK HWID & ROBLOX USER (Default 1 HWID Slot)
  const maxHwid = keyItem.maxHwid || 1;
  const currentHwids = keyItem.hwids || [];
  const currentUsers = keyItem.robloxUsers || [];

  if (params.hwid && !currentHwids.includes(params.hwid)) {
    if (currentHwids.length >= maxHwid) {
      return {
        valid: false,
        success: false,
        hwidLimitReached: true,
        error: `Batas perangkat tercapai (${currentHwids.length}/${maxHwid} HWID). Key ini hanya boleh dijalankan di ${maxHwid} perangkat Roblox. Beli tambahan slot HWID di portal key system.`,
      };
    }

    // Daftarkan HWID baru
    currentHwids.push(params.hwid);
    currentUsers.push({
      hwid: params.hwid,
      username: params.robloxUsername || 'Roblox Player',
      registeredAt: new Date().toISOString(),
    });

    keyItem.hwids = currentHwids;
    keyItem.robloxUsers = currentUsers;
    await saveTokoScriptKeys(keys);
  }

  return {
    valid: true,
    success: true,
    keyData: keyItem,
  };
};
