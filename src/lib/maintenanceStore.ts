import { supabase } from '@/integrations/supabase/client';

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
  } catch (e) {
    console.error(e);
  }
};

/**
 * Get current maintenance state from Supabase or localStorage
 */
export const getMaintenanceState = async (): Promise<MaintenanceState> => {
  let localState = DEFAULT_MAINTENANCE_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_MAINTENANCE_KEY);
    if (raw) localState = { ...DEFAULT_MAINTENANCE_STATE, ...JSON.parse(raw) };
  } catch {}

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'product_maintenance_state')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      const merged = { ...DEFAULT_MAINTENANCE_STATE, ...parsed };
      localStorage.setItem(STORAGE_MAINTENANCE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('[MaintenanceStore] Failed to fetch state from Supabase:', err);
  }

  return localState;
};

/**
 * Save maintenance state to Supabase & localStorage
 */
export const saveMaintenanceState = async (state: MaintenanceState): Promise<void> => {
  const json = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
  try {
    localStorage.setItem(STORAGE_MAINTENANCE_KEY, json);
  } catch {}

  try {
    const { error: err1 } = await supabase.from('app_settings').upsert({
      key: 'product_maintenance_state',
      value: json,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (err1) console.error('[MaintenanceStore] Failed to save product_maintenance_state:', err1);

    // Sync maintenance_mode: true if global OR arexans tools is in maintenance
    const isToolsUnderMaintenance = Boolean(state.globalMaintenance || state.arexansToolsMaintenance);
    const { error: err2 } = await supabase.from('app_settings').upsert({
      key: 'maintenance_mode',
      value: isToolsUnderMaintenance ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (err2) console.error('[MaintenanceStore] Failed to save maintenance_mode:', err2);
  } catch (err) {
    console.error('[MaintenanceStore] Failed to save state to Supabase:', err);
  }
};

/**
 * Bekukan (Freeze) Key pembeli secara aman:
 * Menyimpan sisa waktu aktif dalam milidetik (frozenRemainingMs) dan mencatat waktu pembekuan (frozenUntil).
 * Durasi key TIDAK AKAN BERKURANG selama masa maintenance!
 */
export const freezeProductKeys = async (
  scope: 'all' | 'arexans_tools' | 'toko_script' = 'all'
): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const { data: settingData, error: fetchErr } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'license_keys')
      .maybeSingle();

    if (fetchErr || !settingData?.value) {
      return { success: false, count: 0, message: 'Data license_keys tidak ditemukan' };
    }

    let keys: any[] = [];
    try {
      keys = JSON.parse(settingData.value);
    } catch {
      return { success: false, count: 0, message: 'Format data key tidak valid' };
    }

    const now = new Date();
    let frozenCount = 0;

    const updatedKeys = keys.map((keyItem) => {
      // Filter by scope if needed
      const role = (keyItem.role || '').toLowerCase();
      const isPermanent = role === 'admin' || role === 'developer';
      if (isPermanent) return keyItem;

      if (scope === 'arexans_tools') {
        // Arexans Tools keys have roles normal, vip, or lifetime
        if (role !== 'normal' && role !== 'vip' && role !== 'lifetime') return keyItem;
      }

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
      await supabase
        .from('app_settings')
        .update({
          value: JSON.stringify(updatedKeys),
          updated_at: now.toISOString(),
        })
        .eq('key', 'license_keys');
    }

    return {
      success: true,
      count: frozenCount,
      message: `${frozenCount} key berhasil dibekukan sementara. Sisa durasi key pembeli aman dan tidak akan berkurang.`,
    };
  } catch (err: any) {
    console.error('[MaintenanceStore] Error freezing keys:', err);
    return { success: false, count: 0, message: err.message || 'Gagal membekukan key' };
  }
};

/**
 * Lanjutkan (Unfreeze / Resume) Key setelah maintenance selesai:
 * Menambahkan sisa durasi (frozenRemainingMs) secara utuh ke waktu sekarang,
 * sehingga durasi pembeli diperpanjang dan TIDAK ADA YANG RUGI!
 */
export const unfreezeProductKeys = async (
  scope: 'all' | 'arexans_tools' | 'toko_script' = 'all'
): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const { data: settingData, error: fetchErr } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'license_keys')
      .maybeSingle();

    if (fetchErr || !settingData?.value) {
      return { success: false, count: 0, message: 'Data license_keys tidak ditemukan' };
    }

    let keys: any[] = [];
    try {
      keys = JSON.parse(settingData.value);
    } catch {
      return { success: false, count: 0, message: 'Format data key tidak valid' };
    }

    const now = new Date();
    let unfrozenCount = 0;

    const updatedKeys = keys.map((keyItem) => {
      // Filter by scope if needed
      const role = (keyItem.role || '').toLowerCase();
      if (scope === 'arexans_tools') {
        if (role !== 'normal' && role !== 'vip' && role !== 'lifetime') return keyItem;
      }

      // Only unfreeze keys that are currently frozen
      if (keyItem.frozenUntil) {
        const remainingMs = keyItem.frozenRemainingMs || 0;
        // Extend expired by remainingMs starting from now
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
      await supabase
        .from('app_settings')
        .update({
          value: JSON.stringify(updatedKeys),
          updated_at: now.toISOString(),
        })
        .eq('key', 'license_keys');
    }

    return {
      success: true,
      count: unfrozenCount,
      message: `${unfrozenCount} key berhasil dilanjutkan kembali secara utuh. Masa aktif pembeli tidak berkurang sama sekali.`,
    };
  } catch (err: any) {
    console.error('[MaintenanceStore] Error unfreezing keys:', err);
    return { success: false, count: 0, message: err.message || 'Gagal melanjutkan key' };
  }
};
