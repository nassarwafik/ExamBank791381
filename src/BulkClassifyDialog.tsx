import { useState } from "react";
import Dialog from "./ui/Dialog";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { blueprintCognitiveLevels, blueprintDifficultyScale, difficultyValues, orderedTopics } from "./assessmentBlueprint";
import type { BulkClassification, FieldOp, ListOp } from "./assessmentBulkClassify";

// Phase 13C-B — تصنيف المحدد: collects ONE BulkClassification for the owner, which applies it as ONE onChange(updater).
// Every field is tri-state (بدون تغيير / قيمة / مسح) so nothing the teacher did not touch is ever cleared; list fields
// use explicit add / remove / replace / clear modes.
type Props = { open: boolean; onClose: () => void; blueprint?: AssessmentBlueprintV1; count: number; onApply: (change: BulkClassification) => void };
const CLEAR = "__clear__";
type ListMode = "keep" | "add" | "remove" | "replace" | "clear";
const LIST_MODE_LABEL: Record<ListMode, string> = { keep: "بدون تغيير", add: "إضافة", remove: "إزالة", replace: "استبدال", clear: "مسح" };

function fieldOp<T>(v: string, parse: (s: string) => T): FieldOp<T> | undefined { return v === "" ? undefined : v === CLEAR ? { op: "clear" } : { op: "set", value: parse(v) }; }
function listOp(mode: ListMode, ids: string[]): ListOp | undefined { return mode === "keep" ? undefined : mode === "clear" ? { op: "clear" } : { op: mode, ids }; }

export default function BulkClassifyDialog({ open, onClose, blueprint, count, onApply }: Props) {
  const topics = orderedTopics(blueprint);
  const objectives = blueprint?.objectives ?? [];
  const levels = blueprintCognitiveLevels(blueprint);
  const scale = blueprintDifficultyScale(blueprint);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [cognitive, setCognitive] = useState("");
  const [objMode, setObjMode] = useState<ListMode>("keep");
  const [objIds, setObjIds] = useState<string[]>([]);
  const [secMode, setSecMode] = useState<ListMode>("keep");
  const [secIds, setSecIds] = useState<string[]>([]);
  const toggle = (set: (f: (prev: string[]) => string[]) => void, id: string) => set(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const apply = () => {
    const change: BulkClassification = {};
    const t = fieldOp(topic, s => s); if (t) change.primaryTopicId = t;
    const d = fieldOp(difficulty, Number); if (d) change.difficulty = d;
    const c = fieldOp(cognitive, s => s); if (c) change.cognitiveLevel = c;
    const o = listOp(objMode, objIds); if (o) change.objectiveIds = o;
    const s = listOp(secMode, secIds); if (s) change.secondaryTopicIds = s;
    onApply(change);
  };
  const triState = (label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className="sb-inline sb-bp-field"><span>{label}</span>
      <select className="sb-input" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">بدون تغيير</option>
        <option value={CLEAR}>مسح</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const chips = (label: string, mode: ListMode, setMode: (m: ListMode) => void, modeLabel: string, ids: string[], onToggle: (id: string) => void, items: { id: string; label: string }[]) => (
    <div className="sb-classify-list">
      <label className="sb-inline sb-bp-field"><span>{modeLabel}</span>
        <select className="sb-input" aria-label={modeLabel} value={mode} onChange={e => setMode(e.target.value as ListMode)}>
          {(Object.keys(LIST_MODE_LABEL) as ListMode[]).map(m => <option key={m} value={m}>{LIST_MODE_LABEL[m]}</option>)}
        </select>
      </label>
      <fieldset className="sb-class-chips" aria-label={label} disabled={mode === "keep" || mode === "clear"}>
        {items.length === 0 && <span className="sb-hint">لا عناصر في المخطط بعد.</span>}
        {items.map(o => <label key={o.id} className={"sb-chip" + (ids.includes(o.id) ? " is-on" : "")}><input type="checkbox" checked={ids.includes(o.id)} onChange={() => onToggle(o.id)} />{o.label || o.id}</label>)}
      </fieldset>
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} size="md" title="تصنيف المحدد" className="sb-classify-dialog">
      <div className="sb-classify">
        <p className="sb-hint" role="status">سيُطبَّق التصنيف على {count} أسئلة محددة في خطوة واحدة (يمكن التراجع عنها). الحقول «بدون تغيير» لا تُمسّ.</p>
        {triState("الموضوع الرئيسي", topic, setTopic, topics.map(t => ({ value: t.id, label: " ".repeat(t.depth * 2) + (t.label || t.id) })))}
        {triState("الصعوبة", difficulty, setDifficulty, difficultyValues(blueprint).map(v => ({ value: String(v), label: scale.labels?.[String(v)] ? v + " — " + scale.labels[String(v)] : String(v) })))}
        {triState("المستوى المعرفي", cognitive, setCognitive, levels.map(l => ({ value: l.id, label: l.label })))}
        {chips("الأهداف التعليمية", objMode, setObjMode, "وضع الأهداف", objIds, id => toggle(setObjIds, id), objectives.map(o => ({ id: o.id, label: o.label })))}
        {chips("مواضيع ثانوية", secMode, setSecMode, "وضع المواضيع الثانوية", secIds, id => toggle(setSecIds, id), topics.map(t => ({ id: t.id, label: t.label })))}
        <div className="sb-classify-actions">
          <button type="button" className="sb-btn sb-btn-primary" onClick={apply}>تطبيق التصنيف</button>
          <button type="button" className="sb-btn" onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </Dialog>
  );
}
