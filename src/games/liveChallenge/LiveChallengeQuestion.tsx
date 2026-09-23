import StudentQuestionCard from "../../StudentQuestionCard";
import type { Answer, Question, FieldValue } from "../../StudentQuestionCard";
import CompoundQuestion from "../../CompoundQuestion";

// Live Challenge — ONE current-round question, rendered through the EXISTING student exam controls. This is a thin
// controlled wrapper: it holds no answer state itself (the parent owns the round's local draft) and it never renders a
// question type of its own — a compound question routes to CompoundQuestion, everything else to StudentQuestionCard,
// exactly like the real exam page. That keeps a single answer engine and the same accessibility for all 11 types.
export default function LiveChallengeQuestion({ q, index, answer, onAnswer, disabled }: {
  q: Question; index: number; answer: Answer | undefined; onAnswer: (a: Answer) => void; disabled?: boolean;
}) {
  const id = String(q.examQuestionId || q.id || q.number || index + 1);
  const isCompound = Array.isArray(q.parts) && q.parts.length > 0;
  if (isCompound) {
    return <CompoundQuestion q={q} index={index} id={id} answer={answer} disabled={disabled}
      onPart={(partId, ans) => { const prev = answer?.kind === "compound" ? answer.parts : {}; onAnswer({ kind: "compound", parts: { ...prev, [partId]: ans } }); }} />;
  }
  return <StudentQuestionCard q={q} index={index} id={id} answer={answer} disabled={disabled}
    onChoice={n => onAnswer({ kind: "choice", index: n })}
    onSeq={(n, v) => { const prev = answer?.kind === "sequence" ? answer.values : []; const values = [...prev]; values[n] = v; onAnswer({ kind: "sequence", values }); }}
    onTable={(n, v) => { const prev = answer?.kind === "table" ? answer.values : []; const values = [...prev]; values[n] = v; onAnswer({ kind: "table", values }); }}
    onText={v => onAnswer({ kind: "text", value: v })}
    onField={(fieldId, v: FieldValue) => { const prev = answer?.kind === "fields" ? answer.values : {}; onAnswer({ kind: "fields", values: { ...prev, [fieldId]: v } }); }} />;
}
