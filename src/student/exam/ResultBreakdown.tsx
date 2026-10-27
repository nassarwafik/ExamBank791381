// D4 (item 7) — the student's per-question mark breakdown under a RELEASED result (api: student-submission pub() → questionBreakdown).
// Marks and the teacher's comment only (owner decision): no correct answer, no model answer, no hidden-test detail ever reaches this
// screen — the server sends none. Collapsed by default so the result card keeps its shape; grouped by section when there are several.
export type BreakdownStatus = "full" | "partial" | "zero" | "pending" | "notCounted";
export type QuestionBreakdown = {
  sections: Array<{ id: string; title: string; capped: boolean }>;
  questions: Array<{ number: number; sectionId: string; status: BreakdownStatus; maxMarks: number; score?: number; comment?: string }>;
};

const STATUS_LABEL: Record<BreakdownStatus, string> = { full: "علامة كاملة", partial: "علامة جزئية", zero: "بلا علامة", pending: "قيد التصحيح", notCounted: "غير محتسب" };

function markText(q: QuestionBreakdown["questions"][number]): string {
  if (q.status === "pending") return "— / " + q.maxMarks;
  if (q.status === "notCounted") return "—";
  return (q.score ?? 0) + " / " + q.maxMarks;
}

export default function ResultBreakdown({ breakdown }: { breakdown: QuestionBreakdown }) {
  const groups = breakdown.sections.length > 1
    ? breakdown.sections.map(s => ({ section: s, questions: breakdown.questions.filter(q => q.sectionId === s.id) })).filter(g => g.questions.length)
    : [{ section: breakdown.sections[0] || null, questions: breakdown.questions }];
  const commented = breakdown.questions.filter(q => q.comment).length;
  return (
    <details className="iex-breakdown" data-testid="result-breakdown">
      <summary>تفصيل العلامات حسب السؤال{commented ? " · " + (commented === 1 ? "ملاحظة واحدة من المعلم" : commented + " ملاحظات من المعلم") : ""}</summary>
      {groups.map((g, gi) => (
        <section key={g.section?.id || gi} className="iex-breakdown-group">
          {breakdown.sections.length > 1 && g.section && <h3>{g.section.title}{g.section.capped && <small> — تُحتسب فيه أفضل الإجابات حتى حدّ القسم</small>}</h3>}
          <ol className="iex-breakdown-list">
            {g.questions.map(q => (
              <li key={q.number} className={"iex-breakdown-item is-" + q.status} data-status={q.status}>
                <span className="iex-breakdown-q">السؤال {q.number}</span>
                <span className="iex-breakdown-mark"><bdi dir="ltr">{markText(q)}</bdi></span>
                <span className="iex-breakdown-status">{STATUS_LABEL[q.status]}</span>
                {q.comment && <p className="iex-breakdown-comment"><strong>ملاحظة المعلم: </strong>{q.comment}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </details>
  );
}
