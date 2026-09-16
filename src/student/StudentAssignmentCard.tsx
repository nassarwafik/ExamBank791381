import { dashboardStateLabel, gradingClass, resolveGradingStatus, scoreLabel } from "../gradingStatus";
import StatusBadge from "../ui/StatusBadge";
import { STATE_TONE, actionLabel, formatWhen, stateOf } from "./portalPresentation";
import type { Summary } from "./types";

/** One task card (UX-7). The wording of the result line is unchanged: provisional vs final comes from the result's own grading status. */
export default function StudentAssignmentCard({ item, busy, onOpen }: { item: Summary; busy: boolean; onOpen: (item: Summary) => void }) {
  const st = stateOf(item);
  const lr = item.latestResult || null;
  const lrGs = lr ? resolveGradingStatus(lr) : null;
  const due = item.effectiveDueAt || item.dueAt;
  return (
    <article className={"student-assignment-card eb-sp-task dash-" + st}>
      <div className="eb-sp-task-head">
        <h3 className="eb-sp-task-title">{item.title}</h3>
        <StatusBadge tone={STATE_TONE[st]}>{dashboardStateLabel(st)}</StatusBadge>
      </div>
      {item.instructions && <p className="eb-sp-task-desc">{item.instructions}</p>}
      <ul className="eb-sp-task-meta" aria-label="تفاصيل المهمة">
        <li>{item.questionCount} سؤال</li>
        <li>{item.totalMarks} علامة</li>
        {!!item.durationMinutes && <li>{item.durationMinutes} دقيقة</li>}
        <li>التسليم: {formatWhen(due)}</li>
        <li>المحاولات: {item.attemptsUsed}/{item.allowedAttempts}</li>
      </ul>
      {lr && lrGs && (
        <p className={"eb-sp-task-result is-" + gradingClass(lrGs)}>
          <strong>{scoreLabel(lrGs)}: {lr.score}/{lr.totalMarks}{lrGs === "final" ? " (" + lr.percentage + "%)" : ""}</strong>
          {lrGs === "pendingReview" && lr.manualReviewMarks > 0 && <span>بانتظار مراجعة {lr.manualReviewMarks} علامة</span>}
        </p>
      )}
      {lr && lr.teacherFeedback && <p className="eb-sp-task-feedback">ملاحظة المعلم: {lr.teacherFeedback}</p>}
      <button type="button" className="eb-button is-primary eb-sp-task-action" onClick={() => onOpen(item)} disabled={busy || item.availability === "scheduled"}>{actionLabel(item)}</button>
    </article>
  );
}
