export interface MediaAdItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  title?: string;
}

export interface ScriptPackage {
  id: string;
  name: string;      // e.g. "2 Minggu", "30 Hari", "90 Hari", "180 Hari", "Lifetime"
  days: number;      // e.g. 14, 30, 90, 180, 999999
  price: number;     // e.g. 25000, 45000, 100000, 180000, 350000
  is_active: boolean;
  description?: string;
}

export interface TokoScriptProduct {
  id: string;
  rawId?: string;                 // Custom identifier/slug for /api/public/raw/:id endpoint (defaults to id)
  luaScript?: string;             // Raw executable Lua script entered by developer ("script langsung jalan")
  title: string;
  description: string;
  media: MediaAdItem[];
  packages: ScriptPackage[];
  resellerCommissionPct: number; // e.g. 20 (percent)
  isActive: boolean;
  isMaintenance?: boolean;        // Kunci maintenance per-produk
  maintenanceNotice?: string;     // Pesan perbaikan maintenance
  maintenanceStartedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResellerPayoutMethod = 'QRIS' | 'DANA' | 'SEABANK';

export interface ResellerAccount {
  id: string;
  username: string;
  password: string; // stored for reseller portal
  phone: string;    // WhatsApp/HP untuk koordinasi
  email?: string;   // Deprecated / tidak digunakan
  name?: string;    // Deprecated / tidak digunakan
  referralCode?: string; // Deprecated / tidak ada referral
  payoutMethod: ResellerPayoutMethod; // Wajib QRIS, DANA, atau SEABANK (QRIS diutamakan)
  payoutAccountNumber: string; // Nomor DANA, No Rekening SeaBank, atau Link Gambar/String QRIS
  payoutAccountName: string;   // Nama pemilik akun atau nama QRIS
  payoutQrisUrl?: string;      // URL gambar QRIS jika ada
  commissionPct: number;       // Persentase komisi bagi hasil diatur saat pembuatan akun (misal 20%)
  commissionScope: 'toko_script' | 'arexans_tools' | 'both'; // Produk yang dapat komisi
  registeredVia: 'manual_developer' | 'pakasir_purchase';
  activationPaymentTxId?: string;
  totalSalesCount: number;
  totalSalesAmount: number;
  activeCommission: number; // komisi bagi hasil saat ini yang belum ditarik
  totalWithdrawnCommission: number; // akumulasi komisi yang sudah ditarik
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResellerSale {
  id: string;
  resellerId: string;
  resellerCode?: string;
  resellerUsername?: string;
  productId: string;
  productTitle: string;
  packageName: string;
  packageDays: number;
  salePrice: number;
  commissionAmount: number;
  commissionPct: number;
  buyerKey: string;
  transactionId?: string;
  status: 'paid' | 'pending';
  createdAt: string;
}

export interface CommissionWithdrawal {
  id: string;
  resellerId: string;
  resellerName?: string;
  resellerUsername?: string;
  resellerCode?: string;
  amount: number;
  payoutMethod: ResellerPayoutMethod | string;
  accountNumber: string;
  accountName: string;
  notes?: string;
  status: 'pending' | 'completed' | 'rejected';
  requestedAt: string;
  completedAt?: string;
}

export interface ResellerGlobalSettings {
  autoRegistrationPrice: number; // 80000
  defaultCommissionPct: number;  // Default persentase komisi bagi hasil akun baru
  defaultScope: 'toko_script' | 'arexans_tools' | 'both';
  isAutoRegistrationActive: boolean;
}

