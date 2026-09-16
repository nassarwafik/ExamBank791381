import { dashboardStateLabel } from "../gradingStatus";
import EmptyState from "../ui/EmptyState";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { STATE_TONE, actionLabel, formatWhen, stateOf } from "./portalPresentation";
import type { Summary } from "./types";

/**
 * "ماذا عليّ أن أفعل الآن؟" (UX-7a) — the primary section. Rows come straight from the dashboard's own
 * actionable states (inProgress / available), each with ONE truthful action (the same label as the task
 * card); scheduled work is listed underneath with its opening time and no action. Presentation only.
 */
export default function NowSection({ actionable, upcoming, busy, onOpen }: { actionable: Summary[]; upcoming: Summary[]; busy: boolean; onOpen: (item: Summary) => void }) {
  return (
    <section className="eb-sp-panel eb-sp-now" aria-labelledby="eb-sp-now-title">
      <SectionHeader level={2} id="eb-sp-now-title" title="ماذا عليّ أن أفعل الآن؟" count={actionable.length} description="المحاولات الجارية والواجبات المتاحة، الأهم أولًا." />
      {actionable.length ? (
        <ul className="eb-sp-now-list">
          {actionable.map(item => {
            const st = stateOf(item);
            return (
              <li key={item.assignmentId} className={"eb-sp-now-item dash-" + st}>
                <div className="eb-sp-now-text">
                  <h3 className="eb-sp-now-title">{item.title}</h3>
                  <p className="eb-sp-now-meta">
                    <StatusBadge tone={STATE_TONE[st]}>{dashboardStateLabel(st)}</StatusBadge>
                    <span>التسليم: {formatWhen(item.effectiveDueAt || item.dueAt)}</span>
                    <span>المحاولات: {item.attemptsUsed}/{item.allowedAttempts}</span>
                  </p>
                </div>
                <button type="button" className="eb-button is-primary eb-sp-now-action" disabled={busy} onClick={() => onOpen(item)}>{actionLabel(item)}</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title="لا يوجد ما يتطلب إجراءً الآن" description="أنجزت كل ما هو متاح. أي واجب جديد أو محاولة قيد الحل ستظهر هنا." />
      )}
      {upcoming.length > 0 && (
        <div className="eb-sp-upcoming">
          <h3 className="eb-subheading">قريبًا</h3>
          <ul aria-label="واجبات لم تفتح بعد">
            {upcoming.map(item => (
              <li key={item.assignmentId}>
                <span className="eb-sp-upcoming-title">{item.title}</span>
                <span className="eb-muted">{item.openAt ? "يفتح في " + formatWhen(item.openAt) : "موعد الفتح غير محدد بعد"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
