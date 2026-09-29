import { useState } from "react";
import type { AssessmentActivityDescriptor, AssessmentActivityKind } from "./assessmentTypes";
import { ASSESSMENT_ACTIVITY_KINDS, activityKindLabel, isAssessmentSafe, validateActivityDescriptor } from "./assessmentActivity";
import { genId } from "./examBuilderState";

// Phase 13C-A — authoring of an interactive CONTEXT descriptor (question-level or shared stimulus). Data only: kind /
// key / version / title / description / JSON config. The trust state comes from the code-owned registry (13C-A ships zero
// approved production renderers, so the student sees a static fallback); issues (incl. secrets in the student-visible
// config) are shown to the teacher, never auto-repaired.
type Props = { value: AssessmentActivityDescriptor | undefined; onChange: (next: AssessmentActivityDescriptor | undefined) => void; disabled?: boolean };

export default function ActivityDescriptorEditor({ value, onChange, disabled }: Props) {
  // Local JSON draft (may be temporarily unparseable); re-synced whenever the persisted config changes (e.g. undo).
  const persisted = JSON.stringify(value?.config ?? {});
  const [draft, setDraft] = useState({ synced: persisted, text: persisted, error: "" });
  const view = draft.synced === persisted ? draft : { synced: persisted, text: persisted, error: "" };
  if (!value) {
    return <button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => onChange({ id: genId("act"), kind: "simulation", key: "", version: 1 })}>إضافة نشاط تفاعلي (سياق)</button>;
  }
  const issues = validateActivityDescriptor(value);
  const safe = isAssessmentSafe(value);
  const patch = (p: Partial<AssessmentActivityDescriptor>) => onChange({ ...value, ...p });
  const onConfigText = (text: string) => {
    try {
      const parsed: unknown = text.trim() === "" ? {} : JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
      setDraft({ synced: JSON.stringify(parsed), text, error: "" });
      patch({ config: parsed as Record<string, unknown> });
    } catch {
      setDraft({ synced: persisted, text, error: "JSON غير صالح — لن يُحفظ حتى يُصحَّح." });
    }
  };
  return (
    <fieldset className="sb-activity" disabled={disabled}>
      <legend className="sb-field-label">نشاط تفاعلي (سياق)</legend>
      <p className="sb-hint">سياق تفاعلي يُعرض مع السؤال ولا يُصحَّح: إجابة الطالب تبقى عبر نوع السؤال نفسه. الإعدادات مرئية للطالب — لا تضع فيها إجابة أو مفتاحًا.</p>
      <div className="sb-class-row">
        <label className="sb-inline"><span>النوع</span>
          <select className="sb-input sb-input-sm" aria-label="نوع النشاط" value={value.kind} onChange={e => patch({ kind: e.target.value as AssessmentActivityKind })}>
            {ASSESSMENT_ACTIVITY_KINDS.map(k => <option key={k} value={k}>{activityKindLabel(k)}</option>)}
          </select></label>
        <label className="sb-inline"><span>المفتاح</span><input className="sb-input sb-input-sm" aria-label="مفتاح النشاط" dir="ltr" placeholder="registry key" value={value.key} onChange={e => patch({ key: e.target.value })} /></label>
        <label className="sb-inline"><span>الإصدار</span><input className="sb-input sb-input-xs" type="number" min="1" step="1" aria-label="إصدار النشاط" value={value.version} onChange={e => patch({ version: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></label>
      </div>
      <label className="sb-inline"><span>العنوان</span><input className="sb-input" aria-label="عنوان النشاط" value={value.title ?? ""} onChange={e => patch({ title: e.target.value || undefined })} /></label>
      <label className="sb-inline"><span>الوصف</span><textarea className="sb-input sb-textarea" aria-label="وصف النشاط" value={value.description ?? ""} onChange={e => patch({ description: e.target.value || undefined })} /></label>
      <label className="sb-inline"><span>الإعدادات (JSON)</span><textarea className="sb-input sb-textarea sb-activity-json" aria-label="إعدادات النشاط (JSON)" dir="ltr" value={view.text} onChange={e => onConfigText(e.target.value)} /></label>
      <p className={"sb-activity-trust " + (safe ? "is-safe" : "is-unsafe")} role="status">{safe ? "✅ معتمد للامتحان" : "⚠️ غير معتمد للامتحان — سيُعرض بديل ثابت للطالب"}</p>
      {(issues.length > 0 || view.error) && (
        <ul className="sb-issues-list" aria-label="مشكلات النشاط">
          {view.error && <li className="sb-issue-error" data-code="INVALID_JSON">⛔ {view.error}</li>}
          {issues.map((i, n) => <li key={n} className="sb-issue-error" data-code={i.code}>⛔ {i.message}</li>)}
        </ul>
      )}
      <button type="button" className="sb-btn sb-btn-sm sb-btn-danger" onClick={() => onChange(undefined)}>إزالة النشاط</button>
    </fieldset>
  );
}
