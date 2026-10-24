// Phase G3 — «سجلّ التغييرات»: the words for one stage's change history, from the events `resource=stage-history` returns
// (the server's values; who is «أنت» / «معلم آخر» / «الطالب», never an account id; a note's text is never in the history).
import type { StageStatus } from "./types";
import { normalizeStageStatus, stageStatusLabel } from "./teacherPresentation";
import { fmtContribution } from "./projectPerformance";

/** Phase G3 — one event of a stage's change history (`resource=stage-history`), newest first. */
export type StageHistoryEvent = { eventId: string; type: "status" | "score" | "note"; createdAt: string; by: "you" | "teacher" | "student"; fromStatus?: StageStatus; toStatus?: StageStatus; verified?: boolean; fromScore?: number | null; toScore?: number | null };
export type StageHistoryState = { stageId: string; loading: boolean; error: string; events: StageHistoryEvent[] };
export const BY_LABEL: Record<StageHistoryEvent["by"], string> = { you: "أنت", teacher: "معلم آخر", student: "الطالب" };
const scoreText = (n: number | null | undefined) => (typeof n === "number" ? fmtContribution(n) + " / 100" : "");
/** What a history event changed, in words (the server's values; a note's text is never stored in the history). */
export function stageHistoryText(e: StageHistoryEvent): string {
  if (e.type === "score") {
    if (typeof e.toScore !== "number") return "مُسحت العلامة" + (typeof e.fromScore === "number" ? " (كانت " + scoreText(e.fromScore) + ")" : "");
    return typeof e.fromScore === "number" ? "تغيّرت العلامة من " + scoreText(e.fromScore) + " إلى " + scoreText(e.toScore) : "وُضعت العلامة " + scoreText(e.toScore);
  }
  if (e.type === "status") {
    if (e.by === "student") return e.toStatus === "approved" ? "حدّدها الطالب كمنفّذة" : "تراجع الطالب عن التحديد";
    if (e.verified) return "تأكيد المعلم لما حدّده الطالب";
    return "الحالة: من «" + stageStatusLabel(normalizeStageStatus(e.fromStatus)) + "» إلى «" + stageStatusLabel(normalizeStageStatus(e.toStatus)) + "»";
  }
  return "عُدّلت ملاحظة المعلم";
}
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return iso && Number.isFinite(d.getTime()) ? d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "—";
};
