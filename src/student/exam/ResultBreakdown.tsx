import { useState } from "react";
import { IconChevronDown } from "../../icons";
import { issueText } from "../../learning/activities/automatonDesign";
// D4 (item 7) — the student's per-question mark breakdown under a RELEASED result (api: student-submission pub() → questionBreakdown).
// Marks and the teacher's comment only (owner decision): no correct answer, no model answer, no hidden-test detail ever reaches this
// screen — the server sends none. AUTO-A8b (owner decision 2026-11-25): an automaton-design question adds ONE word on which the student's
// machine and the reference disagree (or the public rule the machine broke) — never the reference itself. Collapsed by default so the result card keeps its shape; grouped by section when there are several.
export type BreakdownStatus = "full" | "partial" | "zero" | "pending" | "notCounted";
export type AutomatonBreakdown = { word: string; shouldAccept: boolean } | { issue: { code: string; state?: string; symbol?: string; max?: number } };
export type QuestionBreakdown = {
  sections: Array<{ id: string; title: string; capped: boolean }>;
  questions: Array<{ number: number; sectionId: string; status: BreakdownStatus; maxMarks: number; score?: number; comment?: string; automaton?: AutomatonBreakdown }>;
};

const STATUS_LABEL: Record<BreakdownStatus, string> = { full: "علامة كاملة", partial: "علامة جزئية", zero: "بلا علامة", pending: "قيد التصحيح", notCounted: "غير محتسب" };

/** AUTO-A8b — the one line an automaton question adds: the separating word, or the broken rule. */
function automatonLine(a: AutomatonBreakdown) {
  if ("issue" in a) return <>آلتك تخالف قاعدة في السؤال: {issueText(a.issue)}</>;
  return <>الكلمة <bdi dir="ltr">{a.word === "" ? "ε (الكلمة الفارغة)" : a.word}</bdi> {a.shouldAccept ? "كان يجب أن تُقبل، لكن آلتك ترفضها" : "كان يجب أن تُرفض، لكن آلتك تقبلها"}.</>;
}

function markText(q: QuestionBreakdown["questions"][number]): string {
  if (q.status === "pending") return "— / " + q.maxMarks;
  if (q.status === "notCounted") return "—";
  return (q.score ?? 0) + " / " + q.maxMarks;
}

// UX-S3 (docs/enterprise-ux-student-s3.md §2.3) — the closed summary says that it opens (and how to close it again); still closed by
// default (D4), still marks and comments only.
export default function ResultBreakdown({ breakdown }: { breakdown: QuestionBreakdown }) {
  const [open, setOpen] = useState(false);
  const groups = breakdown.sections.length > 1
    ? breakdown.sections.map(s => ({ section: s, questions: breakdown.questions.filter(q => q.sectionId === s.id) })).filter(g => g.questions.length)
    : [{ section: breakdown.sections[0] || null, questions: breakdown.questions }];
  const commented = breakdown.questions.filter(q => q.comment).length;
  return (
    <details className="iex-breakdown" data-testid="result-breakdown" onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="iex-breakdown-title">تفصيل العلامات حسب السؤال{commented ? " · " + (commented === 1 ? "ملاحظة واحدة من المعلم" : commented + " ملاحظات من المعلم") : ""}</span>
        <span className="iex-breakdown-hint" data-testid="breakdown-hint">{open ? "اضغط للإخفاء" : "اضغط لعرض علامة كل سؤال"}</span>
        <IconChevronDown size={16} className={"iex-breakdown-chevron" + (open ? " is-open" : "")} aria-hidden="true" />
      </summary>
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
                {q.automaton && <p className="iex-breakdown-comment" data-testid="breakdown-automaton"><strong>تصميم الأوتومات: </strong>{automatonLine(q.automaton)}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </details>
  );
}
