import { useCallback, useEffect, useState } from 'react';

/**
 * useState that survives the component unmounting (e.g. switching tabs) and
 * page reloads within the same browser tab, by mirroring the value into
 * sessionStorage under `key`. Call the returned `clear()` once the data has
 * been submitted so a stale draft isn't restored later.
 */
export function usePersistedState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // unreadable / storage blocked -- fall through to the default
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked -- the value just won't persist
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  return [value, setValue, clear] as const;
}
