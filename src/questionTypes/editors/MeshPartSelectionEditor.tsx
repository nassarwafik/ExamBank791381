import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import MeshModelEditor from "../../meshModels/MeshModelEditor";
import type { MeshModelSpecV1 } from "../../meshModels/meshModelSpec";
import { MESH_PART_SELECTION_LIMITS, validateMeshPartSelectionQuestion, type MeshPartSelectionMode, type MeshPartSelectionScoring } from "../../meshPartSelectionQuestion";

// Phase 21D-B.3 — meshPartSelection@1 authoring (lazy). The model (asset, labelled parts, controls, starting view) is authored with the
// B.2 MeshModelEditor; this editor adds the QUESTION: single / multiple selection, the student instruction, optional neutral part names
// (identification questions), the scoring and the PRIVATE answer key — the correct parts, chosen among the labelled parts only. The key is
// written to `answer` (removed by the student sanitizer); whenever the labelled parts change, correct parts that no longer exist are
// dropped and the teacher is told. Every change is validated live by the same authority the server finalizes and grades with.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const MODE_LABELS: Readonly<Record<MeshPartSelectionMode, string>> = Object.freeze({ single: "اختيار جزء واحد", multiple: "اختيار عدة أجزاء" });
const newModelId = () => "model" + Date.now().toString(36);

export default function MeshPartSelectionEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const raw = isObj((node as { meshPartSelection?: unknown }).meshPartSelection) ? (node as { meshPartSelection: Record<string, unknown> }).meshPartSelection : {};
  const model = isObj(raw.model) ? raw.model as unknown as MeshModelSpecV1 : null;
  const mode: MeshPartSelectionMode = raw.mode === "multiple" ? "multiple" : "single";
  const max = typeof raw.maxSelections === "number" ? raw.maxSelections : 1;
  const label = typeof raw.label === "string" ? raw.label : "";
  const hideLabels = raw.hideLabels === true;
  const key = isObj(node.answer) ? node.answer as Record<string, unknown> : {};
  const scoring: MeshPartSelectionScoring = key.scoring === "partial" ? "partial" : "allOrNothing";
  const correct = useMemo(() => (Array.isArray(key.correct) ? (key.correct as unknown[]).filter((x): x is string => typeof x === "string") : []), [key.correct]);
  const [notice, setNotice] = useState("");
  const [modelId] = useState(() => model?.id ?? newModelId());
  const issues = useMemo(() => validateMeshPartSelectionQuestion(node as unknown as Record<string, unknown>), [node]);
  const parts = model && Array.isArray(model.parts) ? model.parts : [];

  type Next = { model?: MeshModelSpecV1; mode?: MeshPartSelectionMode; max?: number; label?: string; hideLabels?: boolean; scoring?: MeshPartSelectionScoring; correct?: string[] };
  const write = (next: Next) => {
    const m = next.model ?? model, md = next.mode ?? mode, order = m && Array.isArray(m.parts) ? m.parts.map(p => p.id) : [];
    let ok = (next.correct ?? correct).filter(id => order.includes(id));
    ok = order.filter(id => ok.includes(id));
    let mx = md === "single" ? 1 : Math.max(1, Math.round(next.max ?? max));
    if (order.length) mx = Math.min(mx, order.length);
    if (md === "single") ok = ok.slice(0, 1);
    const lost = correct.filter(id => !ok.includes(id));
    if (next.model && lost.length) setNotice("أُزيل من مفتاح الإجابة ما لم يعد جزءًا مسمّى في النموذج (" + lost.length + ").");
    else if (next.mode && lost.length) setNotice("الاختيار الواحد يحتفظ بإجابة صحيحة واحدة فقط.");
    else setNotice("");
    const l = next.label ?? label, hide = next.hideLabels ?? hideLabels;
    const sc = md === "single" ? "allOrNothing" : (next.scoring ?? scoring);
    onChange({
      meshPartSelection: { v: 1, ...(m ? { model: m } : {}), mode: md, maxSelections: mx, ...(l.trim() ? { label: l } : {}), ...(hide ? { hideLabels: true } : {}) },
      answer: { scoring: sc, correct: ok }
    } as never);
  };
  const toggleCorrect = (id: string) => {
    if (disabled) return;
    if (correct.includes(id)) write({ correct: correct.filter(x => x !== id) });
    else write({ correct: mode === "single" ? [id] : [...correct, id] });
  };

  return (
    <div className="qt-editor qt-mesh-selection" data-testid="qt-editor-meshPartSelection" dir="rtl">
      <MeshModelEditor value={model} onChange={m => write({ model: m })} modelId={modelId} disabled={disabled} />
      {model && <>
        <fieldset className="mm3d-fields" disabled={disabled}>
          <legend>السؤال</legend>
          <label>تعليمة للطالب (اختيارية)<input type="text" value={label} maxLength={MESH_PART_SELECTION_LIMITS.labelChars} placeholder="مثال: انقر الحجرة التي تضخ الدم المؤكسج إلى الجسم." onChange={e => write({ label: e.target.value })} /></label>
          <div className="mm3d-inline">
            {(["single", "multiple"] as const).map(m => <label key={m}><input type="radio" name={"mesh-mode-" + modelId} checked={mode === m} onChange={() => write({ mode: m })} />{MODE_LABELS[m]}</label>)}
          </div>
          {mode === "multiple" && <label>أقصى عدد للاختيارات<input type="number" min={1} max={Math.max(1, parts.length)} value={max} onChange={e => write({ max: Number(e.target.value) })} /></label>}
          {mode === "multiple" && <div className="mm3d-inline">
            <label><input type="radio" name={"mesh-scoring-" + modelId} checked={scoring === "allOrNothing"} onChange={() => write({ scoring: "allOrNothing" })} />كل العلامة أو لا شيء</label>
            <label><input type="radio" name={"mesh-scoring-" + modelId} checked={scoring === "partial"} onChange={() => write({ scoring: "partial" })} />علامة جزئية (الصحيح ÷ اتحاد المختار والصحيح)</label>
          </div>}
          <label className="mm3d-include"><input type="checkbox" checked={hideLabels} onChange={e => write({ hideLabels: e.target.checked })} />إخفاء أسماء الأجزاء عن الطالب (تظهر «الجزء ١، الجزء ٢…») — لأسئلة التعرّف</label>
          {hideLabels && <p className="mm3d-note">إخفاء الأسماء تعليمي: لا تذكر قائمةُ الطالب الإجابة، لكن معرّفات الأجزاء التقنية تبقى ضمن بيانات النموذج كما في أسئلة 3D الأخرى.</p>}
        </fieldset>
        <fieldset className="mm3d-fields" disabled={disabled} data-testid="mesh-answer-key">
          <legend>الإجابة الصحيحة (لا تصل إلى الطالب)</legend>
          {parts.length ? <ul className="mm3d-key-list">
            {parts.map(p => <li key={p.id} data-part={p.id}>
              <label className="mm3d-include"><input type={mode === "single" ? "radio" : "checkbox"} name={"mesh-key-" + modelId} checked={correct.includes(p.id)} onChange={() => toggleCorrect(p.id)} aria-label={"إجابة صحيحة: " + p.label} />{p.label}</label>
            </li>)}
          </ul> : <p className="mm3d-note">سمِّ أجزاء النموذج أولًا.</p>}
          {notice && <p className="mm3d-note" role="status">{notice}</p>}
        </fieldset>
      </>}
      {issues.length > 0 && <div className="mm3d-issues" role="alert" data-testid="mesh-question-issues">
        <strong>يحتاج السؤال إلى استكمال قبل الاعتماد:</strong>
        <ul>{issues.slice(0, 8).map((i, k) => <li key={k} data-code={i.code}>{i.message}</li>)}</ul>
      </div>}
    </div>
  );
}
