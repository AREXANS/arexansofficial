// Safe storage adapter for Supabase Auth that works in all environments:
// standard window, cross-origin iframes, private browsing, and environments where localStorage is blocked.

const memStore = new Map<string, string>();

const isLocalStorageUsable = (): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__safe_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

export function brokeredPreviewStorage() {
  const usable = isLocalStorageUsable();

  return {
    getItem: (key: string): string | null => {
      try {
        if (usable) {
          return window.localStorage.getItem(key);
        }
      } catch {}
      return memStore.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      try {
        if (usable) {
          window.localStorage.setItem(key, value);
        }
      } catch {}
      memStore.set(key, value);
    },
    removeItem: (key: string): void => {
      try {
        if (usable) {
          window.localStorage.removeItem(key);
        }
      } catch {}
      memStore.delete(key);
    },
  };
}
