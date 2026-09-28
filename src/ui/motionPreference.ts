// Phase 12A — an EXPLICIT, device-level motion preference that sits on top of the OS hint.
//
// Every animated surface (the Reader's educational SVG visuals, the activity host, charts, the portal) reads
// `usePrefersReducedMotion()`, which until now mirrored `(prefers-reduced-motion: reduce)` alone. On many classroom
// desktops that media query is TRUE without anyone choosing it (Windows «Animation effects» / «Show animations in
// Windows» off, macOS «Reduce motion»), so the very same page that animates on a phone renders every visual as a still
// frame on the computer — the reported "SVG does not move on the desktop". The OS hint stays the DEFAULT (nothing
// changes for a viewer who never touches the control), but a person may now override it in either direction from the
// Reader's «حركة الرسوم» control. Stored on this device only (localStorage, a fixed key, the literal "on" / "off"):
// no session data, no PII, never sent anywhere. Storage failures (privacy mode, quota) fall back to the OS hint.
export type MotionOverride = "on" | "off";

export const MOTION_OVERRIDE_KEY = "examBankMotion";

const listeners = new Set<() => void>();

/** The explicit override, or null when the viewer never chose (→ the OS hint decides). */
export function getMotionOverride(): MotionOverride | null {
  try {
    const v = localStorage.getItem(MOTION_OVERRIDE_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

/** Set (or clear with null) the explicit override and notify every subscriber, even when storage is unavailable. */
export function setMotionOverride(value: MotionOverride | null): void {
  try {
    if (value) localStorage.setItem(MOTION_OVERRIDE_KEY, value);
    else localStorage.removeItem(MOTION_OVERRIDE_KEY);
  } catch {
    /* storage unavailable — the in-memory notification below still lets the current page follow the choice */
  }
  memory = value;
  syncDocumentMotionFlag();
  listeners.forEach(l => l());
}

/**
 * Mirror the effective override on <html data-eb-motion="on|off"> (absent = no choice). The stylesheets' reduced-motion
 * safety nets (`@media (prefers-reduced-motion: reduce)` → animation:none) are scoped to `:root:not([data-eb-motion="on"])`,
 * so an explicit "on" restores CSS-driven motion as well as the SMIL the components render; with no choice the OS hint
 * neutralises everything exactly as before. Safe without a document (SSR / tests without DOM).
 */
export function syncDocumentMotionFlag(): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const v = effectiveMotionOverride();
  if (v) document.documentElement.setAttribute("data-eb-motion", v);
  else document.documentElement.removeAttribute("data-eb-motion");
}

// When storage is unavailable the choice still applies to the current page (memory-only, lost on reload).
let memory: MotionOverride | null = null;
/** The effective override: what storage holds, or the in-memory choice when storage cannot be read. */
export function effectiveMotionOverride(): MotionOverride | null {
  try {
    const v = localStorage.getItem(MOTION_OVERRIDE_KEY);
    if (v === "on" || v === "off") return v;
    if (v === null) return memory;
    return null;
  } catch {
    return memory;
  }
}

/** Subscribe to override changes made here or in another tab (storage event). Returns the unsubscribe. */
export function subscribeMotionOverride(listener: () => void): () => void {
  listeners.add(listener);
  syncDocumentMotionFlag();                                   // a stored choice is reflected as soon as anything listens
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === MOTION_OVERRIDE_KEY) { syncDocumentMotionFlag(); listener(); } };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("storage", onStorage);
  };
}
