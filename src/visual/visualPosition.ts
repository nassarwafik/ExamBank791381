import type { NormalizedPoint } from "../visualGeometry";

// Phase 19D — tiny presentation helpers shared by the visual canvas, the student views, the editors and the review (kept out of the
// component modules so they stay fast-refresh friendly).
/** Percent position of a normalized point inside the overlay. */
export const at = (p: NormalizedPoint) => ({ left: p.x * 100 + "%", top: p.y * 100 + "%" });
/** Percent text for a normalized value (coordinates keep Western digits). */
export const pct = (v: number) => Math.round(v * 1000) / 10 + "%";
