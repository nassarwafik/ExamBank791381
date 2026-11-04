// Tadris+ P8-B2a — the teacher's own order of the sidebar (owner decision §19.31): which main destinations come first and which are
// hidden, saved on the teacher's ACCOUNT (teacher-profile `navLayout`, the same capability as the «اليوم» arrangement:
// appearance.layout.choose). «لوحة المتابعة» always stays first and shown. PRESENTATION ONLY: a hidden destination is still offered by
// the quick search and still opens; what the teacher may open is decided by the server's capabilities alone.
import { useSyncExternalStore } from "react";
import { PRIMARY_NAV, PRIMARY_SECTIONS, type TeacherNavId, type TeacherNavSection } from "./teacherNav";
import { navAllowed, type TeacherAccessView } from "./teacherAccess";

export type NavLayout = { order: TeacherNavId[]; hidden: TeacherNavId[] };
/** The destinations the teacher may arrange — the server's NAV_LAYOUT_IDS (api/src/lib/teacher-profile.js; a sync test pins them). */
export const ARRANGEABLE_NAV: TeacherNavId[] = PRIMARY_NAV.filter(id => id !== "dashboard");
/** How many destinations the phone's bottom bar shows before «المزيد». */
export const BOTTOM_BAR_SIZE = 4;

const isArrangeable = (v: unknown): v is TeacherNavId => typeof v === "string" && (ARRANGEABLE_NAV as string[]).includes(v);
/** The server's answer, validated (unknown / repeated ids dropped; anything else → the default order, null). */
export function parseNavLayout(v: unknown): NavLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(o[k]) ? [...new Set((o[k] as unknown[]).filter(isArrangeable))] : []);
  const out = { order: list("order"), hidden: list("hidden") };
  return out.order.length || out.hidden.length ? out : null;
}

/** The ids in the teacher's order: «لوحة المتابعة» first, those the order names next (in its order), then the rest in their default order. */
export function orderedNav(ids: TeacherNavId[], layout: NavLayout | null): TeacherNavId[] {
  if (!layout || !layout.order.length) return [...ids];
  // «لوحة المتابعة» is never arranged: it always stays first.
  const rank = (id: TeacherNavId) => { if (id === "dashboard") return -1; const i = layout.order.indexOf(id); return i < 0 ? layout.order.length + ids.indexOf(id) : i; };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}
/** The sidebar's main sections in the teacher's order, without the hidden destinations (each destination keeps its section). */
export function arrangeSections(layout: NavLayout | null, sections: TeacherNavSection[] = PRIMARY_SECTIONS): TeacherNavSection[] {
  const hidden = new Set(layout ? layout.hidden : []);
  return sections.map(s => ({ ...s, items: orderedNav(s.items, layout).filter(id => id === "dashboard" || !hidden.has(id)) }));
}
/** The phone's bottom bar: «لوحة المتابعة», then the teacher's first shown destinations they may open — BOTTOM_BAR_SIZE in all. */
export function bottomBarItems(layout: NavLayout | null, access: TeacherAccessView | null | undefined): TeacherNavId[] {
  const shown = arrangeSections(layout).flatMap(s => s.items);
  const main = ["dashboard" as TeacherNavId, ...orderedNav(shown.filter(id => id !== "dashboard"), layout)];
  return main.filter(id => navAllowed(id, access)).slice(0, BOTTOM_BAR_SIZE);
}

// The account's order as the app's OWN profile read delivered it (teacherProfile.ts → noteTeacherNavLayout): the shell needs no
// request of its own. `undefined` = not known yet (an older API, or not loaded): the default order.
type Known = { layout: NavLayout | null; choosable: boolean };
let known: Known = { layout: null, choosable: false };
const listeners = new Set<() => void>();
/** Called with every teacher-profile answer that carries `navLayout` (null = the default order). */
export function noteTeacherNavLayout(j: { navLayout?: unknown; layoutChoosable?: unknown }): void {
  if (!j || !("navLayout" in j)) return;
  known = { layout: parseNavLayout(j.navLayout), choosable: "layoutChoosable" in j ? j.layoutChoosable === true : known.choosable };
  for (const l of listeners) l();
}
/** Tests only. */
export function resetKnownNavLayout(): void { known = { layout: null, choosable: false }; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** The teacher's current order (and whether they may change it), kept in step with every profile answer. */
export function useTeacherNavLayout(): Known {
  return useSyncExternalStore(subscribe, () => known, () => known);
}

/** POST the order; the server's stored order comes back (and reaches the shell). Throws the server's message on a refusal. */
export async function saveTeacherNavLayout(token: string, layout: NavLayout): Promise<NavLayout | null> {
  const r = await fetch("/api/teacher-profile", { method: "POST", headers: { "Content-Type": "application/json", "x-builder-token": token, Authorization: "Bearer " + token }, body: JSON.stringify({ action: "setNavLayout", layout }) });
  const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; navLayout?: unknown } | null;
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "تعذر حفظ ترتيب القائمة.");
  noteTeacherNavLayout(j);
  return parseNavLayout(j.navLayout);
}
