import { dashboardStateLabel, gradingClass, resolveGradingStatus, scoreLabel } from "../gradingStatus";
import { CODING_GRADING_CARD_OPEN, CODING_GRADING_CARD_REVIEW, PENDING_SCORE_DASH, codingGradingStatusOf, isCodingGradingOpen, isCodingReviewRequired, scoreWithheld, resultsNotReleased, resultsNotReleasedLabel } from "../codingGradingStatus";
import StatusBadge from "../ui/StatusBadge";
import { IconHistory } from "../icons";
import { STATE_TONE, actionLabel, dueText, formatWhen, stateOf } from "./portalPresentation";
import type { Summary } from "./types";

/** One task card (UX-7). The wording of the result line is unchanged: provisional vs final comes from the result's own grading status. */
export default function StudentAssignmentCard({ item, busy, onOpen, now, showClass }: { item: Summary; busy: boolean; onOpen: (item: Summary) => void; /** UX-S3 — the portal's clock (one reading per render of the list). */ now: number; /** Tadris+ P11-A — the student is in more than one class: each task names its class. */ showClass?: boolean }) {
  const st = stateOf(item);
  const lr = item.latestResult || null;
  const lrGs = lr ? resolveGradingStatus(lr) : null;
  // UX-S3 (docs/enterprise-ux-student-s3.md §2.2) — a deadline read at a glance: «اليوم» / «غدًا» / «بعد N أيام» / «انتهى التسليم»;
  // a scheduled task says when it opens. The full date stays in the line (or its title).
  const due = dueText(item, now);
  const dueFull = formatWhen(st === "scheduled" ? item.openAt : item.effectiveDueAt || item.dueAt);
  return (
    <article className={"student-assignment-card eb-sp-task dash-" + st}>
      <div className="eb-sp-task-head">
        <h3 className="eb-sp-task-title">{item.title}</h3>
        <StatusBadge tone={STATE_TONE[st]}>{dashboardStateLabel(st)}</StatusBadge>
      </div>
      {item.instructions && <p className="eb-sp-task-desc">{item.instructions}</p>}
      <ul className="eb-sp-task-meta" aria-label="تفاصيل المهمة">
        {showClass && item.className && <li className="eb-sp-task-class" data-testid="card-class">الصف: <bdi>{item.className}</bdi></li>}
        <li>{item.questionCount} سؤال</li>
        <li>{item.totalMarks} علامة</li>
        {!!item.durationMinutes && <li>{item.durationMinutes} دقيقة</li>}
        <li className={"eb-sp-task-due" + (due.soon ? " is-soon" : "") + (due.past ? " is-past" : "")} title={dueFull} data-testid="card-due">{due.soon && <IconHistory size={14} aria-hidden="true" />}{due.text}</li>
        {item.inLateWindow && item.lateUntil && <li className="eb-sp-task-late" data-testid="card-late-window">تسليم متأخر حتى {formatWhen(item.lateUntil)}{item.lateDeductionPercent ? " · خصم " + item.lateDeductionPercent + "٪" : ""}</li>}
        <li>المحاولات: {item.attemptsUsed}/{item.allowedAttempts}</li>
      </ul>
      {lr && lrGs && (
        <p className={"eb-sp-task-result is-" + gradingClass(lrGs)}>
          <strong>{scoreLabel(lrGs)}: {scoreWithheld(lr) ? PENDING_SCORE_DASH + " " : lr.score}/{lr.totalMarks}{lrGs === "final" && !scoreWithheld(lr) ? " (" + lr.percentage + "%)" : ""}</strong>
          {resultsNotReleased(lr) ? <span data-testid="card-not-released">{resultsNotReleasedLabel(lr)}</span> : lrGs === "pendingReview" && lr.manualReviewMarks > 0 && <span>بانتظار مراجعة {lr.manualReviewMarks} علامة</span>}
        </p>
      )}
      {lr && isCodingGradingOpen(codingGradingStatusOf(lr)) && <p className="eb-sp-task-coding" data-testid="card-coding-grading">{CODING_GRADING_CARD_OPEN}</p>}
      {lr && isCodingReviewRequired(codingGradingStatusOf(lr)) && <p className="eb-sp-task-coding" data-testid="card-coding-grading">{CODING_GRADING_CARD_REVIEW}</p>}
      {lr && lr.teacherFeedback && <p className="eb-sp-task-feedback">ملاحظة المعلم: {lr.teacherFeedback}</p>}
      <button type="button" className="eb-button is-primary eb-sp-task-action" onClick={() => onOpen(item)} disabled={busy || item.availability === "scheduled"}>{actionLabel(item)}</button>
    </article>
  );
}
