// Tadris+ P8-A1 — the teacher's appearance presets (blueprint §9.3, owner decisions §19.27): a palette (the brand colours only) and a
// density, saved on the teacher's ACCOUNT (teacher-profile `appearance`) with a device copy so the teacher's area opens in their look at
// once. Applied as data-palette / data-density on <html> by the TEACHER shell alone, and removed when it closes — the student portal,
// the owner console and exam pages keep the default (owner decision: «للمعلم وحده»). The light / dark mode keeps its own device switch
// (src/ui/themePreference.ts); the account keeps the teacher's choice and re-applies it on another device. Presentation only: no
// permission depends on any of this (blueprint acceptance test 12).
import { getThemeChoice, setThemeChoice, subscribeThemeChoice, type ThemeChoice } from "../ui/themePreference";

export type PaletteId = "default" | "ocean" | "forest" | "sand";
export type DensityId = "comfortable" | "compact";
export type TeacherAppearance = { theme: ThemeChoice; palette: PaletteId; density: DensityId };
export type AppearanceChoosable = { theme: boolean; palette: boolean; density: boolean };
/** Tadris+ P8-A2 — the values of each part the owner allows this teacher (absent on an older API → every value). */
export type AppearanceAllowed = { theme: string[]; palette: string[]; density: string[] };

export const PALETTES: { id: PaletteId; label: string; swatch: string }[] = [
  { id: "default", label: "الافتراضية", swatch: "#2a0a4e" },
  { id: "ocean", label: "محيط", swatch: "#0b4a5c" },
  { id: "forest", label: "غابة", swatch: "#1d4a2a" },
  { id: "sand", label: "رمل", swatch: "#5a3410" }
];
export const DENSITIES: { id: DensityId; label: string }[] = [
  { id: "comfortable", label: "مريحة" },
  { id: "compact", label: "مدمجة" }
];
export const DEFAULT_APPEARANCE: TeacherAppearance = { theme: "light", palette: "default", density: "comfortable" };

const CACHE_KEY = "examBankTeacherAppearance";
const isPalette = (v: unknown): v is PaletteId => PALETTES.some(p => p.id === v);
const isDensity = (v: unknown): v is DensityId => DENSITIES.some(d => d.id === v);

/** The server's / the cache's appearance, validated (anything unknown → that part's default). */
export function parseAppearance(v: unknown): TeacherAppearance {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
  return { theme: o.theme === "dark" ? "dark" : "light", palette: isPalette(o.palette) ? o.palette : "default", density: isDensity(o.density) ? o.density : "comfortable" };
}

/** Sets (or, for the defaults, removes) data-palette / data-density on <html>. */
export function applyTeacherAppearance(a: Pick<TeacherAppearance, "palette" | "density">): void {
  const root = document.documentElement;
  if (a.palette === "default") root.removeAttribute("data-palette"); else root.setAttribute("data-palette", a.palette);
  if (a.density === "comfortable") root.removeAttribute("data-density"); else root.setAttribute("data-density", a.density);
}
/** Back to the platform's default look (the teacher shell closed: another role may use this device next). */
export function clearTeacherAppearance(): void {
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-density");
}

export function readCachedAppearance(): TeacherAppearance | null {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? parseAppearance(JSON.parse(raw)) : null; } catch { return null; }
}
export function cacheAppearance(a: TeacherAppearance): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(a)); } catch { /* a device copy only */ }
}
export function forgetCachedAppearance(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* a device copy only */ }
}

const headers = (token: string) => ({ "x-builder-token": token, Authorization: "Bearer " + token });
const choosableOf = (c: Partial<AppearanceChoosable> | undefined): AppearanceChoosable => ({ theme: c?.theme === true, palette: c?.palette === true, density: c?.density === true });

// The account's appearance as the app's OWN profile read delivered it (teacherProfile.ts → noteTeacherAppearance): the shell needs no
// request of its own.
type Known = { appearance: TeacherAppearance; choosable: AppearanceChoosable };
let known: Known | null = null;
const listeners = new Set<(k: Known) => void>();
/** Called with every teacher-profile answer that carries `appearance`. */
export function noteTeacherAppearance(j: { appearance?: unknown; appearanceChoosable?: Partial<AppearanceChoosable> }): void {
  if (!j || !j.appearance) return;
  known = { appearance: parseAppearance(j.appearance), choosable: j.appearanceChoosable ? choosableOf(j.appearanceChoosable) : (known ? known.choosable : choosableOf(undefined)) };
  for (const l of listeners) l(known);
}
/** Tests only. */
export function resetKnownAppearance(): void { known = null; }

/** GET the teacher's appearance and what may be changed (null on any failure: the device copy / defaults stay). */
const allowedOf = (a: unknown): AppearanceAllowed | null => {
  const o = a && typeof a === "object" ? a as Record<string, unknown> : null;
  if (!o) return null;
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((v): v is string => typeof v === "string") : []);
  return { theme: list("theme"), palette: list("palette"), density: list("density") };
};
export async function fetchTeacherAppearance(token: string): Promise<{ appearance: TeacherAppearance; choosable: AppearanceChoosable; allowed: AppearanceAllowed | null } | null> {
  try {
    const r = await fetch("/api/teacher-profile", { headers: headers(token) });
    const j = await r.json().catch(() => null) as { ok?: boolean; appearance?: unknown; appearanceChoosable?: Partial<AppearanceChoosable>; appearanceAllowed?: unknown } | null;
    if (!r.ok || !j || !j.ok || !j.appearance) return null;
    return { appearance: parseAppearance(j.appearance), choosable: choosableOf(j.appearanceChoosable), allowed: allowedOf(j.appearanceAllowed) };
  } catch { return null; }
}

/** POST the parts that changed; the server's stored appearance comes back. Throws the server's message on a refusal. */
export async function saveTeacherAppearance(token: string, changes: Partial<TeacherAppearance>): Promise<TeacherAppearance> {
  const r = await fetch("/api/teacher-profile", { method: "POST", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify({ action: "setAppearance", appearance: changes }) });
  const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; appearance?: unknown } | null;
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "تعذر حفظ المظهر.");
  noteTeacherAppearance(j);
  return parseAppearance(j.appearance);
}

/**
 * The teacher shell's lifecycle: applies the device copy at once, then the account's appearance (the theme too, when it differs
 * from this device's), keeps the account in step when the teacher flips the top bar's light / dark switch (when they may), and
 * restores the default look when the shell closes. → the cleanup function.
 */
export function startTeacherAppearance(token: string): () => void {
  let alive = true, choosable: AppearanceChoosable = choosableOf(undefined), account: TeacherAppearance | null = null;
  const cached = readCachedAppearance();
  if (cached) applyTeacherAppearance(cached);
  const receive = (r: Known) => {
    if (!alive) return;
    const first = account === null;
    account = r.appearance; choosable = r.choosable;
    applyTeacherAppearance(r.appearance);
    if (first && r.appearance.theme !== getThemeChoice()) setThemeChoice(r.appearance.theme);   // the account's theme, once per opening
    cacheAppearance(r.appearance);
  };
  listeners.add(receive);
  if (known) receive(known);
  const stop = subscribeThemeChoice(() => {
    const theme = getThemeChoice();
    if (!alive || !account || !choosable.theme || account.theme === theme) return;
    account = { ...account, theme };
    cacheAppearance(account);
    void saveTeacherAppearance(token, { theme }).catch(() => { /* the device keeps the choice; the next save retries */ });
  });
  return () => { alive = false; listeners.delete(receive); stop(); clearTeacherAppearance(); };
}
