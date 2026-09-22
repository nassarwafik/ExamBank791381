// Student Strength — the 25-STAGE visible path. This is the ONE central place that binds each stage to its uploaded
// artwork, its Arabic name, its numeric range and its stage number. Every strength UI (portal hero, identity frame,
// achievement feed, teacher views) reads stage metadata from here — the icon/name mapping is never duplicated.
//
// The stage math mirrors the SERVER policy (api/src/lib/student-strength.js): total is 0..2000, each stage spans 80
// points, stage n covers [(n-1)×80 .. n×80-1] and stage 25 completes at 2000. The server is the authority for the
// student's totalPoints / stage / progress; this module only maps a stage number to its presentation.
import s01 from "../assets/strength-stages/strength-stage-01.png";
import s02 from "../assets/strength-stages/strength-stage-02.png";
import s03 from "../assets/strength-stages/strength-stage-03.png";
import s04 from "../assets/strength-stages/strength-stage-04.png";
import s05 from "../assets/strength-stages/strength-stage-05.png";
import s06 from "../assets/strength-stages/strength-stage-06.png";
import s07 from "../assets/strength-stages/strength-stage-07.png";
import s08 from "../assets/strength-stages/strength-stage-08.png";
import s09 from "../assets/strength-stages/strength-stage-09.png";
import s10 from "../assets/strength-stages/strength-stage-10.png";
import s11 from "../assets/strength-stages/strength-stage-11.png";
import s12 from "../assets/strength-stages/strength-stage-12.png";
import s13 from "../assets/strength-stages/strength-stage-13.png";
import s14 from "../assets/strength-stages/strength-stage-14.png";
import s15 from "../assets/strength-stages/strength-stage-15.png";
import s16 from "../assets/strength-stages/strength-stage-16.png";
import s17 from "../assets/strength-stages/strength-stage-17.png";
import s18 from "../assets/strength-stages/strength-stage-18.png";
import s19 from "../assets/strength-stages/strength-stage-19.png";
import s20 from "../assets/strength-stages/strength-stage-20.png";
import s21 from "../assets/strength-stages/strength-stage-21.png";
import s22 from "../assets/strength-stages/strength-stage-22.png";
import s23 from "../assets/strength-stages/strength-stage-23.png";
import s24 from "../assets/strength-stages/strength-stage-24.png";
import s25 from "../assets/strength-stages/strength-stage-25.png";

export const STAGE_COUNT = 25;
export const STAGE_SPAN = 80;
export const STRENGTH_TOTAL_MAX = STAGE_SPAN * STAGE_COUNT;   // 2000

/** The authored artwork + Arabic name + numeric range of ONE stage. `stage` is 1-based (1..25). */
export interface StrengthStageDef { stage: number; name: string; min: number; max: number; image: string; alt: string; }

// The 25 owner-approved stage names (from the uploaded stage-names.json, stage 1 → 25), mapped 1:1 to the icons.
const STAGE_NAMES: readonly string[] = [
  "بذرة القوة", "شعلة صغيرة", "نمر البرق", "فارس الجليد", "تنين النار",
  "العنقاء الذهبية", "ذئب الرياح", "سيد الأمواج", "صقر العاصفة", "أسد البلور",
  "حارس الغابة", "محارب الظلال", "سيد النجوم", "بطل العناصر", "ملك الصواعق",
  "فارس الشمس", "تنين الجليد", "سيد العواصف", "حامي الأساطير", "العنقاء الملكية",
  "أسد المجرة", "سيد الأكوان", "تنين النور", "ملك السيادة", "أسطورة القوة",
];
const STAGE_IMAGES: readonly string[] = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24, s25];

/** The single source of truth: the 25 stage definitions in order (stage 1 → 25). */
export const STRENGTH_STAGES: StrengthStageDef[] = STAGE_NAMES.map((name, i) => {
  const stage = i + 1;
  const min = (stage - 1) * STAGE_SPAN;
  const max = stage < STAGE_COUNT ? stage * STAGE_SPAN - 1 : STRENGTH_TOTAL_MAX;
  return { stage, name, min, max, image: STAGE_IMAGES[i], alt: "المرحلة " + stage + ": " + name };
});

/** Clamp any stage number into 1..25 and return its definition (never throws / never undefined). */
export function stageDef(stage: number | null | undefined): StrengthStageDef {
  const n = Number(stage);
  const clamped = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), STAGE_COUNT) : 1;
  return STRENGTH_STAGES[clamped - 1];
}

/** The 1-based stage for a Strength total (mirror of the server): stage 1 (0–79) … stage 25 (1920–2000). */
export function stageForPoints(total: number | null | undefined): number {
  const t = Math.min(STRENGTH_TOTAL_MAX, Math.max(0, Math.floor(Number(total) || 0)));
  return Math.min(Math.floor(t / STAGE_SPAN) + 1, STAGE_COUNT);
}

/** A coarse visual band (1..5) for the avatar frame color, so 25 stages map onto 5 restrained accent bands. */
export function stageBand(stage: number | null | undefined): number {
  return Math.min(5, Math.max(1, Math.ceil(stageDef(stage).stage / 5)));
}
