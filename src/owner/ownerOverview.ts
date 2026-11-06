import type { AccessMode, LegacyClass, ManagedSchool, ManagedTeacher, ReadinessTeacher } from "./ownerApi";

/**
 * UX-O1 — «نظرة عامة» of the Owner Console (design docs/enterprise-ux-owner-console-o1.md). PRESENTATION ONLY: every number and every
 * «يحتاج انتباهك» line is derived here from answers the console already reads (the teachers list, the schools, the access mode and
 * its readiness, the legacy classes). Nothing new is asked of the server. A source that could not be read is `null`: its numbers
 * show «—» and the lines that depend on it are left out, never guessed. The rules mirror the sections they point to:
 *   - a trial «ending soon» is the server's own `trial.endingSoon` (the same window as «المعلمون»);
 *   - a teacher «without a package» is the readiness rule of «الصلاحيات» (not suspended, no assigned access, no legacy default).
 */

export type OverviewSources = {
  teachers: ManagedTeacher[] | null;
  schools: ManagedSchool[] | null;
  mode: AccessMode | null;
  readiness: { ready: boolean; teachers: ReadinessTeacher[] } | null;
  legacyClasses: LegacyClass[] | null;
};

export type OverviewSection = "teachers" | "access" | "schools" | "legacy";
export type AttentionItem = { id: string; tone: "info" | "warn" | "danger" | "neutral" | "primary"; title: string; detail: string; action: string; section: OverviewSection };
export type OverviewNumbers = {
  total: number | null; active: number | null; invited: number | null; suspended: number | null;
  trialsEndingSoon: number | null; trialsEnded: number | null; schools: number | null; withoutSchool: number | null;
  mode: AccessMode | null; ready: boolean | null;
};

export const MODE_LABEL: Record<AccessMode, string> = { legacy: "الوضع القديم", observe: "مراقبة", enforce: "تطبيق", invalid: "غير صالح" };

const names = (list: { displayName: string }[], max = 3) => {
  const shown = list.slice(0, max).map(t => t.displayName).join("، ");
  return list.length > max ? shown + " و" + (list.length - max) + " غيرهم" : shown;
};
const count = (n: number, one: string, two: string, many: string) => (n === 1 ? one : n === 2 ? two : n + " " + many);

export function overviewNumbers(s: OverviewSources): OverviewNumbers {
  const t = s.teachers;
  return {
    total: t ? t.length : null,
    active: t ? t.filter(x => x.status === "active").length : null,
    invited: t ? t.filter(x => x.status === "invited").length : null,
    suspended: t ? t.filter(x => x.status === "suspended").length : null,
    trialsEndingSoon: t ? t.filter(x => x.trial && !x.trial.ended && x.trial.endingSoon).length : null,
    trialsEnded: t ? t.filter(x => x.trial && x.trial.ended && x.status !== "suspended").length : null,
    schools: s.schools ? s.schools.length : null,
    withoutSchool: t ? t.filter(x => x.status !== "suspended" && !x.schoolId).length : null,
    mode: s.mode,
    ready: s.readiness ? s.readiness.ready : null
  };
}

/** The «يحتاج انتباهك» lines, in the order the owner should act on them. Only what applies; a source that is null adds nothing. */
export function attentionItems(s: OverviewSources): AttentionItem[] {
  const out: AttentionItem[] = [];
  const t = s.teachers || [];
  if (s.teachers) {
    const ended = t.filter(x => x.trial && x.trial.ended && x.status !== "suspended");
    if (ended.length) out.push({ id: "trials-ended", tone: "danger", title: count(ended.length, "حساب تجريبي انتهى", "حسابان تجريبيان انتهيا", "حسابات تجريبية انتهت"), detail: names(ended) + " · لا يدخل أصحابها حتى تمدّدها أو تحوّلها إلى دائمة", action: "تمديد أو تحويل", section: "teachers" });
    const soon = t.filter(x => x.trial && !x.trial.ended && x.trial.endingSoon);
    if (soon.length) out.push({ id: "trials-soon", tone: "warn", title: count(soon.length, "حساب تجريبي ينتهي خلال أسبوع", "حسابان تجريبيان ينتهيان خلال أسبوع", "حسابات تجريبية تنتهي خلال أسبوع"), detail: names(soon) + " · بعدها يتوقف الدخول وتبقى البيانات", action: "تمديد أو تحويل", section: "teachers" });
    const waiting = t.filter(x => x.status === "invited");
    if (waiting.length) out.push({ id: "invited", tone: "info", title: count(waiting.length, "دعوة لم تُقبل بعد", "دعوتان لم تُقبلا بعد", "دعوات لم تُقبل بعد"), detail: names(waiting) + (waiting.some(x => !x.invitation) ? " · انتهت مهلة بعض الروابط: أرسل رابطًا جديدًا" : ""), action: "عرض المعلمين", section: "teachers" });
  }
  if (s.readiness) {
    const unassigned = s.readiness.teachers.filter(x => x.status !== "suspended" && !x.access && x.defaultAccess !== "legacy-full");
    if (unassigned.length) out.push({ id: "unassigned", tone: "danger", title: count(unassigned.length, "معلم بلا حزمة صلاحيات", "معلمان بلا حزمة صلاحيات", "معلمين بلا حزمة صلاحيات"), detail: names(unassigned) + " · يُمنعون من كل شيء حين تفعّل التطبيق", action: "اختيار حزمة", section: "teachers" });
  }
  if (s.teachers && s.schools && s.schools.length > 0) {
    const noSchool = t.filter(x => x.status !== "suspended" && !x.schoolId);
    if (noSchool.length) out.push({ id: "no-school", tone: "neutral", title: count(noSchool.length, "معلم بلا مدرسة", "معلمان بلا مدرسة", "معلمين بلا مدرسة"), detail: names(noSchool) + " · اسم المدرسة وشعارها لا يظهران في صفحته", action: "ربط بمدرسة", section: "schools" });
  }
  if (s.legacyClasses) {
    const open = s.legacyClasses.filter(c => !c.decision);
    if (open.length) out.push({ id: "legacy", tone: "warn", title: count(open.length, "صف قديم بلا مالك", "صفان قديمان بلا مالك", "صفوف قديمة بلا مالك"), detail: "تحتاج قرارك: إسنادها إلى معلم، أو إبقاؤها مشتركة، أو أرشفتها", action: "البيانات القديمة", section: "legacy" });
  }
  if (s.mode === "observe" && s.readiness && s.readiness.ready) {
    out.push({ id: "can-enforce", tone: "primary", title: "الصلاحيات في وضع المراقبة", detail: "كل معلم نشط له حزمة صلاحيات · يمكن تفعيل التطبيق متى شئت", action: "مراجعة الصلاحيات", section: "access" });
  }
  return out;
}
