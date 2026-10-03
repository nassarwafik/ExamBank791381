// Phase 17E-C — shared FRONTEND vocabulary of the student-safe automatic coding-grading status. The server is the ONLY authority
// (api/src/lib/coding/official-grading.js studentCodingGradingStatus → result.autoGradingStatus, next to the legacy autoGradingPending); this module only validates and
// words it. It is a SECOND, independent dimension next to gradingStatus (src/gradingStatus.ts): "automatic coding grading is
// complete" never means "the mark is final" — finality is still resolveGradingStatus / scoreLabel only.
// Never derived from score, percentage, finalized, elapsed time, source code, a failed request or a local timer.
export type StudentCodingGradingStatus = "queued" | "processing" | "retrying" | "delayed" | "complete";

const VALID: readonly StudentCodingGradingStatus[] = ["queued", "processing", "retrying", "delayed", "complete"];

/** The server value when it is one of the known states; anything else (absent, older server, unknown) → undefined. */
export function codingGradingStatusOf(result: { autoGradingStatus?: unknown } | null | undefined): StudentCodingGradingStatus | undefined {
  const v = result ? result.autoGradingStatus : undefined;
  return typeof v === "string" && (VALID as readonly string[]).includes(v) ? (v as StudentCodingGradingStatus) : undefined;
}

/** Automatic grading has not finished (the result may still change). */
export const isCodingGradingOpen = (s: StudentCodingGradingStatus | undefined): boolean => !!s && s !== "complete";

// Phase 17F-B1 — TECHNICAL GRADING DELAY ≠ ACADEMIC ZERO. While the SERVER says official coding grading is still open (an open
// autoGradingStatus, or the legacy autoGradingPending boolean of an older payload), the headline mark is WITHHELD: the big
// number shows a neutral dash and the percentage slot shows a pending label — never "0 / 30", never "0%". This is the ONE
// resolver every student surface uses; it reads only the server's aggregate, never the score, percentage or finality.
// A real zero (grading complete, a teacher override — the server omits the open state for overridden targets — or no coding
// question at all) is displayed exactly like any other mark.
export const PENDING_SCORE_DASH = "—";
export const PENDING_SCORE_LABEL = "بانتظار التصحيح الآلي";
export function scoreWithheld(result: { autoGradingStatus?: unknown; autoGradingPending?: unknown } | null | undefined): boolean {
  if (!result || typeof result !== "object") return false;
  return isCodingGradingOpen(codingGradingStatusOf(result)) || result.autoGradingPending === true;
}

/** Whether the result screen should keep re-reading the server: only while grading still progresses AUTOMATICALLY. A "delayed"
 *  status (automatic recovery exhausted) changes only through a teacher, so it is refreshed on return / visibility, not polled. */
export const shouldPollCodingGrading = (s: StudentCodingGradingStatus | undefined): boolean => s === "queued" || s === "processing" || s === "retrying";

const TITLE: Record<StudentCodingGradingStatus, string> = {
  queued: "بانتظار بدء التصحيح الآلي لأسئلة البرمجة.",
  processing: "جارٍ التصحيح الآلي لأسئلة البرمجة.",
  retrying: "يتم استكمال التصحيح الآلي بعد تأخير تقني مؤقت.",
  delayed: "تعذّر إكمال التصحيح الآلي حاليًا، وستبقى النتيجة قيد المراجعة.",
  complete: "اكتمل التصحيح الآلي لأسئلة البرمجة."
};
const DETAIL: Record<StudentCodingGradingStatus, string> = {
  queued: "يمكنك مغادرة الصفحة بأمان بعد التسليم؛ ستُحفظ النتيجة في حسابك عند اكتمال التصحيح.",
  processing: "يمكنك مغادرة هذه الصفحة؛ ستُحفظ النتيجة في حسابك عند اكتمال التصحيح.",
  retrying: "لا تحتاج إلى إعادة تسليم الامتحان، ويمكنك مغادرة الصفحة بأمان؛ ستُحفظ النتيجة في حسابك.",
  delayed: "لا تحتاج إلى إعادة تسليم الامتحان.",
  complete: ""
};
/** The first line while nothing has started yet: the SUBMISSION itself is complete. */
export const CODING_GRADING_SUBMITTED = "تم تسليم الامتحان بنجاح.";
export const codingGradingTitle = (s: StudentCodingGradingStatus): string => TITLE[s];
export const codingGradingDetail = (s: StudentCodingGradingStatus): string => DETAIL[s];
/** Complete automatic grading while the canonical mark is still provisional (e.g. another question awaits the teacher). */
export const CODING_COMPLETE_PROVISIONAL = "العلامة ما زالت مؤقتة بانتظار مراجعة المعلم.";
/** The foreground polling window ended — grading itself continues on the server. */
export const CODING_GRADING_COME_BACK = "لا يزال التصحيح جاريًا. يمكنك مغادرة الصفحة والعودة لاحقًا لرؤية النتيجة.";
/** A status REFRESH failed (network / server) — never a grading failure and never "retrying". */
export const CODING_GRADING_REFRESH_FAILED = "تعذّر تحديث حالة التصحيح الآن. قد يستمر التصحيح على الخادم حتى عند انقطاع اتصال جهازك.";
/** Compact dashboard-card wording while automatic grading is open. */
export const CODING_GRADING_CARD_OPEN = "التصحيح الآلي لأسئلة البرمجة جارٍ";

// Polling policy (see useCodingGradingPoll): ~3 s for the first 30 s, ~5 s until 2 min, then ~10 s; the foreground window ends
// after 5 min (a visibility return / reconnect / reopening the assignment starts a new one). Worst case ≈ 44 reads per window.
export const CODING_POLL_WINDOW_MS = 5 * 60 * 1000;
export function codingPollDelayMs(elapsedMs: number): number {
  return elapsedMs < 30 * 1000 ? 3000 : elapsedMs < 120 * 1000 ? 5000 : 10000;
}
