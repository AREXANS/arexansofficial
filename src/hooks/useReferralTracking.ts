import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getStoredReferral,
  setStoredReferral,
  clearStoredReferral,
  findResellerByCode,
  StoredReferral,
  ResellerAccount,
} from '@/lib/tokoScriptStore';
import { toast } from '@/hooks/use-toast';

export const useReferralTracking = () => {
  const [searchParams] = useSearchParams();
  const [referral, setReferral] = useState<StoredReferral | null>(() => getStoredReferral());
  const [resellerAccount, setResellerAccount] = useState<ResellerAccount | null>(null);

  useEffect(() => {
    const refCode = searchParams.get('ref') || searchParams.get('r') || searchParams.get('reseller');

    if (refCode && refCode.trim()) {
      const cleanCode = refCode.trim();
      findResellerByCode(cleanCode).then((acc) => {
        if (acc && acc.isActive) {
          const stored: StoredReferral = {
            code: acc.username,
            username: acc.username,
            name: acc.payoutAccountName || acc.username,
            timestamp: Date.now(),
          };
          setStoredReferral(acc.username, acc.username, acc.payoutAccountName || acc.username);
          setReferral(stored);
          setResellerAccount(acc);

          toast({
            title: 'Toko Afiliasi Terhubung',
            description: `Anda berbelanja melalui link mitra resmi @${acc.username}. Komisi otomatis dibagikan ke mitra.`,
          });
        }
      });
    } else {
      // Load existing stored referral account data
      const stored = getStoredReferral();
      if (stored) {
        findResellerByCode(stored.code).then((acc) => {
          if (acc && acc.isActive) {
            setResellerAccount(acc);
          } else {
            clearStoredReferral();
            setReferral(null);
          }
        });
      }
    }
  }, [searchParams]);

  const applyManualReferral = async (
    code: string
  ): Promise<{ success: boolean; message: string; reseller?: ResellerAccount }> => {
    if (!code || !code.trim()) {
      clearStoredReferral();
      setReferral(null);
      setResellerAccount(null);
      return { success: true, message: 'Kode referral dihapus.' };
    }

    const acc = await findResellerByCode(code.trim());
    if (!acc || !acc.isActive) {
      return {
        success: false,
        message: 'Kode reseller/mitra tidak ditemukan atau sudah tidak aktif.',
      };
    }

    setStoredReferral(acc.username, acc.username, acc.payoutAccountName || acc.username);
    setReferral({
      code: acc.username,
      username: acc.username,
      name: acc.payoutAccountName || acc.username,
      timestamp: Date.now(),
    });
    setResellerAccount(acc);

    return {
      success: true,
      message: `Berhasil terhubung dengan Reseller @${acc.username}!`,
      reseller: acc,
    };
  };

  const removeReferral = () => {
    clearStoredReferral();
    setReferral(null);
    setResellerAccount(null);
  };

  return {
    referral,
    resellerAccount,
    applyManualReferral,
    removeReferral,
  };
};
