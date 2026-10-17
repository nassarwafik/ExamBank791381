// Phase 21H.0 — the Today hub's wording: every figure names its unit in correct Arabic agreement, and times read as a
// relative phrase («منذ 6 أيام») with the exact date kept for the tooltip and <time dateTime>. Relative times are measured
// from the summary's own generatedAt (the server clock that classified them), never from the viewer's clock.
import { arabicCount, type ArabicCountForms } from "../learning/arabicCount";

export const SUBMISSIONS: ArabicCountForms = { zero: "لا تسليمات", one: "تسليم واحد", two: "تسليمان", few: "{n} تسليمات", many: "{n} تسليمًا", other: "{n} تسليم" };
export const IN_ASSIGNMENTS: ArabicCountForms = { zero: "", one: "في واجب واحد", two: "في واجبين", few: "في {n} واجبات", many: "في {n} واجبًا", other: "في {n} واجب" };
/** «طالب واحد يعمل الآن» — the verb agrees with the count too. */
export const STUDENTS_WORKING: ArabicCountForms = { zero: "", one: "طالب واحد يعمل الآن", two: "طالبان يعملان الآن", few: "{n} طلاب يعملون الآن", many: "{n} طالبًا يعملون الآن", other: "{n} طالب يعملون الآن" };
export const STUDENTS: ArabicCountForms = { zero: "لا طلاب", one: "طالب واحد", two: "طالبان", few: "{n} طلاب", many: "{n} طالبًا", other: "{n} طالب" };
export const STAGES: ArabicCountForms = { zero: "لا مراحل", one: "مرحلة واحدة", two: "مرحلتان", few: "{n} مراحل", many: "{n} مرحلة", other: "{n} مرحلة" };
/** «من 23 طالبًا» — who the figure comes from. */
export const FROM_STUDENTS: ArabicCountForms = { zero: "", one: "من طالب واحد", two: "من طالبين", few: "من {n} طلاب", many: "من {n} طالبًا", other: "من {n} طالب" };
export const MESSAGES: ArabicCountForms = { zero: "لا رسائل", one: "رسالة واحدة", two: "رسالتان", few: "{n} رسائل", many: "{n} رسالة", other: "{n} رسالة" };
const MINUTES: ArabicCountForms = { zero: "", one: "دقيقة", two: "دقيقتين", few: "{n} دقائق", many: "{n} دقيقة", other: "{n} دقيقة" };
const HOURS: ArabicCountForms = { zero: "", one: "ساعة", two: "ساعتين", few: "{n} ساعات", many: "{n} ساعة", other: "{n} ساعة" };
const DAYS: ArabicCountForms = { zero: "", one: "يوم", two: "يومين", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" };

export const count = (n: number, forms: ArabicCountForms) => arabicCount(n, forms);
/** «9 تسليمات في واجبين» — a total and the number of assignments it spans. */
export const spread = (total: number, totalForms: ArabicCountForms, assignments: number) =>
  count(total, totalForms) + (assignments > 0 ? " " + count(assignments, IN_ASSIGNMENTS) : "");

const two = (n: number) => String(n).padStart(2, "0");
/** «2026-10-10 21:59» (local time) — the exact form, for tooltips; "" for an unreadable value. */
export function exactTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

/** «الآن» / «منذ 3 دقائق» / «منذ ساعتين» / «منذ 6 أيام» relative to `nowIso`; "" when either time is unreadable. A time
 *  slightly ahead of now (clock skew) reads as «الآن», never as a negative age. */
export function sinceText(iso: string, nowIso: string): string {
  const t = Date.parse(iso), now = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "";
  const min = Math.floor((now - t) / 60e3);
  if (min < 1) return "الآن";                                  // also a time ahead of now (skew)
  if (min < 60) return "منذ " + count(min, MINUTES);
  const h = Math.floor(min / 60);
  if (h < 24) return "منذ " + count(h, HOURS);
  return "منذ " + count(Math.floor(h / 24), DAYS);
}

/** «خلال 5 ساعات» / «خلال يومين» until `iso` from `nowIso`; «الآن» when it is (about) due; "" when unreadable. */
export function untilText(iso: string, nowIso: string): string {
  const t = Date.parse(iso), now = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "";
  const min = Math.floor((t - now) / 60e3);
  if (min < 1) return "الآن";
  if (min < 60) return "خلال " + count(min, MINUTES);
  const h = Math.floor(min / 60);
  if (h < 24) return "خلال " + count(h, HOURS);
  return "خلال " + count(Math.floor(h / 24), DAYS);
}
