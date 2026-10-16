import EmptyState from "../ui/EmptyState";
import { SCORE_BANDS } from "./assignmentPage";
import { questionGrid } from "./questionGrid";
import type { QuestionStat, StudentQuestionRow } from "./types";

/**
 * Phase 21G.4 — «علامات الطلاب لكل سؤال»: every student's mark on every question of their latest attempt, in one hue that deepens
 * with the mark (the score distribution's bands). Each cell prints its mark, so colour is never the only channel; a question still
 * waiting for the teacher reads «بانتظار» on a hatched cell and is never banded. Absent when the server sent no grid.
 */
export default function QuestionGrid({ questions, students }: { questions: readonly QuestionStat[]; students: readonly StudentQuestionRow[] | undefined }) {
  if (!students) return null;
  const rows = questionGrid(questions, students);
  return (
    <section className="eb-qgrid" aria-labelledby="eb-qgrid-title">
      <h4 id="eb-qgrid-title" className="eb-subheading">علامات الطلاب لكل سؤال</h4>
      <p className="eb-muted eb-qgrid-lead">آخر محاولة لكل طالب. يزداد اللون عمقًا كلما ارتفعت العلامة.</p>
      <ul className="eb-qgrid-legend" aria-label="مفتاح الألوان">
        {SCORE_BANDS.map(b => <li key={b.key}><span className={"eb-qgrid-swatch is-" + b.key} aria-hidden="true" />{b.label}</li>)}
        <li><span className="eb-qgrid-swatch is-pending" aria-hidden="true" />بانتظار التصحيح</li>
      </ul>
      {rows.length && questions.length ? (
        <div className="eb-qgrid-wrap" role="region" aria-label="جدول علامات الطلاب لكل سؤال" tabIndex={0}>
          <table className="eb-qgrid-table">
            <thead><tr><th scope="col">الطالب</th>{questions.map(q => <th scope="col" key={q.questionId} title={q.text || undefined}>س{q.number}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.studentId}>
                <th scope="row"><strong>{r.studentName}</strong><small>{r.studentCode}</small></th>
                {r.cells.map((c, i) => <td key={questions[i].questionId} className={"eb-qgrid-cell is-" + (c.kind === "graded" ? c.band : c.kind)} title={c.label}>{c.text}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState compact title="لا توجد محاولات مسلّمة بعد." description="يظهر الجدول بعد أول تسليم." />}
    </section>
  );
}
