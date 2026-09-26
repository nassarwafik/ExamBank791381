import { IconMail, IconSparkles } from "../../icons";
import SectionHeader from "../../ui/SectionHeader";
import type { TodayContinue } from "./todayPriority";
import "./today.css";

/**
 * Phase 9A — the student's Today Hub: ONE hero card («أكمل من حيث توقفت») with the single continuation
 * `selectTodayContinue` chose, plus two compact strips — «رسائلك» (the canonical unread count → the Messages page) and
 * «تقدمك» (stage · medals · last result → the progress section). Presentation only: every fact is a server field the
 * portal already holds, the CTA hands the choice back to the portal's EXISTING actions (open assignment, open the
 * Reader at a page, scroll to projects), and nothing here fetches or stores anything.
 */
export type TodayProgress = { stageNumber: number | null; stageCount: number; medals: number; finalized: number; latest: { title: string; percentage: number } | null };
type Props = {
  continueItem: TodayContinue | null;
  /** True while the portal is opening something (the same `busy` the task cards use). */
  busy: boolean;
  onContinue: (item: TodayContinue) => void;
  messagesUnread: { total: number; capped: boolean };
  onOpenMessages: () => void;
  progress: TodayProgress;
  onOpenProgress: () => void;
  /** The empty state's action («المهام والواجبات» — the full list). */
  onOpenTasks: () => void;
};

const KICKER: Record<TodayContinue["type"], string> = { activeAttempt: "محاولة جارية", assignment: "موعد قريب", reader: "متابعة القراءة", project: "مشروعك", study: "ابدأ الآن" };

export default function StudentTodayHub({ continueItem, busy, onContinue, messagesUnread, onOpenMessages, progress, onOpenProgress, onOpenTasks }: Props) {
  const unread = messagesUnread.total > 0 ? (messagesUnread.capped ? "99+" : String(messagesUnread.total)) : "";
  const progressText = [
    progress.stageNumber ? "المرحلة " + progress.stageNumber + " من " + progress.stageCount : "",
    progress.medals > 0 ? progress.medals + (progress.medals === 1 ? " ميدالية" : " ميداليات") : "",
    progress.latest ? "آخر نتيجة: " + progress.latest.title + " " + Math.round(progress.latest.percentage) + "%" : progress.finalized === 0 ? "لا نتائج نهائية بعد" : ""
  ].filter(Boolean).join(" · ");
  return (
    <section className="eb-sp-panel eb-sp-today" aria-labelledby="eb-sp-today-title">
      <SectionHeader level={2} id="eb-sp-today-title" title="أكمل من حيث توقفت" description="أهم خطوة واحدة لك الآن، ثم رسائلك وتقدمك باختصار." />
      {continueItem ? (
        <article className={"eb-sp-today-hero is-" + continueItem.type} aria-labelledby="eb-sp-today-hero-title" data-continue-type={continueItem.type}>
          <p className="eb-sp-today-kicker">{KICKER[continueItem.type]}</p>
          <h3 id="eb-sp-today-hero-title" className="eb-sp-today-hero-title">{continueItem.title}</h3>
          <p className="eb-sp-today-reason">{continueItem.reason}</p>
          <button type="button" className="eb-button is-primary eb-sp-today-cta" disabled={busy} onClick={() => onContinue(continueItem)}>{continueItem.label}</button>
        </article>
      ) : (
        <div className="eb-sp-today-hero is-empty" data-continue-type="none">
          <p className="eb-sp-today-kicker">لا يوجد شيء عاجل الآن</p>
          <p className="eb-sp-today-reason">أنجزت كل ما هو متاح. أي واجب جديد أو مادة جديدة ستظهر هنا فور نشرها.</p>
          <button type="button" className="eb-button is-quiet eb-sp-today-cta" onClick={onOpenTasks}>المهام والواجبات</button>
        </div>
      )}
      <ul className="eb-sp-today-strip" aria-label="رسائلك وتقدمك">
        <li className={"eb-sp-today-chip is-messages" + (unread ? " has-unread" : "")}>
          <IconMail size={18} aria-hidden="true" />
          <span className="eb-sp-today-chip-text">{unread ? "لديك " + unread + " رسائل غير مقروءة من المعلم" : "لا رسائل جديدة من المعلم"}</span>
          <button type="button" className="eb-button is-quiet is-small eb-sp-today-chip-action" onClick={onOpenMessages}>افتح رسائل المعلم</button>
        </li>
        <li className="eb-sp-today-chip is-progress">
          <IconSparkles size={18} aria-hidden="true" />
          <span className="eb-sp-today-chip-text">{progressText || "تقدمك يظهر هنا بعد أول نشاط"}</span>
          <button type="button" className="eb-button is-quiet is-small eb-sp-today-chip-action" onClick={onOpenProgress}>تقدمك</button>
        </li>
      </ul>
    </section>
  );
}
