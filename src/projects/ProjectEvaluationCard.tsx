import { fmtDate } from "./helpers";
import { evaluationSummaryText, fmtProjectScore, ungradedStagesOf } from "./projectEvaluation";
import type { ProjectEvaluation } from "./types";
import "./performance.css";

/**
 * Phase 9B — the read-only EVALUATION summary card of one student in one project, shared by the teacher's student
 * profile (`variant="teacher"`) and the student's own project view (`variant="student"`). Everything shown is the
 * server's `evaluation`: the project score (average of graded stages; «لم تُقيّم بعد» while none is graded), the
 * graded / total count, the evaluation percentage, the last score update, and — for the student — which stages are
 * still ungraded. No controls live here (grading stays on the stage rows) and nothing is recomputed.
 */
export default function ProjectEvaluationCard({ evaluation, variant, id }: { evaluation: ProjectEvaluation; variant: "teacher" | "student"; id: string }) {
  const e = evaluation;
  const none = e.gradedStages === 0;
  const ungraded = ungradedStagesOf(e);
  const titleId = id + "-title";
  return (
    <section className={"eb-eval-card is-" + variant} aria-labelledby={titleId} data-graded={e.gradedStages} data-total={e.totalStages}>
      <h3 id={titleId} className="eb-eval-title">{variant === "teacher" ? "تقييم المراحل" : "تقييم مشروعك"}</h3>
      <p className="eb-eval-summary">{evaluationSummaryText(e)}</p>
      <dl className="eb-eval-facts">
        <div><dt>التقييم العام</dt><dd dir={none ? undefined : "ltr"} className={none ? "is-empty" : undefined}>{fmtProjectScore(e.projectScore)}</dd></div>
        <div><dt>المراحل المقيّمة</dt><dd dir="ltr">{e.gradedStages} / {e.totalStages}</dd></div>
        <div><dt>نسبة التقييم</dt><dd dir="ltr">{e.evaluationProgress}%</dd></div>
        <div><dt>غير مقيّمة</dt><dd dir="ltr">{e.ungradedStages}</dd></div>
      </dl>
      <div className="eb-eval-bar" role="progressbar" aria-label="نسبة التقييم" aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.evaluationProgress}><span style={{ width: e.evaluationProgress + "%" }} /></div>
      {e.totalStages === 0 && <p className="eb-muted eb-eval-note">لا توجد مراحل فعّالة في هذا المشروع بعد.</p>}
      {variant === "student" && e.totalStages > 0 && (
        ungraded.length
          ? <p className="eb-eval-note">مراحل لم تُقيّم بعد: <span className="eb-eval-ungraded">{ungraded.map(s => s.stageId + " — " + s.title).join("، ")}</span></p>
          : <p className="eb-eval-note">قُيّمت جميع المراحل.</p>
      )}
      {variant === "teacher" && e.orphanStageIds.length > 0 && <p className="eb-muted eb-eval-note">علامات لمراحل لم تعد فعّالة (لا تُحتسب): {e.orphanStageIds.join("، ")}</p>}
      <p className="eb-muted eb-eval-updated">{e.updatedAt ? "آخر تحديث للتقييم: " + fmtDate(e.updatedAt) : "لم يُسجَّل أي تقييم بعد."}</p>
    </section>
  );
}
