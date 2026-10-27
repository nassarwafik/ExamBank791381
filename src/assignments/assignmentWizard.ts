// Phase 21G.6 — the assignment creation wizard (pure): its steps, what blocks each one, and the review summary. The composer
// walks the teacher through content → classes → timing → rules → review; the server stays the authority on every field (the same
// create request, once per chosen class — D4, «one copy per class»). A step is blocked only by what would make that request fail
// or be wrong; warnings (a deadline already past) never block.
import { windowBlocks, type WindowIssue } from "./assignmentWindow";
import { attemptPolicyLabel } from "./attemptPolicy";
import { resultsReleaseLabel } from "./resultsRelease";
import { latePolicyLabel, type LatePolicy } from "./latePolicy";

export type WizardStep = "content" | "classes" | "timing" | "rules" | "review";
export const WIZARD_STEPS: ReadonlyArray<{ key: WizardStep; label: string; hint: string }> = [
  { key: "content", label: "المحتوى", hint: "اختر الامتحان، وعنوان الواجب وتعليماته." },
  { key: "classes", label: "الصفوف", hint: "اختر صفًا أو أكثر؛ تُنشأ نسخة مستقلة لكل صف." },
  { key: "timing", label: "المواعيد", hint: "موعد الفتح وآخر موعد وعدد المحاولات ومدتها." },
  { key: "rules", label: "القواعد", hint: "طريقة المحاولة، وموعد ظهور النتائج، والنشر." },
  { key: "review", label: "المراجعة", hint: "راجع كل شيء ثم أنشئ الواجب." }
];
const ORDER = WIZARD_STEPS.map(s => s.key);
export const stepIndex = (s: WizardStep) => ORDER.indexOf(s);

export type WizardInput = {
  hasContent: boolean;          // a chosen exam with at least one question
  contentLoading: boolean;
  title: string;
  classIds: readonly string[];
  windowIssues: readonly WindowIssue[];
};

/** What blocks leaving `step` (empty = free to go on). Messages are the teacher's words, shown under the stepper. */
export function stepIssues(step: WizardStep, w: WizardInput): string[] {
  const out: string[] = [];
  if (step === "content") {
    if (w.contentLoading) out.push("جارٍ فتح الامتحان…");
    else if (!w.hasContent) out.push("اختر محتوى الواجب: امتحانًا من امتحاناتي أو عنصرًا من المكتبة.");
    if (!w.title.trim()) out.push("عنوان الواجب مطلوب.");
  } else if (step === "classes") {
    if (!w.classIds.length) out.push("اختر صفًا واحدًا على الأقل.");
  } else if (step === "timing") {
    for (const i of w.windowIssues) if (i.blocking) out.push(i.message);
  }
  return out;
}

/** The first step that is blocked (the review's «أنشئ» is allowed only when there is none). */
export function firstBlockedStep(w: WizardInput): WizardStep | null {
  for (const s of ORDER) if (s !== "review" && stepIssues(s, w).length) return s;
  return null;
}
/** Whether the teacher may move from the current step to `to`: backwards always; forwards only through unblocked steps. */
export function canReachStep(current: WizardStep, to: WizardStep, w: WizardInput): boolean {
  const from = stepIndex(current), target = stepIndex(to);
  if (target <= from) return true;
  for (let i = from; i < target; i++) if (stepIssues(ORDER[i], w).length) return false;
  return true;
}

/** Arabic count of assignment copies (one per class). */
export const copiesCount = (n: number) => (n === 1 ? "نسخة واحدة" : n === 2 ? "نسختان" : n >= 3 && n <= 10 ? n + " نسخ" : n + " نسخة");

export type ReviewRow = { label: string; value: string };
export type ReviewInput = WizardInput & {
  contentTitle: string; questionCount: number; classNames: readonly string[];
  openAt: string; dueAt: string; maxAttempts: number; durationMinutes: number; attemptPolicy: string; resultsRelease: string; publish: boolean;
  /** D5 (item 10) — the late policy (null = none); omitted by callers that predate it, and then not listed. */
  latePolicy?: LatePolicy | null;
  fmt: (v: string) => string;
};
/** The review step's rows: exactly what the create request will carry, per copy. */
export function reviewRows(r: ReviewInput): ReviewRow[] {
  return [
    { label: "المحتوى", value: (r.contentTitle || "—") + " · " + r.questionCount + " سؤال" },
    { label: "العنوان", value: r.title.trim() || "—" },
    { label: "الصفوف", value: r.classNames.length ? r.classNames.join("، ") + " (" + copiesCount(r.classNames.length) + ")" : "—" },
    { label: "يفتح", value: r.openAt ? r.fmt(r.openAt) : "فورًا" },
    { label: "آخر موعد", value: r.dueAt ? r.fmt(r.dueAt) : "بدون موعد" },
    { label: "المحاولات", value: String(r.maxAttempts) },
    { label: "مدة المحاولة", value: r.durationMinutes ? r.durationMinutes + " دقيقة" : "بدون مؤقت" },
    { label: "طريقة المحاولة", value: attemptPolicyLabel(r.attemptPolicy) },
    { label: "إظهار النتائج", value: resultsReleaseLabel(r.resultsRelease) },
    ...(r.latePolicy !== undefined ? [{ label: "التسليم المتأخر", value: latePolicyLabel(r.latePolicy) }] : []),
    { label: "الحالة بعد الإنشاء", value: r.publish ? "منشور: يراه الطلاب فورًا" : "مسودة: لا يراها الطلاب حتى تنشرها" }
  ];
}
export const hasBlockingWindow = (issues: readonly WindowIssue[]) => windowBlocks(issues);
