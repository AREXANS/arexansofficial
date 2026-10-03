import { supabase } from '@/integrations/supabase/client';
import {
  TokoScriptProduct,
  ResellerAccount,
  ResellerSale,
  CommissionWithdrawal,
  ScriptPackage,
  ResellerGlobalSettings,
} from '@/types/tokoScript';

const STORAGE_SCRIPTS_KEY = 'arexans_toko_scripts_catalog';
const STORAGE_RESELLERS_KEY = 'arexans_reseller_accounts_v2';
const STORAGE_SALES_KEY = 'arexans_reseller_sales_v2';
const STORAGE_WITHDRAWALS_KEY = 'arexans_reseller_withdrawals_v2';
const STORAGE_GLOBAL_SETTINGS_KEY = 'arexans_reseller_global_settings_v2';
const CURRENT_RESELLER_KEY = 'arexans_current_reseller_session_v2';

// Default global settings untuk kemitraan reseller
export const DEFAULT_RESELLER_GLOBAL_SETTINGS: ResellerGlobalSettings = {
  autoRegistrationPrice: 80000,
  defaultCommissionPct: 20,
  defaultScope: 'both',
  isAutoRegistrationActive: true,
};

// Harga aktivasi reseller otomatis via Pakasir
export const RESELLER_REGISTRATION_PRICE = 80000;

// Default preset packages used when developer adds a new script
export const DEFAULT_SCRIPT_PACKAGES: ScriptPackage[] = [
  { id: 'pkg-2w', name: '2 Minggu', days: 14, price: 25000, is_active: true, description: 'Akses script selama 14 hari penuh' },
  { id: 'pkg-30d', name: '30 Hari', days: 30, price: 45000, is_active: true, description: 'Akses script selama 1 bulan' },
  { id: 'pkg-90d', name: '90 Hari', days: 90, price: 100000, is_active: true, description: 'Akses script selama 3 bulan (Hemat)' },
  { id: 'pkg-180d', name: '180 Hari', days: 180, price: 180000, is_active: true, description: 'Akses script selama 6 bulan (Populer)' },
  { id: 'pkg-lt', name: 'Lifetime', days: 999999, price: 350000, is_active: true, description: 'Akses permanen tanpa batas waktu' },
];

// Helper to save to Supabase app_settings
async function syncToSupabase(key: string, value: string) {
  try {
    await supabase.from('app_settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[TokoScriptStore] Failed to sync ${key} to Supabase:`, err);
  }
}

// -------------------------------------------------------------
// TOKO SCRIPT PRODUCTS
// -------------------------------------------------------------

export const getTokoScripts = async (): Promise<TokoScriptProduct[]> => {
  let localData: TokoScriptProduct[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_SCRIPTS_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'toko_scripts_catalog')
      .maybeSingle();

    if (data?.value) {
      const parsed: TokoScriptProduct[] = JSON.parse(data.value);
      localStorage.setItem(STORAGE_SCRIPTS_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.warn('[TokoScriptStore] Could not fetch scripts from Supabase, using local:', e);
  }

  return localData;
};

export const saveTokoScripts = async (scripts: TokoScriptProduct[]): Promise<void> => {
  const json = JSON.stringify(scripts);
  localStorage.setItem(STORAGE_SCRIPTS_KEY, json);
  await syncToSupabase('toko_scripts_catalog', json);
};

export const addTokoScript = async (product: Omit<TokoScriptProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<TokoScriptProduct> => {
  const list = await getTokoScripts();
  const newProduct: TokoScriptProduct = {
    ...product,
    id: 'script-' + Math.random().toString(36).slice(2, 9),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  list.unshift(newProduct);
  await saveTokoScripts(list);
  return newProduct;
};

export const updateTokoScript = async (id: string, updates: Partial<TokoScriptProduct>): Promise<TokoScriptProduct | null> => {
  const list = await getTokoScripts();
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveTokoScripts(list);
  return list[idx];
};

export const deleteTokoScript = async (id: string): Promise<boolean> => {
  const list = await getTokoScripts();
  const filtered = list.filter(p => p.id !== id);
  await saveTokoScripts(filtered);
  return true;
};

/**
 * Mendapatkan ID / slug public raw endpoint untuk suatu produk script
 */
export const getScriptRawId = (prod: TokoScriptProduct): string => {
  if (prod.rawId && prod.rawId.trim()) {
    return prod.rawId.trim();
  }
  return prod.id;
};

/**
 * Format resmi output loadstring yang diberikan kepada pembeli:
 * _G.Axstools = "keysystem"
 * loadstring(game:HttpGet("https://domain.com/api/public/raw/id?key=" .. _G.Axstools))()
 */
export const generateScriptLoaderCode = (
  key: string,
  scriptId: string,
  customDomain?: string
): string => {
  const domain = (
    customDomain ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://tools.arexans.my.id')
  ).replace(/\/+$/, '');

  const cleanKey = key || 'keysystem';
  const cleanId = scriptId || 'main';

  return `_G.Axstools = "${cleanKey}"\nloadstring(game:HttpGet("${domain}/api/public/raw/${cleanId}?key=" .. _G.Axstools))()`;
};

/**
 * Generator Lua Wrapper Proteksi Key & HWID Otomatis untuk Script Langsung Jalan:
 * - Default 1 HWID slot
 * - Mengecek _G.Axstools dan HWID RbxAnalyticsService
 * - Memanggil API validate-key
 * - Jika melebihi 1 slot HWID, memblokir dan mengarahkan untuk beli penambahan +1 slot HWID permanen
 * - Jika lolos, menjalankan script asli developer
 */
export const generateProtectedLuaWrapper = (
  rawScript: string,
  scriptTitle: string,
  scriptId: string,
  apiOrigin: string
): string => {
  const domain = apiOrigin.replace(/\/+$/, '');
  const title = scriptTitle || 'Script Axstools';

  return `-- [[ AXSTOOLS PROTECTED RUNTIME ]]
-- Title: ${title} (ID: ${scriptId})
-- Key System & HWID Protection Layer (Default 1 HWID Slot)

local KEY = _G.Axstools
if not KEY or KEY == "" then
    warn("[Axstools] ERROR: _G.Axstools belum didefinisikan! Harap masukkan key Anda:")
    warn('_G.Axstools = "KEY_ANDA"')
    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", {
            Title = "Axstools Key Missing",
            Text = "Silakan pasang: _G.Axstools = 'KEY_ANDA'",
            Duration = 8
        })
    end)
    return
end

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

local function getHwid()
    local ok, id = pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    if ok and id and tostring(id) ~= "" then return tostring(id) end
    return LocalPlayer and tostring(LocalPlayer.UserId) or "FALLBACK_HWID"
end

local HWID = getHwid()
local USERNAME = LocalPlayer and LocalPlayer.Name or "Unknown"

local function httpRequest(opts)
    local req = (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or request or http_request
    if req then
        local ok, res = pcall(req, opts)
        if ok and res then return res end
    end
    local ok, body = pcall(function() return game:HttpGet(opts.Url) end)
    if ok and body then return { StatusCode = 200, Body = body } end
    return nil
end

local VALIDATE_URL = "${domain}/api/validate-key"
local payload = HttpService:JSONEncode({
    key = KEY,
    hwid = HWID,
    robloxUsername = USERNAME
})

local res = httpRequest({
    Url = VALIDATE_URL,
    Method = "POST",
    Headers = {
        ["Content-Type"] = "application/json"
    },
    Body = payload
})

local isValid = false
local errorMsg = "Gagal menghubungi server verifikasi Axstools."
local hwidLimitReached = false
local isFrozen = false

if res and res.Body then
    local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if ok and type(data) == "table" then
        if data.valid or data.success then
            isValid = true
        else
            errorMsg = data.error or data.message or "Key tidak valid"
            if data.hwid_limit_reached or (data.error and string.find(string.lower(data.error), "maximum devices")) then
                hwidLimitReached = true
            end
            if data.frozen then
                isFrozen = true
            end
        end
    end
end

if not isValid then
    if hwidLimitReached then
        warn("[Axstools] HWID LIMIT REACHED! Kuota perangkat untuk key ini penuh (Default 1 HWID).")
        warn("[Axstools] Beli penambahan +1 slot HWID permanen di portal Key System:")
        warn("${domain}/key-system")
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools HWID Penuh!",
                Text = "Batas 1 HWID tercapai. Beli +1 slot HWID permanen di portal web!",
                Duration = 10
            })
        end)
    elseif isFrozen then
        warn("[Axstools] SCRIPT MAINTENANCE: Key Anda sedang dibekukan sementara agar sisa masa aktif tidak rugi.")
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools Maintenance",
                Text = "Script sedang maintenance. Key Anda dibekukan sementara (Anti-Rugi).",
                Duration = 10
            })
        end)
    else
        warn("[Axstools] VALIDASI GAGAL: " .. tostring(errorMsg))
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Axstools Akses Ditolak",
                Text = tostring(errorMsg),
                Duration = 8
            })
        end)
    end
    return
end

print("[Axstools] Key & HWID Valid! Menjalankan ${title}...")
pcall(function()
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Axstools Verified",
        Text = "${title} aktif. Selamat bermain!",
        Duration = 4
    })
end)

-- [[ SCRIPT LANGSUNG JALAN DARI DEVELOPER ]]
${rawScript}
`;
};

// -------------------------------------------------------------
// RESELLER GLOBAL SETTINGS
// -------------------------------------------------------------

export const getResellerGlobalSettings = async (): Promise<ResellerGlobalSettings> => {
  let localData = DEFAULT_RESELLER_GLOBAL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_GLOBAL_SETTINGS_KEY);
    if (raw) localData = { ...DEFAULT_RESELLER_GLOBAL_SETTINGS, ...JSON.parse(raw) };
  } catch {}

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'reseller_global_settings_v2')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      const merged = { ...DEFAULT_RESELLER_GLOBAL_SETTINGS, ...parsed };
      localStorage.setItem(STORAGE_GLOBAL_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.warn('[TokoScriptStore] Global settings fetch fallback:', e);
  }

  return localData;
};

export const saveResellerGlobalSettings = async (settings: ResellerGlobalSettings): Promise<void> => {
  const json = JSON.stringify(settings);
  localStorage.setItem(STORAGE_GLOBAL_SETTINGS_KEY, json);
  await syncToSupabase('reseller_global_settings_v2', json);
};

// -------------------------------------------------------------
// RESELLER ACCOUNTS (MURNI TANPA DATA DUMMY SIMULASI)
// -------------------------------------------------------------

export const getResellerAccounts = async (): Promise<ResellerAccount[]> => {
  let localData: ResellerAccount[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_RESELLERS_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {
    localData = [];
  }

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'reseller_accounts_data_v2')
      .maybeSingle();

    if (data?.value) {
      const parsed: ResellerAccount[] = JSON.parse(data.value);
      localStorage.setItem(STORAGE_RESELLERS_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.warn('[TokoScriptStore] Reseller fetch fallback:', e);
  }

  return localData;
};

export const saveResellerAccounts = async (accounts: ResellerAccount[]): Promise<void> => {
  const json = JSON.stringify(accounts);
  localStorage.setItem(STORAGE_RESELLERS_KEY, json);
  await syncToSupabase('reseller_accounts_data_v2', json);
};

/**
 * Pembuatan Akun Reseller Manual oleh Developer di /developer
 * Komisi dan Scope (Toko Script, Arexans Tools, atau Keduanya) diatur saat pembuatan akun
 */
export const developerCreateReseller = async (data: {
  username: string;
  password: string;
  phone: string;
  payoutMethod: ResellerPayoutMethod | string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  payoutQrisUrl?: string;
  commissionPct: number;
  commissionScope: 'toko_script' | 'arexans_tools' | 'both';
  name?: string;
  email?: string;
}): Promise<{ success: boolean; message?: string; account?: ResellerAccount }> => {
  const accounts = await getResellerAccounts();

  const usernameClean = data.username.trim().toLowerCase();

  if (accounts.some(a => a.username.toLowerCase() === usernameClean)) {
    return { success: false, message: 'Username sudah digunakan oleh reseller lain.' };
  }

  // Ensure payout method is one of QRIS, DANA, or SEABANK
  const validMethods = ['QRIS', 'DANA', 'SEABANK'];
  const methodClean = validMethods.includes(data.payoutMethod?.toUpperCase())
    ? (data.payoutMethod.toUpperCase() as ResellerPayoutMethod)
    : 'QRIS';

  const newAccount: ResellerAccount = {
    id: 'reseller-' + Math.random().toString(36).slice(2, 9),
    username: usernameClean,
    password: data.password,
    phone: data.phone.trim(),
    payoutMethod: methodClean,
    payoutAccountNumber: data.payoutAccountNumber.trim(),
    payoutAccountName: data.payoutAccountName.trim() || usernameClean,
    payoutQrisUrl: data.payoutQrisUrl?.trim(),
    commissionPct: Math.max(1, Math.min(100, Number(data.commissionPct) || 20)),
    commissionScope: data.commissionScope || 'both',
    registeredVia: 'manual_developer',
    totalSalesCount: 0,
    totalSalesAmount: 0,
    activeCommission: 0,
    totalWithdrawnCommission: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  accounts.unshift(newAccount);
  await saveResellerAccounts(accounts);

  return { success: true, account: newAccount };
};

export const developerUpdateReseller = async (
  id: string,
  updates: Partial<ResellerAccount>
): Promise<{ success: boolean; message?: string; account?: ResellerAccount }> => {
  const accounts = await getResellerAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return { success: false, message: 'Akun reseller tidak ditemukan.' };

  // Catatan instruksi: "atur komisi nya saat pembuatan akun saja"
  // Maka commissionPct yang tersimpan tidak dioverwrite oleh update sembarangan
  const { commissionPct: _ignoredCommission, ...allowedUpdates } = updates;

  accounts[idx] = {
    ...accounts[idx],
    ...allowedUpdates,
    updatedAt: new Date().toISOString(),
  };

  await saveResellerAccounts(accounts);

  // If updated reseller is current session, sync it
  const session = getCurrentResellerSession();
  if (session && session.id === id) {
    setCurrentResellerSession(accounts[idx]);
  }

  return { success: true, account: accounts[idx] };
};

export const developerDeleteReseller = async (id: string): Promise<boolean> => {
  const accounts = await getResellerAccounts();
  const filtered = accounts.filter(a => a.id !== id);
  await saveResellerAccounts(filtered);
  const session = getCurrentResellerSession();
  if (session && session.id === id) {
    logoutReseller();
  }
  return true;
};

/**
 * Pembuatan Akun Otomatis Seharga Rp 80.000 dengan Pembayaran Pakasir
 * Wajib payment reseller hanya QRIS / DANA / SEABANK (QRIS diutamakan)
 * Tanpa email, nama lengkap, atau referral
 */
export const createPakasirResellerOrder = async (accountData: {
  username: string;
  phone: string;
  password: string;
  payoutMethod: ResellerPayoutMethod | string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  payoutQrisUrl?: string;
  name?: string;
  email?: string;
  referralCode?: string;
  commissionPct?: number;
  commissionScope?: 'toko_script' | 'arexans_tools' | 'both';
}): Promise<{
  success: boolean;
  message?: string;
  transactionId?: string;
  qr_string?: string;
  qris_url?: string;
  totalAmount?: number;
  expiresAt?: string;
}> => {
  const accounts = await getResellerAccounts();
  const usernameClean = accountData.username.trim().toLowerCase();

  if (accounts.some(a => a.username.toLowerCase() === usernameClean)) {
    return { success: false, message: 'Username sudah digunakan. Silakan gunakan username lain.' };
  }

  const orderId = `RSL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const amount = RESELLER_REGISTRATION_PRICE; // 80.000
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const deviceId = localStorage.getItem('arexans_device_id') || `DEV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  let qrString = `00020101021226670014ID.LINKAJA.WWW01189360091438927000000215${orderId}51440014ID.CO.QRIS.WWW0215ID102002100000052045812530336054${amount}5802ID5912AREXANSTOOLS6007JAKARTA61051011062200116${orderId}6304`;
  let qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}`;

  // Invoke edge function create-payment with gateway 'pakasir'
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-payment', {
      body: {
        amount,
        customerName: `Pendaftaran Reseller (@${usernameClean})`,
        customerWhatsapp: accountData.phone,
        packageName: 'RESELLER_ACTIVATION',
        packageDuration: 999999,
        deviceId,
        gateway: 'pakasir',
      },
    });

    if (!edgeError && edgeData?.qr_string) {
      qrString = edgeData.qr_string;
      qrisUrl = edgeData.qris_url || qrisUrl;
    }
  } catch (err) {
    console.warn('Edge function invoke fallback for reseller registration:', err);
  }

  // Record transaction in transactions table
  try {
    await supabase.from('transactions').insert({
      transaction_id: orderId,
      customer_name: `Beli Akun Reseller: @${usernameClean}`,
      customer_whatsapp: accountData.phone,
      package_name: 'RESELLER_PRO_80K',
      package_duration: 999999,
      original_amount: amount,
      total_amount: amount,
      status: 'pending',
      qr_string: qrString,
      device_id: deviceId,
      expires_at: expiresAt,
    });
  } catch (dbErr) {
    console.warn('Could not insert to transactions table:', dbErr);
  }

  // Store temporary pending registration data in localStorage
  localStorage.setItem(`pending_reseller_${orderId}`, JSON.stringify({
    ...accountData,
    orderId,
    amount,
    createdAt: new Date().toISOString(),
  }));

  return {
    success: true,
    transactionId: orderId,
    qr_string: qrString,
    qris_url: qrisUrl,
    totalAmount: amount,
    expiresAt,
  };
};

/**
 * Aktivasi akun reseller setelah pembayaran Pakasir 80.000 terverifikasi
 */
export const activatePaidResellerAccount = async (
  transactionId: string
): Promise<{ success: boolean; message: string; account?: ResellerAccount }> => {
  const raw = localStorage.getItem(`pending_reseller_${transactionId}`);
  if (!raw) {
    return { success: false, message: 'Data pendaftaran tidak ditemukan atau sudah kadaluarsa.' };
  }

  const pendingData = JSON.parse(raw);
  const [accounts, globalSettings] = await Promise.all([
    getResellerAccounts(),
    getResellerGlobalSettings(),
  ]);

  // If already activated, return it
  const existing = accounts.find(a => a.activationPaymentTxId === transactionId || a.username.toLowerCase() === pendingData.username.toLowerCase());
  if (existing) {
    setCurrentResellerSession(existing);
    return { success: true, message: 'Akun reseller sudah aktif!', account: existing };
  }

  // Clean payout method
  const validMethods = ['QRIS', 'DANA', 'SEABANK'];
  const payoutMethodClean = validMethods.includes(pendingData.payoutMethod?.toUpperCase())
    ? (pendingData.payoutMethod.toUpperCase() as ResellerPayoutMethod)
    : 'QRIS';

  const newAccount: ResellerAccount = {
    id: 'reseller-' + Math.random().toString(36).slice(2, 9),
    username: pendingData.username.toLowerCase().trim(),
    password: pendingData.password,
    phone: pendingData.phone.trim(),
    payoutMethod: payoutMethodClean,
    payoutAccountNumber: pendingData.payoutAccountNumber.trim(),
    payoutAccountName: pendingData.payoutAccountName.trim() || pendingData.username.trim(),
    payoutQrisUrl: pendingData.payoutQrisUrl?.trim(),
    // Komisi diatur saat pembuatan akun saja (dari setting developer pendaftaran otomatis)
    commissionPct: globalSettings.defaultCommissionPct || 20,
    commissionScope: globalSettings.defaultScope || 'both',
    registeredVia: 'pakasir_purchase',
    activationPaymentTxId: transactionId,
    totalSalesCount: 0,
    totalSalesAmount: 0,
    activeCommission: 0,
    totalWithdrawnCommission: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  accounts.unshift(newAccount);
  await saveResellerAccounts(accounts);
  setCurrentResellerSession(newAccount);
  localStorage.removeItem(`pending_reseller_${transactionId}`);

  return {
    success: true,
    message: `Pembayaran Rp 80.000 berhasil! Akun reseller @${newAccount.username} telah aktif. Selamat bergabung!`,
    account: newAccount,
  };
};

export const loginReseller = async (
  identifier: string,
  password: string
): Promise<{ success: boolean; message?: string; account?: ResellerAccount }> => {
  const accounts = await getResellerAccounts();
  const idClean = identifier.trim().toLowerCase();

  const found = accounts.find(
    a => (a.username.toLowerCase() === idClean || a.email.toLowerCase() === idClean) && a.password === password
  );

  if (!found) {
    return { success: false, message: 'Username/Email atau Password salah.' };
  }
  if (!found.isActive) {
    return { success: false, message: 'Akun reseller ini sedang dinonaktifkan oleh developer.' };
  }

  setCurrentResellerSession(found);
  return { success: true, account: found };
};

export const getCurrentResellerSession = (): ResellerAccount | null => {
  try {
    const raw = localStorage.getItem(CURRENT_RESELLER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCurrentResellerSession = (account: ResellerAccount | null): void => {
  if (account) {
    localStorage.setItem(CURRENT_RESELLER_KEY, JSON.stringify(account));
  } else {
    localStorage.removeItem(CURRENT_RESELLER_KEY);
  }
};

export const logoutReseller = (): void => {
  setCurrentResellerSession(null);
};

export const findResellerByCode = async (code: string): Promise<ResellerAccount | null> => {
  if (!code) return null;
  const accounts = await getResellerAccounts();
  return accounts.find(a => a.referralCode.toUpperCase() === code.trim().toUpperCase() && a.isActive) || null;
};

// -------------------------------------------------------------
// RESELLER SALES & COMMISSION SHARING (MURNI TANPA DATA DUMMY)
// -------------------------------------------------------------

export const getResellerSales = async (resellerId?: string): Promise<ResellerSale[]> => {
  let localData: ResellerSale[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_SALES_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {
    localData = [];
  }

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'reseller_sales_data_v2')
      .maybeSingle();

    if (data?.value) {
      const parsed: ResellerSale[] = JSON.parse(data.value);
      localStorage.setItem(STORAGE_SALES_KEY, JSON.stringify(parsed));
      localData = parsed;
    }
  } catch (e) {
    console.warn('[TokoScriptStore] Reseller sales fetch fallback:', e);
  }

  if (resellerId) {
    return localData.filter(s => s.resellerId === resellerId);
  }
  return localData;
};

export const saveResellerSales = async (sales: ResellerSale[]): Promise<void> => {
  const json = JSON.stringify(sales);
  localStorage.setItem(STORAGE_SALES_KEY, json);
  await syncToSupabase('reseller_sales_data_v2', json);
};

/**
 * Record a sale made using a reseller's referral code.
 * Checks productSource ('toko_script' atau 'arexans_tools') against reseller's commissionScope!
 * Commission % is taken from reseller.commissionPct (set at account creation).
 */
export const recordResellerSale = async (params: {
  resellerCode: string;
  productSource: 'toko_script' | 'arexans_tools';
  productId: string;
  productTitle: string;
  packageName: string;
  packageDays: number;
  salePrice: number;
  buyerKey: string;
  transactionId?: string;
}): Promise<ResellerSale | null> => {
  const reseller = await findResellerByCode(params.resellerCode);
  if (!reseller) return null;

  // Cek apakah produk sesuai dengan setting produk diskon/komisi reseller
  const scope = reseller.commissionScope || 'both';
  if (scope !== 'both' && scope !== params.productSource) {
    console.log(`[ResellerSale] Product source ${params.productSource} not in reseller scope ${scope}. No commission given.`);
    return null;
  }

  // Komisi diatur saat pembuatan akun reseller
  const commissionPct = reseller.commissionPct || 20;
  const commissionAmount = Math.round((params.salePrice * commissionPct) / 100);

  const newSale: ResellerSale = {
    id: 'sale-' + Math.random().toString(36).slice(2, 9),
    resellerId: reseller.id,
    resellerCode: reseller.referralCode,
    productId: params.productId,
    productTitle: params.productTitle,
    packageName: params.packageName,
    packageDays: params.packageDays,
    salePrice: params.salePrice,
    commissionAmount,
    commissionPct,
    buyerKey: params.buyerKey,
    transactionId: params.transactionId,
    status: 'paid',
    createdAt: new Date().toISOString(),
  };

  // 1. Save sale
  const sales = await getResellerSales();
  sales.unshift(newSale);
  await saveResellerSales(sales);

  // 2. Update reseller active commission & total sales
  const accounts = await getResellerAccounts();
  const accIdx = accounts.findIndex(a => a.id === reseller.id);
  if (accIdx !== -1) {
    accounts[accIdx].totalSalesCount += 1;
    accounts[accIdx].totalSalesAmount += params.salePrice;
    accounts[accIdx].activeCommission += commissionAmount;
    accounts[accIdx].updatedAt = new Date().toISOString();
    await saveResellerAccounts(accounts);

    // Update session if currently logged in
    const currentSession = getCurrentResellerSession();
    if (currentSession && currentSession.id === reseller.id) {
      setCurrentResellerSession(accounts[accIdx]);
    }
  }

  return newSale;
};

// -------------------------------------------------------------
// COMMISSION WITHDRAWALS & RESET (MURNI TANPA DATA DUMMY)
// -------------------------------------------------------------

export const getCommissionWithdrawals = async (resellerId?: string): Promise<CommissionWithdrawal[]> => {
  let localData: CommissionWithdrawal[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_WITHDRAWALS_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {
    localData = [];
  }

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'reseller_withdrawals_data_v2')
      .maybeSingle();

    if (data?.value) {
      const parsed: CommissionWithdrawal[] = JSON.parse(data.value);
      localStorage.setItem(STORAGE_WITHDRAWALS_KEY, JSON.stringify(parsed));
      localData = parsed;
    }
  } catch (e) {
    console.warn('[TokoScriptStore] Withdrawals fetch fallback:', e);
  }

  if (resellerId) {
    return localData.filter(w => w.resellerId === resellerId);
  }
  return localData;
};

export const saveCommissionWithdrawals = async (withdrawals: CommissionWithdrawal[]): Promise<void> => {
  const json = JSON.stringify(withdrawals);
  localStorage.setItem(STORAGE_WITHDRAWALS_KEY, json);
  await syncToSupabase('reseller_withdrawals_data_v2', json);
};

/**
 * Pengambilan Komisi Bagi Hasil dengan Developer:
 * Sesuai instruksi: "setiap pengambilan komisi bagi hasil dengan developer jika berhasil maka jumlah di reset ulang. supaya reseller bisa bantu jualan produknya"
 */
export const requestCommissionPayout = async (params: {
  resellerId: string;
  amount?: number;
  payoutMethod: string;
  accountNumber: string;
  accountName: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; withdrawal?: CommissionWithdrawal; updatedAccount?: ResellerAccount }> => {
  const accounts = await getResellerAccounts();
  const accIdx = accounts.findIndex(a => a.id === params.resellerId);
  if (accIdx === -1) {
    return { success: false, message: 'Akun reseller tidak ditemukan.' };
  }

  const account = accounts[accIdx];
  const withdrawAmount = params.amount !== undefined && params.amount > 0 ? params.amount : account.activeCommission;

  if (withdrawAmount <= 0) {
    return { success: false, message: 'Tidak ada saldo komisi yang bisa ditarik (Saldo: Rp 0).' };
  }

  if (withdrawAmount > account.activeCommission) {
    return { success: false, message: `Nominal penarikan melebihi saldo komisi aktif (Maksimal: Rp ${account.activeCommission.toLocaleString('id-ID')}).` };
  }

  const newWithdrawal: CommissionWithdrawal = {
    id: 'wd-' + Math.random().toString(36).slice(2, 9),
    resellerId: account.id,
    resellerName: account.name,
    resellerCode: account.referralCode,
    amount: withdrawAmount,
    payoutMethod: params.payoutMethod || account.payoutMethod,
    accountNumber: params.accountNumber || account.payoutAccountNumber,
    accountName: params.accountName || account.payoutAccountName,
    notes: params.notes || 'Penarikan komisi bagi hasil oleh reseller',
    status: 'completed', // Berhasil & direset ulang
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  // 1. Reset saldo komisi aktif!
  account.activeCommission = Math.max(0, account.activeCommission - withdrawAmount);
  account.totalWithdrawnCommission += withdrawAmount;
  account.updatedAt = new Date().toISOString();

  await saveResellerAccounts(accounts);

  // 2. Save withdrawal record
  const withdrawals = await getCommissionWithdrawals();
  withdrawals.unshift(newWithdrawal);
  await saveCommissionWithdrawals(withdrawals);

  // 3. Update active session
  setCurrentResellerSession(account);

  return {
    success: true,
    message: `Pengambilan komisi sebesar Rp ${withdrawAmount.toLocaleString('id-ID')} berhasil! Jumlah komisi Anda telah direset ulang ke Rp ${account.activeCommission.toLocaleString('id-ID')}. Developer akan mentransfer ke ${newWithdrawal.payoutMethod} (${newWithdrawal.accountNumber}).`,
    withdrawal: newWithdrawal,
    updatedAccount: account,
  };
};

/**
 * Developer manual reset or payout action for any reseller
 */
export const developerResetResellerCommission = async (
  resellerId: string,
  reason: string = 'Reset komisi oleh developer (telah ditransfer/dibayar)'
): Promise<{ success: boolean; message: string }> => {
  const accounts = await getResellerAccounts();
  const accIdx = accounts.findIndex(a => a.id === resellerId);
  if (accIdx === -1) {
    return { success: false, message: 'Reseller tidak ditemukan.' };
  }

  const account = accounts[accIdx];
  const amountToReset = account.activeCommission;

  if (amountToReset <= 0) {
    return { success: false, message: 'Saldo komisi reseller ini sudah Rp 0.' };
  }

  const newWithdrawal: CommissionWithdrawal = {
    id: 'wd-' + Math.random().toString(36).slice(2, 9),
    resellerId: account.id,
    resellerName: account.name,
    resellerCode: account.referralCode,
    amount: amountToReset,
    payoutMethod: account.payoutMethod || 'Transfer Manual',
    accountNumber: account.payoutAccountNumber || '-',
    accountName: account.payoutAccountName || account.name,
    notes: reason,
    status: 'completed',
    requestedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  account.totalWithdrawnCommission += amountToReset;
  account.activeCommission = 0; // RESET ULANG KE 0
  account.updatedAt = new Date().toISOString();

  await saveResellerAccounts(accounts);

  const withdrawals = await getCommissionWithdrawals();
  withdrawals.unshift(newWithdrawal);
  await saveCommissionWithdrawals(withdrawals);

  return {
    success: true,
    message: `Komisi reseller ${account.name} sebesar Rp ${amountToReset.toLocaleString('id-ID')} berhasil di-reset ulang ke Rp 0 dan dicatat ke riwayat penarikan.`,
  };
};

/**
 * Pengosongan Catatan Log Simulasi / Reset Log Murni:
 * Sesuai instruksi: "perbaiki reseller ga ada catatan log simulasi dikosongkan."
 * Mengosongkan semua riwayat penjualan & penarikan sehingga bersih tanpa log dummy/simulasi.
 */
export const clearAllResellerLogs = async (
  resellerId?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    if (resellerId) {
      // Clear logs khusus untuk reseller tertentu
      const allSales = await getResellerSales();
      const remainingSales = allSales.filter(s => s.resellerId !== resellerId);
      await saveResellerSales(remainingSales);

      const allWd = await getCommissionWithdrawals();
      const remainingWd = allWd.filter(w => w.resellerId !== resellerId);
      await saveCommissionWithdrawals(remainingWd);

      // Reset counter angka reseller ke 0
      const accounts = await getResellerAccounts();
      const idx = accounts.findIndex(a => a.id === resellerId);
      if (idx !== -1) {
        accounts[idx].totalSalesCount = 0;
        accounts[idx].totalSalesAmount = 0;
        accounts[idx].activeCommission = 0;
        accounts[idx].totalWithdrawnCommission = 0;
        await saveResellerAccounts(accounts);
        const session = getCurrentResellerSession();
        if (session && session.id === resellerId) {
          setCurrentResellerSession(accounts[idx]);
        }
      }
      return { success: true, message: 'Log catatan transaksi reseller ini berhasil dikosongkan.' };
    } else {
      // Clear logs secara menyeluruh
      localStorage.removeItem(STORAGE_SALES_KEY);
      localStorage.removeItem(STORAGE_WITHDRAWALS_KEY);
      await syncToSupabase('reseller_sales_data_v2', '[]');
      await syncToSupabase('reseller_withdrawals_data_v2', '[]');

      // Reset counters semua akun reseller
      const accounts = await getResellerAccounts();
      const cleaned = accounts.map(a => ({
        ...a,
        totalSalesCount: 0,
        totalSalesAmount: 0,
        activeCommission: 0,
        totalWithdrawnCommission: 0,
      }));
      await saveResellerAccounts(cleaned);
      const session = getCurrentResellerSession();
      if (session) {
        const found = cleaned.find(c => c.id === session.id);
        if (found) setCurrentResellerSession(found);
      }
      return { success: true, message: 'Semua log simulasi dan riwayat transaksi reseller berhasil dikosongkan total.' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengosongkan log' };
  }
};

/**
 * Cek kelayakan diskon produk untuk pembeli berdasarkan kode referral reseller:
 * Sesuai instruksi: "bisa settings produk yang diskon reseler toko script atau arexanstools atau keduanya"
 */
export const checkResellerDiscountEligibility = async (
  _code: string,
  _productType: 'toko_script' | 'arexans_tools'
): Promise<{
  eligible: boolean;
  discountPct: number;
  reseller: ResellerAccount | null;
  message?: string;
}> => {
  // Sesuai brief: Reseller tidak ada referral ataupun potongan pembeli
  return {
    eligible: false,
    discountPct: 0,
    reseller: null,
    message: 'Tidak ada potongan diskon pembeli untuk reseller',
  };
};

