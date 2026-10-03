import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Background {
  id: string;
  title: string;
  background_type: string;
  background_url: string;
  is_active: boolean;
  is_muted: boolean;
}

interface BackgroundContextType {
  activeBackgrounds: Background[];
  currentBackground: Background | null;
  currentIndex: number;
  loading: boolean;
  nextBackground: () => void;
  toggleMute: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

export const BackgroundProvider = ({ children }: { children: ReactNode }) => {
  const [activeBackgrounds, setActiveBackgrounds] = useState<Background[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchBackgrounds = async () => {
    try {
      const { data } = await supabase
        .from('backgrounds')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (data && data.length > 0) {
        setActiveBackgrounds(data as Background[]);
      } else {
        setActiveBackgrounds([]);
      }
    } catch {
      setActiveBackgrounds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  const nextBackground = useCallback(() => {
    if (activeBackgrounds.length > 1) {
      setCurrentIndex(prev => (prev + 1) % activeBackgrounds.length);
    }
  }, [activeBackgrounds.length]);

  const toggleMute = async (id: string) => {
    const bg = activeBackgrounds.find(b => b.id === id);
    if (!bg) return;

    try {
      const { error } = await supabase
        .from('backgrounds')
        .update({ is_muted: !bg.is_muted })
        .eq('id', id);

      if (!error) {
        setActiveBackgrounds(prev =>
          prev.map(b => b.id === id ? { ...b, is_muted: !b.is_muted } : b)
        );
      }
    } catch (err) {
      console.error('Toggle mute error:', err);
    }
  };

  // Auto-rotate for images (every 10 seconds)
  useEffect(() => {
    const current = activeBackgrounds[currentIndex];
    if (!current || current.background_type !== 'image' || activeBackgrounds.length <= 1) return;

    const timer = setTimeout(() => {
      nextBackground();
    }, 10000);

    return () => clearTimeout(timer);
  }, [currentIndex, activeBackgrounds, nextBackground]);

  const currentBackground = activeBackgrounds[currentIndex] || null;

  return (
    <BackgroundContext.Provider value={{
      activeBackgrounds,
      currentBackground,
      currentIndex,
      loading,
      nextBackground,
      toggleMute,
      refetch: fetchBackgrounds
    }}>
      {children}
    </BackgroundContext.Provider>
  );
};

export const useBackground = () => {
  const context = useContext(BackgroundContext);
  if (context === undefined) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
};
