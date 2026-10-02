// Phase 17E-D — the shared FRONTEND vocabulary of the teacher coding evidence. The server is the ONLY authority
// (api/src/lib/coding/official-grading.js teacherCodingEvidence → review question `codingEvidence`; teacherCodingSummary →
// gradebook `codingEvidenceSummary`); this module only VALIDATES the shape it receives (anything unexpected degrades to a safe,
// "incomplete" value — never a crash, never a guessed state) and WORDS it. It never computes a pass / fail, an automatic score,
// an effective score, a percentage or a revision: those are displayed exactly as the server sent them.
import { CODING_COMPARATORS, codingLanguage } from "../codingQuestion";
import { isUnexpectedStatus, trackingSuffix } from "../lib/requestTrace";

export type EvidenceStatus = "queued" | "processing" | "retrying" | "delayed" | "complete" | "superseded" | "unsupported" | "unknown";
export type CaseOutcome = "passed" | "wrong-output" | "runtime-error" | "timeout" | "output-limit" | "compile-error" | "not-run" | "unknown";
export type TeacherCodingCase = { testId: string; title: string; weight: number | null; outcome: CaseOutcome; durationMs: number | null; expectedOutput: string; actualPreview?: string; stderrPreview?: string };
export type TeacherCodingEvidence = {
  status: EvidenceStatus; automaticStatus: EvidenceStatus; revision: number | null; resultRevision: number | null; resultCurrent: boolean;
  language: string | null; scoringPolicy: "proportional" | "allOrNothing"; comparator: string | null; testCount: number; maxMarks: number | null;
  automaticScore: number | null; passedCount: number | null; passedWeight: number | null; totalWeight: number | null;
  outcome: "graded" | "no-answer" | "compile-error" | null; completedAt: string | null; compilePreview?: string;
  override: { active: boolean; score: number | null }; effectiveScore: number | null; recovery: "none" | "automatic" | "manual" | "delayed";
  technicalCode: string | null; incomplete: boolean; cases: TeacherCodingCase[];
};
export type CodingEvidenceSummary = { status: "queued" | "processing" | "retrying" | "delayed" | "complete" | "superseded"; openTargets: number; delayedTargets: number; supersededTargets: number };

const STATUSES: readonly EvidenceStatus[] = ["queued", "processing", "retrying", "delayed", "complete", "superseded", "unsupported", "unknown"];
const OUTCOMES: readonly CaseOutcome[] = ["passed", "wrong-output", "runtime-error", "timeout", "output-limit", "compile-error", "not-run", "unknown"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : null);

/** Validates the server evidence (contract 1). Unknown / malformed input → a safe "unknown" + incomplete evidence; null stays null. */
export function normalizeEvidence(raw: unknown): TeacherCodingEvidence | null {
  if (raw === null || raw === undefined) return null;
  const e = isObj(raw) ? raw : {};
  let incomplete = !isObj(raw) || e.contract !== 1 || e.incomplete === true;
  const status = oneOf(e.status, STATUSES) ?? (incomplete = true, "unknown");
  const automaticStatus = oneOf(e.automaticStatus, STATUSES) ?? status;
  const cases: TeacherCodingCase[] = [];
  if (Array.isArray(e.cases)) {
    for (const c of e.cases.slice(0, 50)) {
      if (!isObj(c) || typeof c.testId !== "string") { incomplete = true; continue; }
      const out: TeacherCodingCase = { testId: c.testId, title: str(c.title) ?? "", weight: num(c.weight), outcome: oneOf(c.outcome, OUTCOMES) ?? "unknown", durationMs: num(c.durationMs), expectedOutput: str(c.expectedOutput) ?? "" };
      if (typeof c.actualPreview === "string") out.actualPreview = c.actualPreview;
      if (typeof c.stderrPreview === "string") out.stderrPreview = c.stderrPreview;
      cases.push(out);
    }
  } else if (e.cases !== undefined) incomplete = true;
  const override = isObj(e.override) ? { active: e.override.active === true, score: num(e.override.score) } : { active: false, score: null };
  const recovery = isObj(e.recovery) ? oneOf(e.recovery.state, ["none", "automatic", "manual", "delayed"] as const) ?? "none" : "none";
  return {
    status, automaticStatus, revision: num(e.revision), resultRevision: num(e.resultRevision), resultCurrent: e.resultCurrent === true,
    language: str(e.language), scoringPolicy: e.scoringPolicy === "allOrNothing" ? "allOrNothing" : "proportional", comparator: str(e.comparator),
    testCount: num(e.testCount) ?? cases.length, maxMarks: num(e.maxMarks), automaticScore: num(e.automaticScore), passedCount: num(e.passedCount),
    passedWeight: num(e.passedWeight), totalWeight: num(e.totalWeight), outcome: oneOf(e.outcome, ["graded", "no-answer", "compile-error"] as const),
    completedAt: str(e.completedAt), ...(typeof e.compilePreview === "string" ? { compilePreview: e.compilePreview } : {}),
    override, effectiveScore: num(e.effectiveScore), recovery, technicalCode: typeof e.technicalCode === "string" && /^[A-Z][A-Z0-9_]{0,47}$/.test(e.technicalCode) ? e.technicalCode : null,
    incomplete, cases
  };
}

/** The status line of the panel. A historical result while a newer revision runs is NEVER called complete. */
export function evidenceStatusLabel(e: TeacherCodingEvidence): string {
  if (e.status === "superseded") return "تم اعتماد علامة المعلم";
  if (e.status === "unsupported") return "نوع السؤال غير مدعوم للتصحيح الآلي في هذا الإصدار";
  if (e.status === "unknown") return "بيانات التصحيح غير مكتملة.";
  const historical = e.automaticScore !== null && !e.resultCurrent && e.resultRevision !== null && e.revision !== null && e.resultRevision < e.revision;
  if (historical && e.status !== "complete") return "نتيجة سابقة — إعادة التصحيح جارية";
  return ({ queued: "بانتظار بدء التصحيح الآلي", processing: "جارٍ التصحيح الآلي", retrying: "تعذر التصحيح مؤقتًا — إعادة المحاولة التلقائية جارية", delayed: "توقفت المحاولات التلقائية — بحاجة لإعادة محاولة", complete: "اكتمل التصحيح الآلي" } as Record<string, string>)[e.status] ?? "بيانات التصحيح غير مكتملة.";
}
export const evidenceTone = (e: TeacherCodingEvidence): "success" | "info" | "warn" | "neutral" =>
  e.status === "complete" ? "success" : e.status === "superseded" ? "neutral" : e.status === "retrying" || e.status === "delayed" || e.status === "unknown" || e.status === "unsupported" ? "warn" : "info";
export const isOpenStatus = (s: EvidenceStatus) => s === "queued" || s === "processing" || s === "retrying" || s === "delayed";

export const SUPERSEDED_NOTE = "توجد عملية تصحيح آلي أقدم أو جارية لا تؤثر في العلامة المعتمدة حاليًا.";
export const TECHNICAL_MESSAGE = "تعذر إكمال التصحيح الآلي لأسباب تقنية.";
export const NOT_ZERO_NOTE = "العلامة الرسمية لم تُحتسب بعد ولا تُعدّ صفرًا؛ يمكنك إعادة المحاولة أو إدخال علامة يدوية.";
export const NO_ANSWER_LABEL = "لم يرسل الطالب كودًا قابلًا للتصحيح.";
export const INCOMPLETE_LABEL = "بيانات التصحيح غير مكتملة.";
export const RETRY_LABEL = "إعادة محاولة التصحيح";
export const FORCE_LABEL = "إعادة التصحيح بإصدار جديد";
export const RETRY_HELP = "إعادة المحاولة تستخدم نفس نسخة التصحيح.";
export const FORCE_HELP = "إعادة التصحيح تنشئ نسخة تصحيح جديدة وتلغي صلاحية النتائج الأقدم عند وصولها.";

const TECHNICAL_LABEL: Record<string, string> = {
  EXECUTION_UNAVAILABLE: "خدمة التنفيذ غير متاحة حاليًا",
  EXECUTION_FAILED: "تعذر الاتصال بخدمة التنفيذ",
  RUNNER_BUSY: "خدمة التنفيذ مشغولة مؤقتًا",
  GRADING_UNAVAILABLE: "خدمة التصحيح غير متاحة حاليًا",
  LANGUAGE_UNAVAILABLE: "بيئة اللغة غير متاحة",
  RUNNER_UNAUTHORIZED: "تعذر التحقق من خدمة التنفيذ",
  RUNNER_FAILED: "تعذر إكمال التنفيذ على خدمة التنفيذ",
  AUTHORITY_CHANGED: "تغيرت بيانات التصحيح المعتمدة",
  QUESTION_INVALID: "تعذر التحقق من بيانات السؤال المنشور",
  JOB_ID_CONFLICT: "تعارض في نسخة التصحيح",
  STALE_REVISION: "تعارض في نسخة التصحيح",
  SUITE_INCOMPLETE: "نتيجة التنفيذ وصلت غير مكتملة",
  EVIDENCE_INVALID: "نتيجة التنفيذ وصلت غير مكتملة",
  CASE_INTERNAL_ERROR: "خطأ داخلي في خدمة التنفيذ"
};
/** The safe teacher label of a technical code; an unknown code never becomes the primary message. */
export const technicalLabel = (code: string | null): string => (code && TECHNICAL_LABEL[code]) || TECHNICAL_MESSAGE;

export const CASE_OUTCOME_LABEL: Record<CaseOutcome, string> = { passed: "ناجح", "wrong-output": "مخرجات غير مطابقة", "runtime-error": "خطأ أثناء التشغيل", timeout: "تجاوز الزمن المسموح", "output-limit": "تجاوز حد المخرجات", "compile-error": "خطأ في الترجمة", "not-run": "لم يُنفَّذ", unknown: "نتيجة غير معروفة" };
export const SCORING_POLICY_LABEL = { proportional: "نسبي حسب الاختبارات", allOrNothing: "الكل أو لا شيء" } as const;
const COMPARATOR_LABEL: Record<string, string> = { exact: "مطابقة حرفية", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر", normalizeWhitespace: "توحيد المسافات" };
export const comparatorLabel = (c: string | null): string => (c && (CODING_COMPARATORS as readonly string[]).includes(c) ? COMPARATOR_LABEL[c] : "—");
/** Canonical registry label (Python / Java / C#); an unknown key is shown as «—», never guessed. */
export const languageLabel = (key: string | null): string => (key ? codingLanguage(key)?.label ?? "—" : "—");
export const RECOVERY_LABEL = { none: "", automatic: "تجري إعادة المحاولة تلقائيًا", manual: "أُعيدت المحاولة بطلب من المعلم", delayed: "توقفت المحاولات التلقائية" } as const;

/** Number shown as the server sent it (Western digits, no recomputation, no rounding beyond the server's). */
export const fmtScore = (n: number | null): string => (n === null ? "—" : String(n));

/** A safe Arabic message for a failed teacher action (never a raw server body, stack or code). */
export function actionErrorMessage(status: number, code: string, requestId = ""): string {
  let msg: string;
  if (status === 0) msg = "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.";
  else if (status === 401) msg = "انتهت جلسة المعلم. سجّل الدخول من جديد.";
  else if (status === 403) msg = "ليست لديك صلاحية لتنفيذ هذا الإجراء.";
  else if (status === 404) msg = "لم يعد هذا التصحيح موجودًا لهذه المحاولة؛ تم تحديث البيانات.";
  else if (status === 409 && code === "ALREADY_COMPLETE") msg = "اكتمل هذا التصحيح بالفعل؛ تم تحديث البيانات.";
  else if (status === 409 && code === "QUESTION_UNSUPPORTED") msg = "لا يمكن إعادة تصحيح هذا السؤال آليًا لأن بياناته غير مدعومة.";
  else if (status === 409) msg = "تغيرت حالة التصحيح أثناء الطلب؛ تم تحديث البيانات.";
  else if (status === 400) msg = "تعذر تنفيذ الطلب: بيانات غير صالحة.";
  else if (status === 429) msg = "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.";
  else msg = "خدمة التصحيح غير متاحة حاليًا. حاول لاحقًا.";
  return isUnexpectedStatus(status) ? msg + trackingSuffix(requestId) : msg;
}

/** The compact gradebook badge of the server summary (no per-case detail, no technical code). */
export function codingSummaryBadge(s: CodingEvidenceSummary | null | undefined): { tone: "success" | "info" | "warn" | "neutral"; label: string } | null {
  if (!s || !isObj(s)) return null;
  switch (s.status) {
    case "complete": return { tone: "success", label: "التصحيح البرمجي مكتمل" };
    case "queued": case "processing": return { tone: "info", label: "التصحيح البرمجي جارٍ" };
    case "retrying": return { tone: "warn", label: "إعادة المحاولة جارية" };
    case "delayed": return { tone: "warn", label: "تأخير تقني" };
    case "superseded": return { tone: "neutral", label: "علامة المعلم معتمدة" };
    default: return null;
  }
}
