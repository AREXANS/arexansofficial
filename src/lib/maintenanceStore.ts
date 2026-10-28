import { supabase } from '@/integrations/supabase/client';
import { freezeTokoScriptKeys, unfreezeTokoScriptKeys } from './tokoScriptKeyStore';

export interface MaintenanceState {
  globalMaintenance: boolean;       // Kunci semua produk (Semuanya)
  arexansToolsMaintenance: boolean; // Kunci Arexans Tools
  tokoScriptsMaintenance: boolean;  // Kunci semua Toko Script
  maintenanceReason?: string;
  updatedAt?: string;
}

const STORAGE_MAINTENANCE_KEY = 'arexans_product_maintenance_state';
const DEV_TESTING_BYPASS_KEY = 'arexans_dev_testing_bypass';

export const DEFAULT_MAINTENANCE_STATE: MaintenanceState = {
  globalMaintenance: false,
  arexansToolsMaintenance: false,
  tokoScriptsMaintenance: false,
  maintenanceReason: 'Sistem sedang dalam perbaikan dan pemeliharaan rutin.',
};

/**
 * Check if the current user/client has developer testing bypass enabled.
 * True if admin is logged in or dev testing bypass is specifically turned on.
 */
export const isDeveloperTesting = (): boolean => {
  try {
    const adminLoggedIn = localStorage.getItem('admin_logged_in') === 'true';
    const bypassActive = localStorage.getItem(DEV_TESTING_BYPASS_KEY) === 'true';
    return adminLoggedIn || bypassActive;
  } catch {
    return false;
  }
};

export const setDeveloperTestingBypass = (enabled: boolean): void => {
  try {
    if (enabled) {
      localStorage.setItem(DEV_TESTING_BYPASS_KEY, 'true');
    } else {
      localStorage.removeItem(DEV_TESTING_BYPASS_KEY);
    }
    window.dispatchEvent(new CustomEvent('dev_testing_bypass_changed', { detail: enabled }));
  } catch (e) {
    console.error(e);
  }
};

/**
 * Reliable app_settings upsert helper
 */
const safeSaveSetting = async (key: string, value: string, desc?: string) => {
  try {
    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert(
        { key, value, description: desc || null, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (upsertError) {
      console.warn(`[MaintenanceStore] Upsert error for ${key}:`, upsertError);
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
          .insert({ key, value, description: desc || null });
      }
    }
  } catch (err) {
    console.warn(`[MaintenanceStore] Error persisting setting ${key}:`, err);
  }
};

/**
 * Get current maintenance state from PostgreSQL database (Realtime)
 */
export const getMaintenanceState = async (): Promise<MaintenanceState> => {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'product_maintenance_state')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      return { ...DEFAULT_MAINTENANCE_STATE, ...parsed };
    }
  } catch (err) {
    console.warn('[MaintenanceStore] Failed to fetch state from DB:', err);
  }

  return DEFAULT_MAINTENANCE_STATE;
};

/**
 * Save maintenance state to PostgreSQL DB with immediate propagation
 */
export const saveMaintenanceState = async (state: MaintenanceState): Promise<void> => {
  const json = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
  try {
    window.dispatchEvent(new CustomEvent('maintenance_state_changed', { detail: state }));
  } catch {}

  // Persist product_maintenance_state in DB
  await safeSaveSetting('product_maintenance_state', json, 'Product maintenance control state');

  // Sync maintenance_mode: true ONLY if global maintenance is ON (so partial tools maintenance does not block entire site)
  await safeSaveSetting('maintenance_mode', state.globalMaintenance ? 'true' : 'false', 'Global maintenance flag');
};

/**
 * Bekukan (Freeze) Key pembeli secara aman:
 * Menyimpan sisa waktu aktif dalam milidetik (frozenRemainingMs) dan mencatat waktu pembekuan (frozenUntil).
 * Durasi key TIDAK AKAN BERKURANG selama masa maintenance!
 */
export const freezeProductKeys = async (
  scope: 'all' | 'arexans_tools' | 'toko_script' = 'all'
): Promise<{ success: boolean; count: number; message: string }> => {
  let totalFrozen = 0;

  // 1. Freeze Toko Script Keys if scope includes toko_script
  if (scope === 'all' || scope === 'toko_script') {
    try {
      const tokoRes = await freezeTokoScriptKeys('all');
      totalFrozen += tokoRes.count;
    } catch (e) {
      console.warn('[MaintenanceStore] Error freezing toko script keys:', e);
    }
  }

  // 2. Freeze Arexans Tools keys if scope includes arexans_tools
  if (scope === 'all' || scope === 'arexans_tools') {
    try {
      const { data: settingData, error: fetchErr } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'license_keys')
        .maybeSingle();

      if (!fetchErr && settingData?.value) {
        let keys: any[] = [];
        try {
          keys = JSON.parse(settingData.value);
        } catch {}

        const now = new Date();
        let frozenCount = 0;

        const updatedKeys = keys.map((keyItem) => {
          const role = (keyItem.role || '').toLowerCase();
          const isPermanent = role === 'admin' || role === 'developer';
          if (isPermanent) return keyItem;

          // If already frozen, keep current state
          if (keyItem.frozenUntil) return keyItem;

          const expiredDate = new Date(keyItem.expired);
          const remainingMs = expiredDate.getTime() - now.getTime();

          // Only freeze keys that are not already expired
          if (remainingMs > 0) {
            frozenCount++;
            return {
              ...keyItem,
              frozenUntil: now.toISOString(),
              frozenRemainingMs: remainingMs,
            };
          }

          return keyItem;
        });

        if (frozenCount > 0) {
          totalFrozen += frozenCount;
          await supabase
            .from('app_settings')
            .update({
              value: JSON.stringify(updatedKeys),
              updated_at: now.toISOString(),
            })
            .eq('key', 'license_keys');
        }
      }
    } catch (err: any) {
      console.warn('[MaintenanceStore] Error freezing Arexans keys:', err);
    }
  }

  return {
    success: true,
    count: totalFrozen,
    message: `${totalFrozen} key berhasil dibekukan sementara. Sisa durasi key pembeli aman dan tidak akan berkurang.`,
  };
};

/**
 * Lanjutkan (Unfreeze / Resume) Key setelah maintenance selesai:
 * Menambahkan sisa durasi (frozenRemainingMs) secara utuh ke waktu sekarang,
 * sehingga durasi pembeli diperpanjang dan TIDAK ADA YANG RUGI!
 */
export const unfreezeProductKeys = async (
  scope: 'all' | 'arexans_tools' | 'toko_script' = 'all'
): Promise<{ success: boolean; count: number; message: string }> => {
  let totalUnfrozen = 0;

  // 1. Unfreeze Toko Script Keys if scope includes toko_script
  if (scope === 'all' || scope === 'toko_script') {
    try {
      const tokoRes = await unfreezeTokoScriptKeys('all');
      totalUnfrozen += tokoRes.count;
    } catch (e) {
      console.warn('[MaintenanceStore] Error unfreezing toko script keys:', e);
    }
  }

  // 2. Unfreeze Arexans Tools keys if scope includes arexans_tools
  if (scope === 'all' || scope === 'arexans_tools') {
    try {
      const { data: settingData, error: fetchErr } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'license_keys')
        .maybeSingle();

      if (!fetchErr && settingData?.value) {
        let keys: any[] = [];
        try {
          keys = JSON.parse(settingData.value);
        } catch {}

        const now = new Date();
        let unfrozenCount = 0;

        const updatedKeys = keys.map((keyItem) => {
          if (keyItem.frozenUntil) {
            const remainingMs = keyItem.frozenRemainingMs || 0;
            const newExpiry = new Date(now.getTime() + remainingMs);
            unfrozenCount++;
            return {
              ...keyItem,
              expired: newExpiry.toISOString(),
              frozenUntil: null,
              frozenRemainingMs: null,
            };
          }

          return keyItem;
        });

        if (unfrozenCount > 0) {
          totalUnfrozen += unfrozenCount;
          await supabase
            .from('app_settings')
            .update({
              value: JSON.stringify(updatedKeys),
              updated_at: now.toISOString(),
            })
            .eq('key', 'license_keys');
        }
      }
    } catch (err: any) {
      console.warn('[MaintenanceStore] Error unfreezing Arexans keys:', err);
    }
  }

  return {
    success: true,
    count: totalUnfrozen,
    message: `${totalUnfrozen} key berhasil dilanjutkan kembali secara utuh. Masa aktif pembeli tidak berkurang sama sekali.`,
  };
};

