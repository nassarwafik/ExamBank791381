import { useMemo } from "react";
import Dialog from "./ui/Dialog";
import { BUILDER_QUESTION_TYPES, QUESTION_TYPE_LABELS } from "./examTypes";
import {
  emptyBlueprint, validateBlueprint, orderedTopics, addTopic, updateTopic, setTopicParent, removeTopic, addObjective, updateObjective, removeObjective,
  upsertConstraint, updateConstraint, removeConstraint, setSubject, setContextIdentity, setTargets, newTopicId, newObjectiveId, newConstraintId,
  blueprintCognitiveLevels, difficultyValues, blueprintDifficultyScale
} from "./assessmentBlueprint";
import { BLUEPRINT_DIMENSIONS, BLUEPRINT_METRICS, BLUEPRINT_UNITS, type AssessmentBlueprintV1, type BlueprintConstraint, type BlueprintDimension } from "./assessmentTypes";

// Phase 13C-A — مخطط الامتحان: a restrained, domain-neutral Blueprint authoring surface. It NEVER owns blueprint state:
// every edit is handed to the owner as a pure blueprint updater which the builder dispatches as ONE onChange(updater)
// (one history step, undo/redo/autosave for free). Opening the panel on an exam without a blueprint dispatches nothing.

type Edit = (fn: (bp: AssessmentBlueprintV1) => AssessmentBlueprintV1) => void;
type Props = { open: boolean; onClose: () => void; blueprint: AssessmentBlueprintV1 | undefined; sections: { id: string; title: string }[]; onEdit: Edit; disabled?: boolean };

const DIMENSION_LABEL: Record<BlueprintDimension, string> = { topic: "موضوع", objective: "هدف تعليمي", difficulty: "صعوبة", cognitiveLevel: "مستوى معرفي", questionType: "نوع السؤال", capability: "مهارة / قدرة", section: "قسم" };
const METRIC_LABEL = { count: "عدد الأسئلة", marks: "العلامات" } as const;
const UNIT_LABEL = { absolute: "قيمة مطلقة", percent: "نسبة مئوية" } as const;
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));
const issueLabel = (code: string) => code;

export default function BlueprintPanel({ open, onClose, blueprint, sections, onEdit, disabled }: Props) {
  // View model: the real blueprint or an EMPTY VIEW (never dispatched) so the panel can render before the first edit.
  const bp = blueprint ?? emptyBlueprint();
  const issues = useMemo(() => (blueprint ? validateBlueprint(blueprint, { sectionIds: sections.map(s => s.id) }) : []), [blueprint, sections]);   // R4: real section ids
  const topics = useMemo(() => orderedTopics(bp), [bp]);
  const levels = blueprintCognitiveLevels(bp);
  const scale = blueprintDifficultyScale(bp);
  // R1: a context identity is authored as an explicit stable id + a display label. Renaming the label never touches the id
  // (no slugging); clearing both removes the identity; a partial identity is kept as data and reported by the validator.
  const identity = (field: "curriculum" | "course" | "level", label: string) => (
    <div className="sb-bp-identity">
      <label className="sb-inline sb-bp-field"><span>{label}</span>
        <input className="sb-input" aria-label={label} value={bp[field]?.label ?? ""} disabled={disabled}
          onChange={e => { const v = e.target.value; onEdit(b => setContextIdentity(b, field, { id: b[field]?.id ?? "", label: v })); }} />
      </label>
      <label className="sb-inline sb-bp-field"><span>معرّف {label}</span>
        <input className="sb-input" aria-label={"معرّف " + label} dir="ltr" placeholder="معرّف ثابت" value={bp[field]?.id ?? ""} disabled={disabled}
          onChange={e => { const v = e.target.value; onEdit(b => setContextIdentity(b, field, { id: v, label: b[field]?.label ?? "" })); }} />
      </label>
    </div>
  );
  const refControl = (c: BlueprintConstraint) => {
    const set = (ref: string) => onEdit(b => updateConstraint(b, c.id, { ref }));
    const common = { className: "sb-input sb-input-sm", "aria-label": "المرجع", value: c.ref, disabled } as const;
    switch (c.dimension) {
      case "topic": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{topics.map(t => <option key={t.id} value={t.id}>{" ".repeat(t.depth * 2)}{t.label || t.id}</option>)}</select>;
      case "objective": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{bp.objectives.map(o => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}</select>;
      case "difficulty": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{difficultyValues(bp).map(v => <option key={v} value={String(v)}>{scale.labels?.[String(v)] ? v + " — " + scale.labels[String(v)] : String(v)}</option>)}</select>;
      case "cognitiveLevel": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{levels.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>;
      case "questionType": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{BUILDER_QUESTION_TYPES.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}</select>;
      case "section": return <select {...common} onChange={e => set(e.target.value)}><option value="">اختر…</option>{sections.map(s => <option key={s.id} value={s.id}>{s.title || s.id}</option>)}</select>;
      default: return <input {...common} placeholder="مثال: cli, calculation" onChange={e => set(e.target.value)} />;
    }
  };
  const limit = (c: BlueprintConstraint, key: "min" | "target" | "max", label: string) => (
    <label className="sb-inline"><span>{label}</span><input className="sb-input sb-input-xs" type="number" aria-label={label} value={c[key] ?? ""} disabled={disabled} onChange={e => { const v = num(e.target.value); onEdit(b => updateConstraint(b, c.id, { [key]: v })); }} /></label>
  );

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="مخطط الامتحان" className="sb-bp-dialog">
      <div className="sb-bp">
        <p className="sb-hint">المخطط بيانات تخطيطية للمعلّم: المادة والمواضيع والأهداف والقيود. لا يصل إلى الطالب، ولا يمنع الحفظ في هذه المرحلة.</p>

        <section className="sb-bp-section" aria-labelledby="sb-bp-subject">
          <h3 id="sb-bp-subject" className="sb-bp-h">المادة والسياق</h3>
          <div className="sb-bp-grid">
            <label className="sb-inline sb-bp-field"><span>اسم المادة</span><input className="sb-input" aria-label="اسم المادة" value={bp.subject.label} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => setSubject(b, { ...b.subject, label: v })); }} /></label>
            <label className="sb-inline sb-bp-field"><span>معرّف المادة</span><input className="sb-input" aria-label="معرّف المادة" dir="ltr" placeholder="مثال: physics" value={bp.subject.id} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => setSubject(b, { ...b.subject, id: v })); }} /></label>
            {identity("curriculum", "المنهاج")}
            {identity("course", "المقرر")}
            {identity("level", "المستوى")}
          </div>
        </section>

        <section className="sb-bp-section" aria-labelledby="sb-bp-targets">
          <h3 id="sb-bp-targets" className="sb-bp-h">الأهداف الإجمالية</h3>
          <div className="sb-bp-grid">
            <label className="sb-inline"><span>إجمالي الأسئلة المستهدف</span><input className="sb-input sb-input-xs" type="number" min="0" aria-label="إجمالي الأسئلة المستهدف" value={bp.targets?.totalQuestions ?? ""} disabled={disabled} onChange={e => { const v = num(e.target.value); onEdit(b => setTargets(b, { totalQuestions: v })); }} /></label>
            <label className="sb-inline"><span>إجمالي العلامات المستهدف</span><input className="sb-input sb-input-xs" type="number" min="0" aria-label="إجمالي العلامات المستهدف" value={bp.targets?.totalMarks ?? ""} disabled={disabled} onChange={e => { const v = num(e.target.value); onEdit(b => setTargets(b, { totalMarks: v })); }} /></label>
          </div>
        </section>

        <section className="sb-bp-section" aria-labelledby="sb-bp-topics">
          <div className="sb-row-between"><h3 id="sb-bp-topics" className="sb-bp-h">المواضيع</h3><button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => onEdit(b => addTopic(b, { id: newTopicId(), label: "" }))}>إضافة موضوع</button></div>
          {topics.length === 0 && <p className="sb-hint">لا مواضيع بعد. المعرّفات ثابتة: تغيير الاسم لا يفكّ ربط الأسئلة.</p>}
          <ul className="sb-bp-list" aria-label="المواضيع">
            {topics.map(t => (
              <li key={t.id} className="sb-bp-item" data-topic-id={t.id} data-depth={t.depth} style={{ paddingInlineStart: t.depth * 18 }}>
                <input className="sb-input" aria-label="اسم الموضوع" placeholder="اسم الموضوع" value={t.label} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => updateTopic(b, t.id, { label: v })); }} />
                <code className="sb-code-chip" title="معرّف ثابت">{t.id}</code>
                <label className="sb-inline"><span>الأب</span>
                  <select className="sb-input sb-input-sm" aria-label="الموضوع الأب" value={t.parentId ?? ""} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => setTopicParent(b, t.id, v || undefined)); }}>
                    <option value="">— بدون —</option>{topics.filter(o => o.id !== t.id).map(o => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}
                  </select></label>
                <button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => onEdit(b => addTopic(b, { id: newTopicId(), label: "", parentId: t.id }))}>إضافة موضوع فرعي</button>
                <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف الموضوع" title="حذف الموضوع" disabled={disabled} onClick={() => onEdit(b => removeTopic(b, t.id))}>×</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="sb-bp-section" aria-labelledby="sb-bp-objectives">
          <div className="sb-row-between"><h3 id="sb-bp-objectives" className="sb-bp-h">الأهداف التعليمية</h3><button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => onEdit(b => addObjective(b, { id: newObjectiveId(), label: "" }))}>إضافة هدف تعليمي</button></div>
          <ul className="sb-bp-list" aria-label="الأهداف التعليمية">
            {bp.objectives.map(o => (
              <li key={o.id} className="sb-bp-item" data-objective-id={o.id}>
                <input className="sb-input" aria-label="نص الهدف" placeholder="نص الهدف التعليمي" value={o.label} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => updateObjective(b, o.id, { label: v })); }} />
                <label className="sb-inline"><span>الموضوع</span>
                  <select className="sb-input sb-input-sm" aria-label="موضوع الهدف" value={o.topicId ?? ""} disabled={disabled} onChange={e => { const v = e.target.value; onEdit(b => updateObjective(b, o.id, { topicId: v || undefined })); }}>
                    <option value="">— بدون —</option>{topics.map(t => <option key={t.id} value={t.id}>{t.label || t.id}</option>)}
                  </select></label>
                <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف الهدف" title="حذف الهدف" disabled={disabled} onClick={() => onEdit(b => removeObjective(b, o.id))}>×</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="sb-bp-section" aria-labelledby="sb-bp-constraints">
          <div className="sb-row-between"><h3 id="sb-bp-constraints" className="sb-bp-h">القيود (التوزيع والتغطية)</h3><button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => onEdit(b => upsertConstraint(b, { id: newConstraintId(), dimension: "topic", ref: "", metric: "count", unit: "absolute" }))}>إضافة قيد</button></div>
          <ul className="sb-bp-list" aria-label="القيود">
            {bp.constraints.map(c => (
              <li key={c.id} className="sb-bp-item sb-bp-constraint" data-constraint-id={c.id}>
                <label className="sb-inline"><span>البُعد</span>
                  <select className="sb-input sb-input-sm" aria-label="البُعد" value={c.dimension} disabled={disabled} onChange={e => { const v = e.target.value as BlueprintDimension; onEdit(b => updateConstraint(b, c.id, v === c.dimension ? {} : { dimension: v, ref: "" })); }}>
                    {BLUEPRINT_DIMENSIONS.map(d => <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>)}
                  </select></label>
                <label className="sb-inline"><span>المرجع</span>{refControl(c)}</label>
                <label className="sb-inline"><span>المقياس</span>
                  <select className="sb-input sb-input-sm" aria-label="المقياس" value={c.metric} disabled={disabled} onChange={e => { const v = e.target.value as BlueprintConstraint["metric"]; onEdit(b => updateConstraint(b, c.id, { metric: v })); }}>{BLUEPRINT_METRICS.map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select></label>
                <label className="sb-inline"><span>الوحدة</span>
                  <select className="sb-input sb-input-sm" aria-label="الوحدة" value={c.unit} disabled={disabled} onChange={e => { const v = e.target.value as BlueprintConstraint["unit"]; onEdit(b => updateConstraint(b, c.id, { unit: v })); }}>{BLUEPRINT_UNITS.map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></label>
                {limit(c, "min", "الحد الأدنى")}{limit(c, "target", "الهدف")}{limit(c, "max", "الحد الأقصى")}
                <button type="button" className="sb-icon-btn sb-danger" aria-label="حذف القيد" title="حذف القيد" disabled={disabled} onClick={() => onEdit(b => removeConstraint(b, c.id))}>×</button>
              </li>
            ))}
          </ul>
        </section>

        {issues.length > 0 && (
          <section className="sb-bp-section sb-bp-issues" aria-labelledby="sb-bp-issues-h">
            <h3 id="sb-bp-issues-h" className="sb-bp-h">مشكلات المخطط ({issues.length})</h3>
            <ul className="sb-issues-list" aria-label="مشكلات المخطط">{issues.map((i, n) => <li key={n} className="sb-issue-error" data-code={i.code} data-path={i.path}>⛔ {i.message} <span className="sb-bp-code" dir="ltr">{issueLabel(i.code)}</span></li>)}</ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
