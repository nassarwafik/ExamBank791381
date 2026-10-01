// Phase 17D-A — teacher-facing labels of the server-derived AGGREGATE coding grading status (gradebook rows) and of the bulk
// retry summary. Pure: the server decides the counts ({ pending, retryable, stale }); the UI never shows a raw technical code.
import type { CodingGradingStatus } from "./types";

export type CodingBadge = { tone: "info" | "warn"; label: string };

/** Something needs a teacher retry (a retryable or a stale dispatched target). */
export function needsCodingRetry(s?: CodingGradingStatus | null): boolean {
  return !!s && (s.retryable > 0 || s.stale > 0);
}

/** «التصحيح البرمجي يحتاج إعادة محاولة» wins over «تصحيح برمجي جارٍ»; nothing open → null. */
export function codingStatusBadge(s?: CodingGradingStatus | null): CodingBadge | null {
  if (!s) return null;
  if (needsCodingRetry(s)) return { tone: "warn", label: "التصحيح البرمجي يحتاج إعادة محاولة" };
  if (s.pending > 0) return { tone: "info", label: "تصحيح برمجي جارٍ" };
  return null;
}

/** The notice shown after a bulk retry request. */
export function bulkRetryNotice(r: { scheduled: number; hasMore: boolean }): string {
  if (!(r.scheduled > 0)) return r.hasMore
    ? "لم تُجدول أسئلة في هذه الدفعة، وما زالت هناك أسئلة أخرى للفحص؛ أعد تنفيذ الإجراء لمتابعتها."   // bounded scan: more remains
    : "لا توجد أسئلة برمجية تحتاج إلى إعادة المحاولة الآن.";
  const base = "تمت جدولة إعادة المحاولة لـ " + r.scheduled + " أسئلة برمجية.";
  return r.hasMore ? base + " ما زالت هناك أسئلة أخرى؛ أعد تنفيذ الإجراء لمتابعتها." : base;
}
