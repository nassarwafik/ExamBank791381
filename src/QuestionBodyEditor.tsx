
import { useId } from "react";
import type { QuestionBody, BuilderOption, BuilderQuestionType, BuilderPartType } from "./examTypes";
import { buildMatchingPatch, matchingPairs, moveMcqOption, deleteMcqOption, type MatchPair } from "./examBuilderState";
import QuestionFieldEditor from "./QuestionFieldEditor";
import TableFillEditor from "./TableFillEditor";
import CliFillEditor from "./CliFillEditor";

// Type-specific answer-body editor shared by a question and a compound part. It never renders identity,
// text or marks (the caller owns those) — only the answer controls for the given type. All editing
// flows through onChange(patch), and every type writes an answer shape the backend grader already
// understands (proven end-to-end in examBuilder.test.ts).

type Props = { node: QuestionBody; type: BuilderQuestionType | BuilderPartType; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean };

const optText = (o: BuilderOption) => o.text ?? o.label ?? o.value ?? "";

export default function QuestionBodyEditor({ node, type, onChange, disabled }: Props) {
  // Unique per-editor-instance radio group name, so MCQ/trueFalse pickers on several questions/parts
  // rendered on the same page never share a radio group. This UI id is never stored in exam data.
  const groupId = useId();
  if (type === "multipleChoice") {
    const options = node.options || [];
    const correct = Number((node.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
    const hasCorrect = Number.isInteger(correct) && correct >= 0 && correct < options.length;
    const setOption = (i: number, text: string) => onChange({ options: options.map((o, k) => (k === i ? { ...o, text } : o)) });
    return (
      <div className="sb-options">
        {options.map((o, i) => (
          <div className="sb-option-row" key={i}>
            <label className="sb-radio"><input type="radio" name={"mcq-" + groupId} checked={correct === i} onChange={() => onChange({ answer: { correctOptionIndex: i } })} disabled={disabled} /> الصحيح</label>
            <input className="sb-input" value={optText(o)} placeholder={"الخيار " + (i + 1)} onChange={e => setOption(i, e.target.value)} disabled={disabled} />
            <button type="button" className="sb-icon-btn" title="أعلى" onClick={() => onChange(moveMcqOption(node, i, -1))} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" onClick={() => onChange(moveMcqOption(node, i, 1))} disabled={disabled}>↓</button>
            {options.length > 2 && <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => onChange(deleteMcqOption(node, i))} disabled={disabled}>×</button>}
          </div>
        ))}
        {!hasCorrect && <p className="sb-hint sb-warn-text">حدّد الإجابة الصحيحة.</p>}
        <button type="button" className="sb-mini-btn" onClick={() => onChange({ options: [...options, { text: "" }] })} disabled={disabled}>+ إضافة خيار</button>
      </div>
    );
  }

  if (type === "trueFalse") {
    const correct = (node.answer as { correct?: boolean })?.correct;
    return (
      <div className="sb-truefalse">
        <label className="sb-radio"><input type="radio" name={"tf-" + groupId} checked={correct === true} onChange={() => onChange({ answer: { correct: true } })} disabled={disabled} /> صحيح</label>
        <label className="sb-radio"><input type="radio" name={"tf-" + groupId} checked={correct === false} onChange={() => onChange({ answer: { correct: false } })} disabled={disabled} /> غير صحيح</label>
      </div>
    );
  }

  if (type === "shortAnswer") {
    const model = String((node.answer as { text?: unknown })?.text ?? "");
    return (
      <div className="sb-short">
        <label className="sb-field-label">إجابة نموذجية (اختياري)</label>
        <textarea className="sb-input sb-textarea" value={model} placeholder="اترك الحقل فارغًا للتصحيح اليدوي" onChange={e => onChange({ answer: e.target.value.trim() ? { text: e.target.value } : {} })} disabled={disabled} />
        {!model.trim() && <p className="sb-hint">بدون إجابة نموذجية سيذهب هذا السؤال إلى المراجعة اليدوية للمعلم.</p>}
      </div>
    );
  }

  if (type === "multiTrueFalse" || type === "fillBlank" || type === "wordBank" || type === "ordering") {
    return <QuestionFieldEditor node={node} type={type} onChange={onChange} disabled={disabled} />;
  }

  if (type === "tableFill") {
    return <TableFillEditor question={node} onChange={onChange} disabled={disabled} />;
  }

  if (type === "cliFill") {
    return <CliFillEditor question={node} onChange={onChange} disabled={disabled} />;
  }

  if (type === "matching") {
    const pairs = matchingPairs(node);
    const list: MatchPair[] = pairs.length ? pairs : [{ left: "", right: "" }];
    const apply = (next: MatchPair[]) => onChange(buildMatchingPatch(next));
    return (
      <div className="sb-matching">
        <p className="sb-hint">لكل عنصر في العمود الأول، اكتب إجابته الصحيحة من العمود الثاني. تُعرض كل الإجابات كقائمة منسدلة للطالب.</p>
        {list.map((p, i) => (
          <div className="sb-field-row" key={i}>
            <input className="sb-input" value={p.left} placeholder="العنصر" onChange={e => apply(list.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)))} disabled={disabled} />
            <span className="sb-arrow">←</span>
            <input className="sb-input" value={p.right} placeholder="الإجابة الصحيحة" onChange={e => apply(list.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)))} disabled={disabled} />
            {list.length > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => apply(list.filter((_, k) => k !== i))} disabled={disabled}>×</button>}
          </div>
        ))}
        <button type="button" className="sb-mini-btn" onClick={() => apply([...list, { left: "", right: "" }])} disabled={disabled}>+ إضافة زوج</button>
      </div>
    );
  }

  return null;
}
