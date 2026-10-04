import { useCallback, useSyncExternalStore } from "react";

// Phase 18B — editor UI PREFERENCES of the coding workspace: font size, word wrap, minimap, line numbers. They are device-level
// presentation choices, exactly like the Phase 12A motion override (same storage discipline: ONE fixed localStorage key, literal
// JSON, no session data, no PII, never sent anywhere, storage failures fall back to memory for the current page). They are NOT part
// of the coding Answer, not part of a question, never hashed, never graded and never alter the source text: the editor reads them
// to lay the SAME text out differently. Every stored value is re-validated on read, field by field (fail closed to the default).
//
// Theme: the application has ONE (light) appearance and the editor ships the matching SmartAssess theme (editorOptions.ts), so
// there is deliberately no theme preference here — an off-brand dark editor inside a light exam page would not be "aligned with
// the application appearance". A future application-wide appearance switch adds a field here, not a parallel store.
export type EditorPreferences = { fontSize: number; wordWrap: boolean; minimap: boolean; lineNumbers: boolean };

export const EDITOR_FONT_SIZES: readonly number[] = Object.freeze([12, 13, 14, 15, 16, 18, 20]);
export const DEFAULT_EDITOR_PREFERENCES: Readonly<EditorPreferences> = Object.freeze({ fontSize: 14, wordWrap: false, minimap: false, lineNumbers: true });
export const EDITOR_PREFERENCES_KEY = "smartassessCodeEditorPreferences";
/** The 17F-C1 editor pairs 14 px with a 22 px line; every other size keeps the same ratio (integer pixels). */
export const lineHeightFor = (fontSize: number): number => Math.round(fontSize * (22 / 14));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
/** A complete, valid preference object from anything (storage, a patch, junk): unknown fields are dropped, bad values default. */
export function normalizeEditorPreferences(raw: unknown): EditorPreferences {
  const o = isObj(raw) ? raw : {};
  return {
    fontSize: typeof o.fontSize === "number" && EDITOR_FONT_SIZES.includes(o.fontSize) ? o.fontSize : DEFAULT_EDITOR_PREFERENCES.fontSize,
    wordWrap: bool(o.wordWrap, DEFAULT_EDITOR_PREFERENCES.wordWrap),
    minimap: bool(o.minimap, DEFAULT_EDITOR_PREFERENCES.minimap),
    lineNumbers: bool(o.lineNumbers, DEFAULT_EDITOR_PREFERENCES.lineNumbers)
  };
}
const same = (a: EditorPreferences, b: EditorPreferences) => a.fontSize === b.fontSize && a.wordWrap === b.wordWrap && a.minimap === b.minimap && a.lineNumbers === b.lineNumbers;

const listeners = new Set<() => void>();
let memory: EditorPreferences | null = null;                                      // the choice when storage cannot be used
let snapshot: EditorPreferences = { ...DEFAULT_EDITOR_PREFERENCES };               // stable reference until a change (useSyncExternalStore)
let loaded = false;

function readStored(): EditorPreferences | null {
  try {
    const raw = localStorage.getItem(EDITOR_PREFERENCES_KEY);
    if (raw === null) return null;
    return normalizeEditorPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}
function refresh(): void {
  const next = readStored() ?? memory ?? DEFAULT_EDITOR_PREFERENCES;
  if (!same(next, snapshot)) snapshot = { ...next };
  loaded = true;
}
/** The effective preferences (stored, else the in-memory choice, else the defaults). Same reference while unchanged. */
export function getEditorPreferences(): EditorPreferences {
  if (!loaded) refresh();
  return snapshot;
}
/** Merge `patch` into the current preferences, persist (best effort) and notify subscribers — even when storage is unavailable. */
export function setEditorPreferences(patch: Partial<EditorPreferences>): void {
  const next = normalizeEditorPreferences({ ...getEditorPreferences(), ...patch });
  memory = next;
  try { localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(next)); } catch { /* privacy mode / quota: memory keeps the choice for this page */ }
  refresh();
  listeners.forEach(l => l());
}
/** Subscribe to changes made here or in another tab. Returns the unsubscribe. */
export function subscribeEditorPreferences(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === EDITOR_PREFERENCES_KEY) { refresh(); listener(); } };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("storage", onStorage);
  };
}
/** Tests only: forget the in-memory state (and, unless told otherwise, the stored value). */
export function resetEditorPreferencesForTests(options: { keepStorage?: boolean } = {}): void {
  memory = null; loaded = false; snapshot = { ...DEFAULT_EDITOR_PREFERENCES };
  if (!options.keepStorage) { try { localStorage.removeItem(EDITOR_PREFERENCES_KEY); } catch { /* no storage */ } }
}

const serverSnapshot = (): EditorPreferences => DEFAULT_EDITOR_PREFERENCES;
/** React hook: the live preferences and a patch setter. */
export function useEditorPreferences(): [EditorPreferences, (patch: Partial<EditorPreferences>) => void] {
  const prefs = useSyncExternalStore(subscribeEditorPreferences, getEditorPreferences, serverSnapshot);
  const update = useCallback((patch: Partial<EditorPreferences>) => setEditorPreferences(patch), []);
  return [prefs, update];
}
