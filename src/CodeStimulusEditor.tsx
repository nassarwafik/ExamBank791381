import { useId } from "react";
import type { BuilderQuestion } from "./examTypes";
import { CODE_STIMULUS_LANGUAGES, CODE_STIMULUS_LIMITS, validateCodeStimulus } from "./codeStimulus";

// Phase 19F — authoring of the optional read-only CODE STIMULUS of a question (predict the output, trace the execution, read a
// program…). Type-neutral: the answer stays the question's own. The program is plain text (LTR, no autocorrect); it is shown to the
// student exactly as written and is never executed. The canonical validator's message is shown inline (finalization blocks on it).
type Props = { question: BuilderQuestion; onChange: (patch: Partial<BuilderQuestion>) => void; disabled?: boolean };

export default function CodeStimulusEditor({ question, onChange, disabled }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const s = question.codeStimulus;
  if (!s) return (
    <div className="sb-code-stimulus" data-testid="code-stimulus-editor">
      <button type="button" className="sb-btn" disabled={disabled} onClick={() => onChange({ codeStimulus: { language: "python", source: "print(1)\n" } })}>إضافة كود مرفق للقراءة (توقع الناتج / تتبع التنفيذ)</button>
    </div>
  );
  const set = (patch: Partial<typeof s>) => onChange({ codeStimulus: { ...s, ...patch } });
  const v = validateCodeStimulus(s);
  return (
    <fieldset className="sb-code-stimulus" data-testid="code-stimulus-editor">
      <legend>كود مرفق للقراءة فقط</legend>
      <p className="sb-hint">يظهر للطالب كما هو تحت نص السؤال ولا يُشغَّل. الإجابة تبقى إجابة نوع السؤال نفسه.</p>
      <div className="sb-media-actions">
        <label className="sb-inline"><span>اللغة</span>
          <select className="sb-input sb-input-sm" value={s.language} disabled={disabled} onChange={e => set({ language: e.target.value })}>
            {Object.entries(CODE_STIMULUS_LANGUAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="sb-inline"><span>وصف مختصر (اختياري)</span>
          <input className="sb-input sb-input-sm" value={s.label ?? ""} maxLength={CODE_STIMULUS_LIMITS.label} disabled={disabled} onChange={e => onChange({ codeStimulus: e.target.value === "" ? { language: s.language, source: s.source } : { ...s, label: e.target.value } })} />
        </label>
        <button type="button" className="sb-btn" disabled={disabled} onClick={() => onChange({ codeStimulus: undefined })}>إزالة الكود المرفق</button>
      </div>
      <label htmlFor={"sb-cs-" + uid}>الكود</label>
      <textarea id={"sb-cs-" + uid} className="sb-input sb-code-stimulus-source" dir="ltr" lang="en" rows={Math.min(18, Math.max(4, s.source.split("\n").length + 1))} value={s.source} disabled={disabled}
        spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" aria-invalid={!v.ok || undefined} aria-describedby={!v.ok ? "sb-cs-err-" + uid : undefined}
        onChange={e => set({ source: e.target.value })} />
      {!v.ok && <p className="sb-code-stimulus-error" id={"sb-cs-err-" + uid} role="alert">{v.issues[0].message}</p>}
    </fieldset>
  );
}
