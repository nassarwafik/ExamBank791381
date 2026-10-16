// Phase 21F.3 — which builder layout a teacher works in: the Exam Studio or the classic (21E) layout. A per-browser preference (never
// exam data, never sent to the server); `?studio=1` / `?studio=0` in the address opens one layout for this visit without changing the
// stored choice. Storage may be unavailable (private mode, blocked): the default then applies.
export type BuilderLayout = "classic" | "studio";
export const STUDIO_LAYOUT_KEY = "tadris.studio.layout";
/** The layout a teacher gets before choosing one. Phase 21F.9 (D6) — the Exam Studio; the classic layout stays one click away
 *  («العودة إلى الواجهة الكلاسيكية» / «الواجهة الكلاسيكية») and is remembered once chosen. */
export const DEFAULT_BUILDER_LAYOUT: BuilderLayout = "studio";

export function readBuilderLayout(search: string = typeof location !== "undefined" ? location.search : ""): BuilderLayout {
  try {
    const q = new URLSearchParams(search).get("studio");
    if (q === "1") return "studio";
    if (q === "0") return "classic";
  } catch { /* ignore a malformed query */ }
  try {
    const stored = localStorage.getItem(STUDIO_LAYOUT_KEY);
    if (stored === "studio" || stored === "classic") return stored;
  } catch { /* storage unavailable */ }
  return DEFAULT_BUILDER_LAYOUT;
}

export function writeBuilderLayout(layout: BuilderLayout): void {
  try { localStorage.setItem(STUDIO_LAYOUT_KEY, layout); } catch { /* storage unavailable: the choice lasts for this visit */ }
}

// Phase 21F.9 — experimental builder tools (the 3D function lab) are hidden in the Studio unless the teacher turns them on (a per-browser
// preference, like the layout).
export const STUDIO_EXPERIMENTAL_KEY = "tadris.studio.experimental";
export function readExperimentalTools(): boolean {
  try { return localStorage.getItem(STUDIO_EXPERIMENTAL_KEY) === "1"; } catch { return false; }
}
export function writeExperimentalTools(on: boolean): void {
  try { if (on) localStorage.setItem(STUDIO_EXPERIMENTAL_KEY, "1"); else localStorage.removeItem(STUDIO_EXPERIMENTAL_KEY); } catch { /* storage unavailable */ }
}
