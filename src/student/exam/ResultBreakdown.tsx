import { useState } from "react";
import { IconChevronDown } from "../../icons";
import { issueText } from "../../learning/activities/automatonDesign";
import TraceCompare, { type TraceCompareData } from "../../automata/TraceCompare";
// D4 (item 7) — the student's per-question mark breakdown under a RELEASED result (api: student-submission pub() → questionBreakdown).
// Marks and the teacher's comment only (owner decision): no correct answer, no model answer, no hidden-test detail ever reaches this
// screen — the server sends none. AUTO-A8b (owner decision 2026-11-25): an automaton-design question adds ONE word on which the student's
// machine and the reference disagree (or the public rule the machine broke) — never the reference itself. AUTO-A11b: a machine-design
// question (push-down / Turing) adds its one line the same way (agreement up to a length, a separating word, a rule, or not halting).
// AUTO-A15b (owner decision 2026-11-26): a machine-trace question shows the student's rows beside the true run — the machine and the word were
// the question, so the run is no secret once the results are released. Collapsed by default so the result card keeps its shape; grouped by section when there are several.
export type BreakdownStatus = "full" | "partial" | "zero" | "pending" | "notCounted";
/** AUTO-A11b — a push-down automaton / Turing machine question: the agreement length (full marks, not a proof), the separating word (or a
 *  function's expected and given answers), a broken rule, or the word the machine did not halt on — rebuilt by the server, never the reference. */
export type MachineBreakdown =
  | { agreesUpTo: { length: number; words: number; skipped?: number } }
  | { word: string; shouldAccept: boolean }
  | { word: string; expected: string; got: string | null }
  | { issue: { code: string; max?: number } }
  | { nohalt: { word: string } };
export type AutomatonBreakdown = { word: string; shouldAccept: boolean } | { issue: { code: string; state?: string; symbol?: string; max?: number } };
export type QuestionBreakdown = {
  sections: Array<{ id: string; title: string; capped: boolean }>;
  questions: Array<{ number: number; sectionId: string; status: BreakdownStatus; maxMarks: number; score?: number; comment?: string; automaton?: AutomatonBreakdown; machine?: MachineBreakdown; trace?: TraceCompareData }>;
};

const STATUS_LABEL: Record<BreakdownStatus, string> = { full: "علامة كاملة", partial: "علامة جزئية", zero: "بلا علامة", pending: "قيد التصحيح", notCounted: "غير محتسب" };

const shownWord = (w: string) => (w === "" ? "ε (الكلمة الفارغة)" : w);
const shownAnswer = (a: string | null) => (a === null ? "لا جواب بين علامتي $" : "«" + (a === "" ? "ε" : a) + "»");
/** AUTO-A11b — the one line a machine question adds. */
function machineLine(m: MachineBreakdown) {
  if ("agreesUpTo" in m) return <>آلتك تتفق مع الآلة النموذجية في كل ما فُحص حتى الطول {m.agreesUpTo.length} ({m.agreesUpTo.words} كلمة). هذا فحص وليس برهانًا.</>;
  if ("nohalt" in m) return <>آلتك لم تتوقف على الكلمة <bdi dir="ltr">{shownWord(m.nohalt.word)}</bdi> (بعد ألف خطوة)، والآلة النموذجية تتوقف عليها؛ وضع المعلم العلامة.</>;
  if ("issue" in m) return <>آلتك تخالف قاعدة في السؤال: {issueText(m.issue)}</>;
  if ("expected" in m) return <>على المدخل <bdi dir="ltr">{shownWord(m.word)}</bdi> الجواب الصحيح <bdi dir="ltr">{shownAnswer(m.expected)}</bdi>، وآلتك تعطي <bdi dir="ltr">{shownAnswer(m.got)}</bdi>.</>;
  return <>الكلمة <bdi dir="ltr">{shownWord(m.word)}</bdi> {m.shouldAccept ? "كان يجب أن تُقبل، لكن آلتك ترفضها" : "كان يجب أن تُرفض، لكن آلتك تقبلها"}.</>;
}
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
                {q.machine && <p className="iex-breakdown-comment" data-testid="breakdown-machine"><strong>تصميم الآلة: </strong>{machineLine(q.machine)}</p>}
                {q.trace && <TraceCompare data={q.trace} testId="breakdown-trace" />}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </details>
  );
}
