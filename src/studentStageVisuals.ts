// STUDENT STRENGTH — the 25 STAGES' visual authority (owner-provided final assets, bytes committed unchanged).
//
// This is the ONE central place that binds each stage number (1..25, decided by the SERVER in `dashboard.strength`)
// to its image, its Arabic stage title, its journey group and its meaningful alt text. Components import from here
// and never an individual stage PNG; nothing here derives a stage from points — the server does that
// (api/src/lib/student-strength.js): 25 stages × 80 points = 2000 visible points. The order below is the owner's
// approved order (src/assets/student-stages/owner-manifest.json, the archive's stage-names.json).

import { sizedImageSet, type VisualImageSet } from "./studentVisualSizes";

/** The number of stages on the visible Strength path (display metadata — the server's `stageCount` is the authority). */
export const STAGE_COUNT = 25;

/** The five journey groups — presentation labels only, they never affect scoring. */
export type StageGroupId = 1 | 2 | 3 | 4 | 5;
export type StageGroup = { id: StageGroupId; label: string; from: number; to: number };
export const STAGE_GROUPS: readonly StageGroup[] = [
  { id: 1, label: "بداية الرحلة", from: 1, to: 5 },
  { id: 2, label: "مرحلة البناء", from: 6, to: 10 },
  { id: 3, label: "مرحلة التمكّن", from: 11, to: 15 },
  { id: 4, label: "مرحلة الريادة", from: 16, to: 20 },
  { id: 5, label: "مرحلة الأسطورة", from: 21, to: 25 },
];

/** The visual metadata of ONE stage. `alt` is the meaningful screen-reader text of the CURRENT stage image. */
export type StageVisual = { stageNumber: number; title: string; group: StageGroup; images: VisualImageSet; alt: string };

// Phase 11C — the app ships the SIZED derivatives only (never the 512² masters beside them); `?no-inline` keeps even
// the smallest file a separate cacheable asset instead of base64 inside the JS chunk.
const SIZED = import.meta.glob<string>("./assets/student-stages/sized/*.png", { eager: true, query: "?no-inline", import: "default" });

const TITLES: readonly string[] = [
  "بذرة القوة", "شعلة صغيرة", "نمر البرق", "فارس الجليد", "تنين النار",
  "العنقاء الذهبية", "ذئب الرياح", "سيد الأمواج", "صقر العاصفة", "أسد البلور",
  "حارس الغابة", "محارب الظلال", "سيد النجوم", "بطل العناصر", "ملك الصواعق",
  "فارس الشمس", "تنين الجليد", "سيد العواصف", "حامي الأساطير", "العنقاء الملكية",
  "أسد المجرة", "سيد الأكوان", "تنين النور", "ملك السيادة", "أسطورة القوة",
];

/** The journey group of a stage number (1..25). */
export function stageGroupOf(stageNumber: number): StageGroup {
  const n = clampStage(stageNumber);
  return STAGE_GROUPS.find(g => n >= g.from && n <= g.to) || STAGE_GROUPS[0];
}

/** The single source of truth: index 0 = stage 1 … index 24 = stage 25. */
export const STAGE_VISUALS: readonly StageVisual[] = TITLES.map((title, i) => ({
  stageNumber: i + 1, title, group: stageGroupOf(i + 1), images: sizedImageSet(SIZED, "stage-" + String(i + 1).padStart(2, "0")), alt: "المرحلة " + (i + 1) + " — " + title,
}));

/** A stage number the mapping can serve (a malformed or out-of-range value shows stage 1 / stage 25, never crashes). */
function clampStage(stageNumber: number): number {
  const n = Math.trunc(Number(stageNumber));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, STAGE_COUNT);
}

/** The visual metadata for a stage number (thin, explicit accessor so callers never index the array ad hoc). */
export function stageVisual(stageNumber: number): StageVisual {
  return STAGE_VISUALS[clampStage(stageNumber) - 1];
}
