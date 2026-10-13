
import { Suspense, createElement, useId } from "react";
import type { QuestionBody, BuilderOption, BuilderQuestionType, BuilderPartType } from "./examTypes";
import { buildMatchingPatch, matchingPairs, moveMcqOption, deleteMcqOption, type MatchPair } from "./examBuilderState";
import QuestionFieldEditor from "./QuestionFieldEditor";
import TableFillEditor from "./TableFillEditor";
import CliFillEditor from "./CliFillEditor";
import { resolveAuthoringEditor } from "./questionTypes/authoringRegistry";
import { isKnownQuestionType, questionTypeDefinition, effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import Field, { FieldGroup } from "./ui/Field";
import { matchingFieldIssues, multipleChoiceFieldIssues, fieldIssueCodes, MULTIPLE_CHOICE_FIELD_CODES, MATCHING_FIELD_CODES } from "./teacher/questionFieldIssues";

// Type-specific answer-body HOST shared by a question and a compound part. It never renders identity, text or marks (the
// caller owns those) — only the answer controls for the given type. Phase 16A: the host resolves the CODE-OWNED authoring
// registry first (Wave 1 / plugin editors, lazy); the 11 legacy types keep their original inline editors below through the
// legacy adapter (unchanged behaviour, unchanged storage shapes); an unknown type renders an explicit unsupported state
// (never a silent conversion). All editing flows through onChange(patch).

// `framed` (Phase 21E.2): a TOP-LEVEL question (QuestionComposer) gets the shared Field frame — visible labels, help and inline
// validation linked with aria-invalid / aria-describedby. Compound and composite PARTS are rendered without it, byte-for-byte as
// before: the compound@1 freeze pins the part editors' DOM (compoundFreeze.20d F-12), and that family must not move.
type Props = { node: QuestionBody; type: BuilderQuestionType | BuilderPartType | string; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean; framed?: boolean };

const optText = (o: BuilderOption) => o.text ?? o.label ?? o.value ?? "";

export default function QuestionBodyEditor({ node, type, onChange, disabled, framed }: Props) {
  // Review Fix 1 / R1: the editor is resolved for the EXACT (type, stored version) identity — absence = V1, never "latest".
  const registered = resolveAuthoringEditor(type, node.questionTypeVersion);
  if (registered) {
    return <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر النوع…</p>}>{createElement(registered, framed ? { node, onChange, disabled, framed } : { node, onChange, disabled })}</Suspense>;
  }
  if (!isKnownQuestionType(type)) return <UnsupportedQuestionType type={type} />;
  if (effectiveQuestionTypeVersion(type, node.questionTypeVersion) === undefined || !questionTypeDefinition(type)?.legacy) {
    return <UnsupportedQuestionType type={type} version={node.questionTypeVersion} />;
  }
  // Keyed by type: a type change (same question id) mounts a fresh frame, so no "already visited" state crosses types.
  if (framed && (type === "multipleChoice" || type === "shortAnswer" || type === "matching")) return <FramedLegacyEditor key={type} node={node} type={type} onChange={onChange} disabled={disabled} />;
  return <LegacyQuestionAuthoringAdapter node={node} type={type as BuilderQuestionType} onChange={onChange} disabled={disabled} />;
}

// Phase 21E.2 — the three most-used legacy bodies on the shared Field frame (top-level questions only; see `framed`). Same data,
// same patches and the same storage shapes as the legacy adapter below; only labels, help, inline errors and contextual names differ.
function FramedLegacyEditor({ node, type, onChange, disabled }: { node: QuestionBody; type: "multipleChoice" | "shortAnswer" | "matching"; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean }) {
  const groupId = useId();
  if (type === "multipleChoice") {
    const options = node.options || [];
    const correct = Number((node.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
    const setOption = (i: number, text: string) => onChange({ options: options.map((o, k) => (k === i ? { ...o, text } : o)) });
    const issues = multipleChoiceFieldIssues(node);
    return (
      <FieldGroup legend="الخيارات والإجابة الصحيحة" className="sb-options" error={[issues.options, issues.answer].filter(Boolean).join(" ")} issueCode={fieldIssueCodes(issues, MULTIPLE_CHOICE_FIELD_CODES)} showError="always">{group => (<>
        {options.map((o, i) => (
          <div className="sb-option-row" key={i}>
            <label className="sb-radio"><input type="radio" name={"mcq-" + groupId} checked={correct === i} onChange={() => onChange({ answer: { correctOptionIndex: i } })} disabled={disabled} {...group} /> الصحيح<span className="eb-visually-hidden"> — الخيار {i + 1}</span></label>
            <Field label={"نص الخيار " + (i + 1)} hideLabel className="sb-option-field">{a11y => <input {...a11y} className="sb-input" value={optText(o)} placeholder={"الخيار " + (i + 1)} onChange={e => setOption(i, e.target.value)} disabled={disabled} />}</Field>
            <button type="button" className="sb-icon-btn" title={"نقل الخيار " + (i + 1) + " للأعلى"} aria-label={"نقل الخيار " + (i + 1) + " للأعلى"} onClick={() => onChange(moveMcqOption(node, i, -1))} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title={"نقل الخيار " + (i + 1) + " للأسفل"} aria-label={"نقل الخيار " + (i + 1) + " للأسفل"} onClick={() => onChange(moveMcqOption(node, i, 1))} disabled={disabled}>↓</button>
            {options.length > 2 && <button type="button" className="sb-icon-btn sb-danger" title={"حذف الخيار " + (i + 1)} aria-label={"حذف الخيار " + (i + 1)} onClick={() => onChange(deleteMcqOption(node, i))} disabled={disabled}>×</button>}
          </div>
        ))}
        <button type="button" className="sb-mini-btn" onClick={() => onChange({ options: [...options, { text: "" }] })} disabled={disabled}>+ إضافة خيار</button>
      </>)}</FieldGroup>
    );
  }

  if (type === "shortAnswer") {
    const model = String((node.answer as { text?: unknown })?.text ?? "");
    return (
      <div className="sb-short">
        <Field label="إجابة نموذجية (اختياري)" help={!model.trim() ? "بدون إجابة نموذجية سيذهب هذا السؤال إلى المراجعة اليدوية للمعلم." : undefined}>{a11y => (
          <textarea {...a11y} className="sb-input sb-textarea" value={model} placeholder="اترك الحقل فارغًا للتصحيح اليدوي" onChange={e => onChange({ answer: e.target.value.trim() ? { text: e.target.value } : {} })} disabled={disabled} />
        )}</Field>
      </div>
    );
  }

  if (type === "matching") {
    const pairs = matchingPairs(node);
    const list: MatchPair[] = pairs.length ? pairs : [{ left: "", right: "" }];
    const apply = (next: MatchPair[]) => onChange(buildMatchingPatch(next));
    const issues = matchingFieldIssues(node);
    return (
      <FieldGroup legend="أزواج المطابقة" className="sb-matching" help="لكل عنصر في العمود الأول، اكتب إجابته الصحيحة من العمود الثاني. تُعرض كل الإجابات كقائمة منسدلة للطالب." error={issues.list} issueCode={MATCHING_FIELD_CODES.list}>{() => (<>
        {/* touchKey = the list length: adding or deleting a pair resets every pair's "already visited" state, so one pair's state
            never moves onto another pair (rows stay mounted, so keyboard focus stays where the legacy editor kept it).
            issueNth (RF2-1) = which MATCH_INCOMPLETE_PAIR this pair shows, from the same mapping as its messages. */}
        {list.map((p, i) => (
          <div className="sb-field-row" key={i}>
            <Field label={"العنصر " + (i + 1)} hideLabel error={issues.pairs[i]?.left} issueCode={MATCHING_FIELD_CODES.pair} issueNth={issues.pairs[i]?.nth} touchKey={list.length}>{a11y => <input {...a11y} className="sb-input" value={p.left} placeholder="العنصر" onChange={e => apply(list.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)))} disabled={disabled} />}</Field>
            <span className="sb-arrow" aria-hidden="true">←</span>
            <Field label={"الإجابة الصحيحة للعنصر " + (i + 1)} hideLabel error={issues.pairs[i]?.right} issueCode={MATCHING_FIELD_CODES.pair} issueNth={issues.pairs[i]?.nth} touchKey={list.length}>{a11y => <input {...a11y} className="sb-input" value={p.right} placeholder="الإجابة الصحيحة" onChange={e => apply(list.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)))} disabled={disabled} />}</Field>
            {list.length > 1 && <button type="button" className="sb-icon-btn sb-danger" title={"حذف الزوج " + (i + 1)} aria-label={"حذف الزوج " + (i + 1)} onClick={() => apply(list.filter((_, k) => k !== i))} disabled={disabled}>×</button>}
          </div>
        ))}
        <button type="button" className="sb-mini-btn" onClick={() => apply([...list, { left: "", right: "" }])} disabled={disabled}>+ إضافة زوج</button>
      </>)}</FieldGroup>
    );
  }

  return null;
}

/** Unknown / unsupported type: the data is kept verbatim, finalization is blocked by examQuality, the teacher resolves it by choosing a type. */
function UnsupportedQuestionType({ type, version }: { type: string; version?: unknown }) {
  if (isKnownQuestionType(type)) {
    return <div className="qt-unsupported" data-testid="qt-unsupported" role="note">إصدار غير مدعوم لنوع السؤال «{questionTypeDefinition(type)?.label}»: <code>{String(version ?? "—")}</code>. لا يوجد تنفيذ لهذا الإصدار في هذا التطبيق؛ لن يُقبل السؤال في الاعتماد النهائي ولن يُعاد تفسيره بإصدار آخر.</div>;
  }
  return <div className="qt-unsupported" data-testid="qt-unsupported" role="note">نوع سؤال غير مدعوم: <code>{String(type || "—")}</code>. لن يُقبل هذا السؤال في الاعتماد النهائي؛ اختر نوعًا مدعومًا من قائمة «نوع السؤال» أو احذف السؤال.</div>;
}

// LEGACY ADAPTER — the original 11-type editor, byte-for-byte.
function LegacyQuestionAuthoringAdapter({ node, type, onChange, disabled }: { node: QuestionBody; type: BuilderQuestionType | BuilderPartType; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean }) {
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
            <button type="button" className="sb-icon-btn" title="أعلى" aria-label="أعلى" onClick={() => onChange(moveMcqOption(node, i, -1))} disabled={disabled}>↑</button>
            <button type="button" className="sb-icon-btn" title="أسفل" aria-label="أسفل" onClick={() => onChange(moveMcqOption(node, i, 1))} disabled={disabled}>↓</button>
            {options.length > 2 && <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label="حذف" onClick={() => onChange(deleteMcqOption(node, i))} disabled={disabled}>×</button>}
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
            {list.length > 1 && <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label="حذف" onClick={() => apply(list.filter((_, k) => k !== i))} disabled={disabled}>×</button>}
          </div>
        ))}
        <button type="button" className="sb-mini-btn" onClick={() => apply([...list, { left: "", right: "" }])} disabled={disabled}>+ إضافة زوج</button>
      </div>
    );
  }

  return null;
}
