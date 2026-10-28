/**
 * Failsafe localStorage wrapper that gracefully falls back to memory storage
 * if cookies/localStorage are restricted, blocked in cross-origin iframes, or in private browsing.
 */

const memoryMap = new Map<string, string>();

let storageAvailable: boolean | null = null;

function checkStorageAvailability(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      storageAvailable = false;
      return false;
    }
    const test = '__st_avail_check__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (checkStorageAvailability()) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}
    return memoryMap.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (checkStorageAvailability()) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
    memoryMap.set(key, String(value));
  },

  removeItem(key: string): void {
    try {
      if (checkStorageAvailability()) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    memoryMap.delete(key);
  },

  clear(): void {
    try {
      if (checkStorageAvailability()) {
        window.localStorage.clear();
      }
    } catch {}
    memoryMap.clear();
  }
};
