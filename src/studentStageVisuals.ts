// STUDENT STRENGTH — the 25 STAGES' visual authority (owner-provided final assets, bytes committed unchanged).
//
// This is the ONE central place that binds each stage number (1..25, decided by the SERVER in `dashboard.strength`)
// to its image, its Arabic stage title, its journey group and its meaningful alt text. Components import from here
// and never an individual stage PNG; nothing here derives a stage from points — the server does that
// (api/src/lib/student-strength.js): 25 stages × 80 points = 2000 visible points. The order below is the owner's
// approved order (src/assets/student-stages/owner-manifest.json, the archive's stage-names.json).
import stage01 from "./assets/student-stages/stage-01.png";
import stage02 from "./assets/student-stages/stage-02.png";
import stage03 from "./assets/student-stages/stage-03.png";
import stage04 from "./assets/student-stages/stage-04.png";
import stage05 from "./assets/student-stages/stage-05.png";
import stage06 from "./assets/student-stages/stage-06.png";
import stage07 from "./assets/student-stages/stage-07.png";
import stage08 from "./assets/student-stages/stage-08.png";
import stage09 from "./assets/student-stages/stage-09.png";
import stage10 from "./assets/student-stages/stage-10.png";
import stage11 from "./assets/student-stages/stage-11.png";
import stage12 from "./assets/student-stages/stage-12.png";
import stage13 from "./assets/student-stages/stage-13.png";
import stage14 from "./assets/student-stages/stage-14.png";
import stage15 from "./assets/student-stages/stage-15.png";
import stage16 from "./assets/student-stages/stage-16.png";
import stage17 from "./assets/student-stages/stage-17.png";
import stage18 from "./assets/student-stages/stage-18.png";
import stage19 from "./assets/student-stages/stage-19.png";
import stage20 from "./assets/student-stages/stage-20.png";
import stage21 from "./assets/student-stages/stage-21.png";
import stage22 from "./assets/student-stages/stage-22.png";
import stage23 from "./assets/student-stages/stage-23.png";
import stage24 from "./assets/student-stages/stage-24.png";
import stage25 from "./assets/student-stages/stage-25.png";

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
export type StageVisual = { stageNumber: number; title: string; group: StageGroup; image: string; alt: string };

const TITLES: readonly string[] = [
  "بذرة القوة", "شعلة صغيرة", "نمر البرق", "فارس الجليد", "تنين النار",
  "العنقاء الذهبية", "ذئب الرياح", "سيد الأمواج", "صقر العاصفة", "أسد البلور",
  "حارس الغابة", "محارب الظلال", "سيد النجوم", "بطل العناصر", "ملك الصواعق",
  "فارس الشمس", "تنين الجليد", "سيد العواصف", "حامي الأساطير", "العنقاء الملكية",
  "أسد المجرة", "سيد الأكوان", "تنين النور", "ملك السيادة", "أسطورة القوة",
];
const IMAGES: readonly string[] = [
  stage01, stage02, stage03, stage04, stage05, stage06, stage07, stage08, stage09, stage10,
  stage11, stage12, stage13, stage14, stage15, stage16, stage17, stage18, stage19, stage20,
  stage21, stage22, stage23, stage24, stage25,
];

/** The journey group of a stage number (1..25). */
export function stageGroupOf(stageNumber: number): StageGroup {
  const n = clampStage(stageNumber);
  return STAGE_GROUPS.find(g => n >= g.from && n <= g.to) || STAGE_GROUPS[0];
}

/** The single source of truth: index 0 = stage 1 … index 24 = stage 25. */
export const STAGE_VISUALS: readonly StageVisual[] = TITLES.map((title, i) => ({
  stageNumber: i + 1, title, group: stageGroupOf(i + 1), image: IMAGES[i], alt: "المرحلة " + (i + 1) + " — " + title,
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
