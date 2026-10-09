import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { validateFunctionGraphSpec, type FunctionGraphSpecV1 } from "../../functionGraphs/functionGraphSpec";
import { GRAPH_TARGET_KINDS, GRAPH_TARGET_KIND_LABELS, type GraphTargetKind } from "../../functionGraphs/graphTargets";
import { GRAPH_TEMPLATE_KEYS, GRAPH_TEMPLATE_LABELS, graphTemplate, structuralGraphTargetKeys, type GraphTemplateKey } from "../../functionGraphs/graphEditing";
import GraphEditor from "../../functionGraphs/GraphEditor";
import FunctionGraphView from "../../functionGraphs/FunctionGraphView";
import { useConfirm } from "../../ui/useConfirm";
import { FUNCTION_GRAPH_SELECTION_LIMITS, validateFunctionGraphSelectionQuestion, type FunctionGraphSelectionMode, type FunctionGraphSelectionScoring } from "../../functionGraphSelectionQuestion";

// Phase 21A.2 — functionGraphSelection@1 authoring (lazy). Workflow: create the graph (a template, then typed controls — expressions in the
// safe language, never JSON, never renderer options) → what the student selects (target kind, single / multiple, the bound, an optional
// instruction) → the correct target(s), chosen ON THE GRAPH ITSELF through the same semantic selection surface the student uses → the
// scoring. ONE source of truth: the question node holds config + key, and every emission writes both together, consistent:
//   • a graph edit drops key entries whose object no longer exists — read from the graph's STRUCTURE (also while an expression is being
//     typed), so an unrelated invalid edit never loses the key and a deleted object's id, later reused, never inherits it (a notice says so);
//   • a target-kind change clears the key (the same id never means another kind's object) — confirmed first when a key exists;
//   • single mode keeps one entry and allOrNothing scoring; the bound is clamped to the targets.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const MODE_LABELS: Readonly<Record<FunctionGraphSelectionMode, string>> = Object.freeze({ single: "اختيار واحد", multiple: "اختيار متعدد" });
const newGraphId = () => "graph-" + Math.random().toString(36).slice(2, 8);

export default function FunctionGraphSelectionEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const raw = isObj((node as { functionGraphSelection?: unknown }).functionGraphSelection) ? (node as { functionGraphSelection: Record<string, unknown> }).functionGraphSelection : {};
  const graph = isObj(raw.graph) ? (raw.graph as unknown as FunctionGraphSpecV1) : null;
  const target = ((GRAPH_TARGET_KINDS as readonly unknown[]).includes(raw.target) ? raw.target : "point") as GraphTargetKind;
  const mode: FunctionGraphSelectionMode = raw.mode === "multiple" ? "multiple" : "single";
  const max = typeof raw.maxSelections === "number" ? raw.maxSelections : 1;
  const label = typeof raw.label === "string" ? raw.label : "";
  const key = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  const scoring: FunctionGraphSelectionScoring = key.scoring === "partial" ? "partial" : "allOrNothing";
  const correct = useMemo(() => (Array.isArray(key.correct) ? (key.correct as unknown[]).filter((k): k is string => typeof k === "string") : []), [key.correct]);
  const valid = useMemo(() => (graph ? validateFunctionGraphSpec(graph) : null), [graph]);
  const issues = useMemo(() => validateFunctionGraphSelectionQuestion(node as unknown as Record<string, unknown>), [node]);
  const [template, setTemplate] = useState<GraphTemplateKey>("quadratic");
  const [notice, setNotice] = useState("");
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const counts = useMemo(() => Object.fromEntries(GRAPH_TARGET_KINDS.map(k => [k, structuralGraphTargetKeys(graph, k).length])) as Record<GraphTargetKind, number>, [graph]);

  /** One emission's content: the public config and the key together, mutually consistent. */
  const resolve = (next: { graph?: FunctionGraphSpecV1; target?: GraphTargetKind; mode?: FunctionGraphSelectionMode; max?: number; label?: string; scoring?: FunctionGraphSelectionScoring; correct?: string[] }) => {
    const g = next.graph ?? graph, t = next.target ?? target, m = next.mode ?? mode;
    const order = structuralGraphTargetKeys(g, t);
    let ok = next.target !== undefined && next.target !== target ? [] : next.correct ?? correct;
    ok = order.filter(k => ok.includes(k));
    let mx = m === "single" ? 1 : Math.max(1, Math.round(next.max ?? max));
    if (order.length) mx = Math.min(mx, order.length);
    if (m === "single") ok = ok.slice(0, 1);
    const sc = m === "single" ? "allOrNothing" : (next.scoring ?? scoring);
    const l = next.label ?? label;
    return { functionGraphSelection: { v: 1, ...(g ? { graph: g } : {}), target: t, mode: m, maxSelections: mx, ...(l.trim() ? { label: l } : {}) }, answer: { scoring: sc, correct: ok } };
  };
  const write = (next: Parameters<typeof resolve>[0]) => {
    const r = resolve(next);
    const lost = correct.filter(k => !r.answer.correct.includes(k));
    if (next.graph && lost.length && next.target === undefined) setNotice("أُزيل من الإجابة الصحيحة ما حُذف من الرسم (" + lost.length + "). راجع الإجابة الصحيحة.");
    else if (next.graph === undefined) setNotice("");
    onChange(r as never);
  };
  const changeTarget = async (t: GraphTargetKind) => {
    if (t === target) return;
    if (correct.length && !(await confirm({ title: "تغيير نوع العنصر", message: "تغيير ما يختاره الطالب يمسح الإجابة الصحيحة المحدَّدة؛ ستحددها من جديد على الرسم.", confirmLabel: "تغيير ومسح الإجابة", tone: "danger" }))) return;
    write({ target: t });
  };

  return (
    <div className="qt-editor qt-editor-functionGraphSelection" data-testid="qt-editor-functionGraphSelection" dir="rtl">
      {!graph ? (
        <div className="vq-fields" role="group" aria-label="إنشاء رسم الدالة">
          <p className="vq-note">أنشئ رسم الدالة الذي سيختار منه الطالب، ثم عدّل التعابير والنقاط والعناصر.</p>
          <label className="vq-field"><span>القالب</span>
            <select className="sb-input sb-input-sm" value={template} onChange={e => setTemplate(e.target.value as GraphTemplateKey)} disabled={disabled}>
              {GRAPH_TEMPLATE_KEYS.map(k => <option key={k} value={k}>{GRAPH_TEMPLATE_LABELS[k]}</option>)}
            </select>
          </label>
          <button type="button" className="sb-mini-btn" disabled={disabled} onClick={() => write({ graph: graphTemplate(template, newGraphId()) })}>إنشاء رسم الدالة</button>
        </div>
      ) : (
        <>
          <section aria-label="رسم الدالة"><GraphEditor graph={graph} name="الرسم" disabled={disabled} confirm={confirm} preview={false} onChange={g => write({ graph: g })} onReplace={g => write({ graph: g, correct: [] })} /></section>
          <section className="vq-fields" aria-label="ما يختاره الطالب">
            <label className="vq-field"><span>يختار الطالب</span>
              <select className="sb-input sb-input-sm" aria-label="نوع العنصر الذي يختاره الطالب" value={target} disabled={disabled} onChange={e => void changeTarget(e.target.value as GraphTargetKind)}>
                {GRAPH_TARGET_KINDS.map(k => <option key={k} value={k}>{GRAPH_TARGET_KIND_LABELS[k] + " (" + counts[k] + ")"}</option>)}
              </select>
            </label>
            <label className="vq-field"><span>طريقة الاختيار</span>
              <select className="sb-input sb-input-sm" aria-label="طريقة الاختيار" value={mode} disabled={disabled} onChange={e => write({ mode: e.target.value as FunctionGraphSelectionMode })}>
                {(["single", "multiple"] as const).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
              </select>
            </label>
            {mode !== "single" && (
              <label className="vq-field"><span>أقصى عدد للاختيارات</span>
                <input className="sb-input sb-input-sm" type="number" min={1} max={Math.max(1, counts[target])} value={maxDraft ?? String(max)} aria-label="أقصى عدد للاختيارات" disabled={disabled}
                  onChange={e => { const t = e.target.value, n = Number(t); setMaxDraft(t); if (t.trim() === "" || !Number.isInteger(n) || n < 1) return; write({ max: n }); if (counts[target] && n > counts[target]) setMaxDraft(String(counts[target])); }}
                  onBlur={() => setMaxDraft(null)} />
              </label>
            )}
            <label className="vq-field"><span>تعليمة الاختيار (اختيارية)</span>
              <input className="sb-input sb-input-sm" value={label} maxLength={FUNCTION_GRAPH_SELECTION_LIMITS.labelChars} aria-label="تعليمة الاختيار" placeholder="مثال: اختر جذري الدالة" disabled={disabled} onChange={e => write({ label: e.target.value })} />
            </label>
            {mode !== "single" && (
              <label className="vq-field"><span>الاحتساب</span>
                <select className="sb-input sb-input-sm" aria-label="طريقة الاحتساب" value={scoring} disabled={disabled} onChange={e => write({ scoring: e.target.value as FunctionGraphSelectionScoring })}>
                  <option value="allOrNothing">الكل أو لا شيء</option><option value="partial">جزئية (التقاطع ÷ الاتحاد)</option>
                </select>
              </label>
            )}
          </section>
          {notice && <p className="vq-note" role="status" data-testid="graph-key-notice">{notice}</p>}
          <section aria-label="الإجابة الصحيحة" data-testid="graph-key-picker">
            <p className="vq-note">حدّد الإجابة الصحيحة على الرسم نفسه (بالنقر أو من القائمة) — بالطريقة نفسها التي يجيب بها الطالب. لا يرى الطالب هذا التحديد ولا أدوار النقاط.</p>
            {valid?.ok
              ? <FunctionGraphView spec={valid.value} selection={{ kind: target, mode, max: mode === "single" ? 1 : Math.max(1, Math.min(max, counts[target] || 1)), value: correct, label: "الإجابة الصحيحة", readOnly: disabled, onChange: next => write({ correct: next }) }} />
              : <p className="vq-note">صحّح أخطاء الرسم لتظهر المعاينة ولتحديد الإجابة الصحيحة.</p>}
          </section>
        </>
      )}
      {confirmDialog}
      {issues.length > 0 && <ul className="vq-issues" data-testid="graph-selection-issues">{issues.slice(0, 10).map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
    </div>
  );
}
