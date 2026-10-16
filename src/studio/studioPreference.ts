// Phase 21F.3 — which builder layout a teacher works in: the Exam Studio or the classic (21E) layout. A per-browser preference (never
// exam data, never sent to the server); `?studio=1` / `?studio=0` in the address opens one layout for this visit without changing the
// stored choice. Storage may be unavailable (private mode, blocked): the default then applies.
export type BuilderLayout = "classic" | "studio";
export const STUDIO_LAYOUT_KEY = "tadris.studio.layout";
/** The layout a teacher gets before choosing one. */
export const DEFAULT_BUILDER_LAYOUT: BuilderLayout = "classic";

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
