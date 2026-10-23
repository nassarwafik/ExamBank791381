// UX-R18a — the device-level appearance choice: the normal (light) mode or the dark mode, switched by one toggle button
// (docs/enterprise-ux-r0-redesign-foundation.md R18a). Owner decision (2026-10-23): a single button between dark and normal, the
// normal mode by default; the device's own preference is not followed. A per-viewer convenience, not account data: stored on this
// device only (localStorage, a fixed key, the literal "dark"; no key = light), never sent anywhere. Storage failures (privacy mode,
// quota) keep the choice for the current page only. The choice is mirrored on <html data-theme="light|dark">, which
// design-tokens-dark.css turns into the color-scheme every light-dark() token reads.
//
// DARK_MODE_RELEASED: R18a shipped the tokens, this module, the toggle and the shells' dark look unreleased (owner decision: dark
// pages are shown once everything is finished). UX-R18c2 releases it: every page has its dark look (R18b, R18c1), so the toggle is
// rendered in both top bars and the stored choice is applied at start-up. index.html applies it before the first paint too (an
// inline script reading the same key), so a dark page never flashes light. Setting it back to false hides the toggle and keeps
// the app light, except that the pre-paint script would still honour a stored choice: remove both together.
import { useSyncExternalStore } from "react";

export const DARK_MODE_RELEASED = true;

export type ThemeChoice = "light" | "dark";
export const THEME_KEY = "examBankTheme";

const listeners = new Set<() => void>();
let memory: ThemeChoice | null = null;

/** The stored choice; light when the viewer never chose (or storage holds anything else). */
export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark") return v;
    if (v === null && memory) return memory;
    return "light";
  } catch {
    return memory ?? "light";
  }
}

/** Mirror the choice on <html data-theme>. Safe without a document (SSR / tests without DOM). */
export function applyThemeChoice(choice: ThemeChoice = getThemeChoice()): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.setAttribute("data-theme", choice);
}

/** Store the choice (light clears the key), apply it and notify every subscriber, even when storage is unavailable. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "light") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable — the in-memory choice below still applies to the current page */
  }
  memory = choice;
  applyThemeChoice(choice);
  listeners.forEach(l => l());
}

/** Subscribe to choices made here or in another tab (storage event). Returns the unsubscribe. */
export function subscribeThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === THEME_KEY) { memory = null; applyThemeChoice(); listener(); } };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("storage", onStorage);
  };
}

/** The current choice, kept in sync across components and tabs. */
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribeThemeChoice, getThemeChoice, () => "light" as ThemeChoice);
  return [choice, setThemeChoice];
}

/** At start-up: apply the stored choice (the pre-paint script in index.html already did; this keeps the two in step). Inert when
 *  dark mode is not released (the app stays light). */
export function initThemePreference(released: boolean = DARK_MODE_RELEASED): void {
  if (!released) return;
  applyThemeChoice();
}
