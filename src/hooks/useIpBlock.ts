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
    loading: true,
    blocked: false,
    reason: null,
    ip: null,
  });

  useEffect(() => {
    const checkIp = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-ip');
        if (error) {
          console.error('IP check error:', error);
          setState({ loading: false, blocked: false, reason: null, ip: null });
          return;
        }
        setState({
          loading: false,
          blocked: data?.blocked || false,
          reason: data?.reason || null,
          ip: data?.ip || null,
        });
      } catch {
        setState({ loading: false, blocked: false, reason: null, ip: null });
      }
    };
    checkIp();
  }, []);

  return state;
};
