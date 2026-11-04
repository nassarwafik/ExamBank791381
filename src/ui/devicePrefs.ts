// Tadris+ P8-B2b — the teacher's table and view preferences ON THIS DEVICE (owner decisions §19.31: «على هذا الجهاز» for the tables,
// «لكل صفحة» for the card / compact view): kept in the browser's localStorage only, never sent to the server and never stored in the
// platform's data. Each value is validated on read (anything unknown → the page's default, which is exactly the look before P8-B2b);
// the default is stored as the key's absence. Storage failures (privacy mode, a full quota) are ignored: the page simply keeps its
// default. Presentation only — no permission depends on any of it.
import { useCallback, useState } from "react";

const PREFIX = "examBankViewPref:";

/** The stored value of `key`, validated by `parse` (null when absent, unreadable or invalid). */
export function readDevicePref<T>(key: string, parse: (v: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : parse(JSON.parse(raw));
  } catch { return null; }
}
/** Stores `value` (or removes the key for null — the page's default). */
export function writeDevicePref(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* a device convenience only */ }
}

/** Removes every preference of this module from this device (the test setup gives each test a clean device). */
export function clearDevicePrefs(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    for (const k of keys) localStorage.removeItem(k);
  } catch { /* no storage (a node test): nothing to clear */ }
}

/** One of a fixed list of strings (a view, a filter, a sort key). */
export const oneOf = <T extends string>(allowed: readonly T[]) => (v: unknown): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : null);

/**
 * A preference remembered on this device: starts from the stored value (or `fallback`), and every change is stored at once (the
 * fallback itself as the key's absence). `same` decides whether a value is the fallback (default: ===); `stored` picks the part that is
 * kept (default: the whole value) — what it leaves out, a search text for instance, is never written.
 */
export function useDevicePref<T>(key: string, fallback: T, parse: (v: unknown) => T | null, same: (a: T, b: T) => boolean = Object.is, stored: (v: T) => unknown = v => v): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readDevicePref(key, parse) ?? fallback);
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writeDevicePref(key, same(v, fallback) ? null : stored(v));
      return v;
    });
  }, [key, fallback, same, stored]);
  return [value, set];
}

/** The card / compact view of a list page («بطاقات» / «قائمة مضغوطة»). */
export type ListView = "cards" | "compact";
export const LIST_VIEWS: readonly ListView[] = ["cards", "compact"];
