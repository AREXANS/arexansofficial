import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface IpBlockState {
  loading: boolean;
  blocked: boolean;
  reason: string | null;
  ip: string | null;
}

export const useIpBlock = () => {
  const [state, setState] = useState<IpBlockState>({
    loading: false,
    blocked: false,
    reason: null,
    ip: null,
  });

  useEffect(() => {
    let active = true;
    const checkIp = async () => {
      try {
        const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2500)
        );
        const result: any = await Promise.race([
          supabase.functions.invoke('check-ip'),
          timeoutPromise,
        ]);
        if (!active) return;
        if (result?.data?.blocked) {
          setState({
            loading: false,
            blocked: true,
            reason: result.data.reason || 'IP Anda telah diblokir.',
            ip: result.data.ip || null,
          });
        }
      } catch {
        // Silently allow access if network or timeout occurs
      }
    };
    checkIp();
    return () => { active = false; };
  }, []);

  return state;
};
