import { useState } from "react";

export function useStoredPreference<T extends string>(key: string, fallback: T, isAllowed: (value: string | null) => value is T) {
  const [value, setValueState] = useState<T>(() => {
    try { const stored = localStorage.getItem(key); return isAllowed(stored) ? stored : fallback; }
    catch { return fallback; }
  });
  const setValue = (next: T) => {
    setValueState(next);
    try { localStorage.setItem(key, next); } catch { /* Storage is optional. */ }
  };
  return [value, setValue] as const;
}
