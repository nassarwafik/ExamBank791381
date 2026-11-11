// Phase R-5c — «طلاب يحتاجون متابعة»: the shapes the API sends and the WORDS for them. The server decides who is listed and why
// (api/src/lib/reports/follow-up.js, the owner's criteria); nothing here computes a reason, a threshold or a number — it only
// says what was sent. A reason code this client does not know is not worded at all (it is never guessed into another reason).

export type FollowUpReason =
  | { code: "missing"; count: number }
  | { code: "belowClass"; gap: number }
  | { code: "project"; projectCode: string; title: string; reasons: string[] };
export type FollowUpStudent = { studentId: string; displayName: string; average: number | null; missing: number; pending: number; reasons: FollowUpReason[] };
export type FollowUpCriteria = { missingAtLeast: number; belowClassBy: number };
export type FollowUp = { criteria: FollowUpCriteria; classAverage: number | null; students: FollowUpStudent[] };

/** «تقييمين» / «3 تقييمات» / «11 تقييمًا» — an Arabic counted noun (Western digits). */
export function assessmentsCount(n: number): string {
  if (n === 1) return "تقييمًا واحدًا";
  if (n === 2) return "تقييمين";
  return n >= 3 && n <= 10 ? n + " تقييمات" : n + " تقييمًا";
}
/** «طالب واحد يحتاج متابعة» / «طالبان يحتاجان متابعة» / «3 طلاب يحتاجون متابعة» / «11 طالبًا يحتاجون متابعة». */
export function studentsNeedFollowUp(n: number): string {
  if (n === 1) return "طالب واحد يحتاج متابعة";
  if (n === 2) return "طالبان يحتاجان متابعة";
  return (n >= 3 && n <= 10 ? n + " طلاب" : n + " طالبًا") + " يحتاجون متابعة";
}

/** One reason in words, with its own number; null for a reason this client does not know or one that is malformed. */
export function reasonText(r: FollowUpReason | { code?: unknown }): string | null {
  const x = r as { code?: unknown; count?: unknown; gap?: unknown; title?: unknown; reasons?: unknown };
  if (x.code === "missing" && typeof x.count === "number" && Number.isFinite(x.count)) return "لم يسلّم " + assessmentsCount(x.count);
  if (x.code === "belowClass" && typeof x.gap === "number" && Number.isFinite(x.gap)) return "أقل من متوسط الصف بـ " + String(Math.round(x.gap * 10) / 10) + " نقطة";
  if (x.code === "project" && Array.isArray(x.reasons) && x.reasons.length) return (typeof x.title === "string" && x.title ? x.title + ": " : "") + x.reasons.map(String).join("، ");
  return null;
}

/** The criteria in one sentence, with the numbers the server used. */
export function criteriaText(c: FollowUpCriteria, classAverage: number | null): string {
  return "يظهر هنا من لم يسلّم " + assessmentsCount(c.missingAtLeast) + " أو أكثر من تقييمات الفترة، أو كان متوسط نتائجه المصحَّحة أقل من متوسط الصف"
    + (classAverage === null ? "" : " (" + Math.round(classAverage) + "%)") + " بـ " + c.belowClassBy + " نقطة أو أكثر، أو تأخّر في مشروع للصف بحسب إعداد الصف. "
    + "ما زال بانتظار التصحيح لا يُحسب على الطالب، وليست هذه علامة نجاح أو رسوب.";
}
