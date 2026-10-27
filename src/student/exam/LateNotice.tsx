// D5 (item 10) — what the student is told about the teacher's late policy: before / inside the late window (state.lateWindow, from the
// server's timerState) and, on a late attempt's result, the lateness and the deduction. The marks before the deduction are shown only
// when the server sent them (it withholds them with the score until results are released) and the score itself is shown.
import { formatDateTimeLatn } from "./format";
import { lateDurationLabel, lateStampOf } from "../../assignments/latePolicy";

export type LateWindow = { active: boolean; until: string; deductionPercent: number };

const deduction = (d: number) => (d > 0 ? "مع خصم " + d + "٪ من علامة المحاولة" : "دون خصم من العلامة");

export function LateWindowNotice({ lateWindow }: { lateWindow?: LateWindow | null }) {
  if (!lateWindow || !lateWindow.until) return null;
  const until = formatDateTimeLatn(lateWindow.until);
  return lateWindow.active
    ? <p className="iex-late-window is-active" role="status" data-testid="late-window">انتهى الموعد الأصلي. يُقبل التسليم المتأخر حتى {until}، {deduction(lateWindow.deductionPercent)}.</p>
    : <p className="iex-late-window" data-testid="late-window">بعد الموعد يُقبل التسليم المتأخر حتى {until}، {deduction(lateWindow.deductionPercent)}.</p>;
}

export function LateResultNote({ result, showMarks }: { result: { late?: unknown; rawScore?: number; latePenalty?: number }; showMarks: boolean }) {
  const late = lateStampOf(result.late);
  if (!late) return null;
  const when = "سُلّمت المحاولة متأخرة " + lateDurationLabel(late.minutesLate);
  let tail: string;
  if (late.waived) tail = "، وألغى المعلم خصم التأخير.";
  else if (!late.deductionPercent) tail = " دون خصم من العلامة.";
  else if (showMarks && typeof result.rawScore === "number" && typeof result.latePenalty === "number") tail = "، فخُصم " + late.deductionPercent + "٪ (" + result.latePenalty + " علامة). العلامة قبل الخصم: " + result.rawScore + ".";
  else tail = "، ويُخصم " + late.deductionPercent + "٪ من علامتها.";
  return <p className="iex-late-result" data-testid="late-result">{when}{tail}</p>;
}
