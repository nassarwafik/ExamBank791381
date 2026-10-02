import type { GradingStatus } from "../gradingStatus";
import { CODING_COMPLETE_PROVISIONAL, CODING_GRADING_COME_BACK, CODING_GRADING_REFRESH_FAILED, CODING_GRADING_SUBMITTED, codingGradingDetail, codingGradingTitle, isCodingGradingOpen, type StudentCodingGradingStatus } from "../codingGradingStatus";

// Phase 17E-C — the compact async coding-grading panel of the student result card. Presentation only: the status comes from the
// server, mark finality from the canonical gradingStatus. Only the title line is a polite live region (it changes on a REAL
// transition, never on every poll); the spinner is decorative and still under reduced motion; there is no student action.
export default function CodingGradingStatusPanel({ status, gradingStatus, windowEnded, refreshFailed }: { status: StudentCodingGradingStatus; gradingStatus: GradingStatus; windowEnded: boolean; refreshFailed: boolean }) {
  const open = isCodingGradingOpen(status), working = status === "queued" || status === "processing" || status === "retrying";
  const detail = codingGradingDetail(status);
  return (
    <div className={"iex-coding-grading is-" + status} data-testid="coding-grading-status" data-status={status}>
      <div className="iex-coding-grading-live" role="status" aria-live="polite">
        {working && <span className="iex-coding-spinner" aria-hidden="true" />}
        <span className="iex-coding-grading-text">
          {status === "queued" && <strong>{CODING_GRADING_SUBMITTED} </strong>}
          <strong>{codingGradingTitle(status)}</strong>
          {status === "complete" && gradingStatus !== "final" && <span> {CODING_COMPLETE_PROVISIONAL}</span>}
        </span>
      </div>
      {detail !== "" && <p className="iex-coding-grading-detail">{detail}</p>}
      {open && working && windowEnded && <p className="iex-coding-grading-detail" data-testid="coding-grading-window-ended">{CODING_GRADING_COME_BACK}</p>}
      {open && refreshFailed && <p className="iex-coding-grading-note" data-testid="coding-grading-refresh-note">{CODING_GRADING_REFRESH_FAILED}</p>}
    </div>
  );
}
