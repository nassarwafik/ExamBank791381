import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { formatParametricNumber } from "../../parametricEngine";
import { previewParametricSample, validateParametricNumericQuestion } from "../../parametricNumericQuestion";
import "../../parametric/parametric.css";

// Phase 19B — parametricNumeric@1 authoring (lazy). The teacher never writes JSON: variables (id, min, max, step), constraints,
// the answer expression (closed language, shown LTR), tolerance or a range around the result, and the unit policy are edited as
// form controls; the stem is the question text with {{id}} placeholders (inserted with one click). A SAMPLE PREVIEW generated in
// the PREVIEW namespace (never a student's seed) shows the values, the rendered stem and the sample answer — teacher-only. Every
// problem comes from the SAME canonical validator that blocks finalization.
type Var = { id: string; kind: "int"; min: number; max: number; step: number };
type Response = { unit: "none" } | { unit: "label"; label: string } | { unit: "input" };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
function readModel(node: Record<string, unknown>) {
  const p = isObj(node.parametric) ? node.parametric : {};
  const variables: Var[] = Array.isArray(p.variables) ? p.variables.filter(isObj).map(v => ({ id: typeof v.id === "string" ? v.id : "", kind: "int", min: numOr(v.min, 1), max: numOr(v.max, 10), step: numOr(v.step, 1) })) : [];
  const constraints: string[] = Array.isArray(p.constraints) ? p.constraints.map(c => (typeof c === "string" ? c : "")) : [];
  const r = isObj(p.response) ? p.response : {};
  const response: Response = r.unit === "input" ? { unit: "input" } : r.unit === "label" ? { unit: "label", label: typeof r.label === "string" ? r.label : "" } : { unit: "none" };
  const a = isObj(node.answer) ? node.answer : {};
  const key = { expression: typeof a.expression === "string" ? a.expression : "", mode: a.mode === "range" ? "range" as const : "tolerance" as const, tolerance: numOr(a.tolerance, 0), below: numOr(a.below, 0), above: numOr(a.above, 0), unit: typeof a.unit === "string" ? a.unit : "" };
  return { variables, constraints, response, key };
}
type Model = ReturnType<typeof readModel>;
const nextVarId = (taken: Set<string>) => { for (const c of "abcdefghijklmnopqrstuvwxyz") if (!taken.has(c)) return c; let n = 1; while (taken.has("v" + n)) n++; return "v" + n; };
const intOrUndefined = (raw: string): number | undefined => { if (raw.trim() === "") return undefined; const n = Number(raw); return Number.isFinite(n) ? n : undefined; };

export default function ParametricNumericEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const n = node as unknown as Record<string, unknown>;
  const m = readModel(n);
  const [sample, setSample] = useState(1);
  const issues = useMemo(() => validateParametricNumericQuestion(n), [n]);
  const preview = useMemo(() => previewParametricSample(n, sample), [n, sample]);

  const writeConfig = (next: Partial<Pick<Model, "variables" | "constraints" | "response">>) => {
    const v = { ...m, ...next };
    onChange({ parametric: { v: 1, generatorVersion: 1, variables: v.variables, constraints: v.constraints, response: v.response } } as never);
    return v;
  };
  const writeAnswer = (key: Model["key"], response: Response = m.response) => {
    const answer: Record<string, unknown> = key.mode === "range" ? { expression: key.expression, mode: "range", below: key.below, above: key.above } : { expression: key.expression, mode: "tolerance", tolerance: key.tolerance };
    if (response.unit === "input" && key.unit !== "") answer.unit = key.unit;
    onChange({ answer } as never);
  };
  const setVar = (i: number, patch: Partial<Var>) => writeConfig({ variables: m.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const setResponse = (response: Response) => { writeConfig({ response }); writeAnswer(m.key, response); };
  const insertPlaceholder = (id: string) => { const t = typeof n.text === "string" ? n.text : ""; onChange({ text: t + (t === "" || t.endsWith(" ") ? "" : " ") + "{{" + id + "}}" } as never); };

  return (
    <div className="qt-editor qt-editor-parametricNumeric" data-testid="qt-editor-parametricNumeric">
      <p className="sb-hint">اكتب نص السؤال في حقل نص السؤال واستخدم <bdi dir="ltr">{"{{a}}"}</bdi> لعرض قيمة المتغير a. يحصل كل طالب في كل محاولة على قيم مختلفة ثابتة لا تتغير بالتحديث أو الإيقاف المؤقت.</p>

      <fieldset>
        <legend>المتغيرات (أعداد صحيحة)</legend>
        {m.variables.map((v, i) => (
          <div className="param-var-row" key={i}>
            <label className="sb-inline"><span>المعرّف</span><input type="text" dir="ltr" aria-label={"معرّف المتغير " + (i + 1)} value={v.id} onChange={e => setVar(i, { id: e.target.value })} disabled={disabled} /></label>
            <label className="sb-inline"><span>من</span><input type="number" step="1" dir="ltr" aria-label={"أدنى قيمة للمتغير " + (i + 1)} value={v.min} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) setVar(i, { min: x }); }} disabled={disabled} /></label>
            <label className="sb-inline"><span>إلى</span><input type="number" step="1" dir="ltr" aria-label={"أعلى قيمة للمتغير " + (i + 1)} value={v.max} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) setVar(i, { max: x }); }} disabled={disabled} /></label>
            <label className="sb-inline"><span>الخطوة</span><input type="number" step="1" min="1" dir="ltr" aria-label={"خطوة المتغير " + (i + 1)} value={v.step} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) setVar(i, { step: x }); }} disabled={disabled} /></label>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"إدراج {{" + v.id + "}} في نص السؤال"} onClick={() => insertPlaceholder(v.id)} disabled={disabled || v.id === ""}>{"إدراج {{" + v.id + "}}"}</button>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"حذف المتغير " + (i + 1)} onClick={() => writeConfig({ variables: m.variables.filter((_, j) => j !== i) })} disabled={disabled || m.variables.length <= 1}>حذف</button>
          </div>
        ))}
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => writeConfig({ variables: [...m.variables, { id: nextVarId(new Set(m.variables.map(v => v.id))), kind: "int", min: 1, max: 10, step: 1 }] })} disabled={disabled}>+ متغير</button>
      </fieldset>

      <fieldset>
        <legend>القيود (اختياري)</legend>
        <p className="sb-hint">مقارنة واحدة لكل قيد، مثل <bdi dir="ltr">a &lt; b</bdi> أو <bdi dir="ltr">b != 0</bdi>. تُستبعد القيم التي لا تحقق كل القيود.</p>
        {m.constraints.map((c, i) => (
          <div className="param-constraint-row" key={i}>
            <input type="text" dir="ltr" aria-label={"القيد " + (i + 1)} value={c} onChange={e => writeConfig({ constraints: m.constraints.map((x, j) => (j === i ? e.target.value : x)) })} disabled={disabled} />
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"حذف القيد " + (i + 1)} onClick={() => writeConfig({ constraints: m.constraints.filter((_, j) => j !== i) })} disabled={disabled}>حذف</button>
          </div>
        ))}
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => writeConfig({ constraints: [...m.constraints, ""] })} disabled={disabled}>+ قيد</button>
      </fieldset>

      <fieldset>
        <legend>الإجابة (للمعلم فقط)</legend>
        <label className="sb-field param-expression"><span>تعبير الإجابة</span>
          <input type="text" dir="ltr" aria-label="تعبير الإجابة" value={m.key.expression} placeholder="a * b" onChange={e => writeAnswer({ ...m.key, expression: e.target.value })} disabled={disabled} />
        </label>
        <p className="sb-hint">المسموح: الأعداد والمتغيرات و <bdi dir="ltr">+ - * / % ^</bdi> والأقواس و <bdi dir="ltr">abs round floor ceil min max</bdi>. لا يُنفَّذ أي كود.</p>
        <div className="sb-field-row">
          <label className="sb-inline"><span>طريقة المقارنة</span>
            <select aria-label="طريقة المقارنة" value={m.key.mode} onChange={e => writeAnswer({ ...m.key, mode: e.target.value === "range" ? "range" : "tolerance", tolerance: 0, below: 0, above: 0 })} disabled={disabled}>
              <option value="tolerance">الناتج ± تسامح</option>
              <option value="range">مدى حول الناتج</option>
            </select>
          </label>
          {m.key.mode === "tolerance" ? (
            <label className="sb-inline"><span>التسامح (±)</span><input type="number" step="any" min="0" dir="ltr" aria-label="التسامح" value={m.key.tolerance} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, tolerance: x }); }} disabled={disabled} /></label>
          ) : (
            <>
              <label className="sb-inline"><span>أقل من الناتج بمقدار</span><input type="number" step="any" min="0" dir="ltr" aria-label="أقل من الناتج بمقدار" value={m.key.below} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, below: x }); }} disabled={disabled} /></label>
              <label className="sb-inline"><span>أعلى من الناتج بمقدار</span><input type="number" step="any" min="0" dir="ltr" aria-label="أعلى من الناتج بمقدار" value={m.key.above} onChange={e => { const x = intOrUndefined(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, above: x }); }} disabled={disabled} /></label>
            </>
          )}
        </div>
        <div className="sb-field-row">
          <label className="sb-inline"><span>وحدة الإجابة</span>
            <select aria-label="وحدة الإجابة" value={m.response.unit} onChange={e => setResponse(e.target.value === "input" ? { unit: "input" } : e.target.value === "label" ? { unit: "label", label: "" } : { unit: "none" })} disabled={disabled}>
              <option value="none">بلا وحدة</option>
              <option value="label">وحدة ثابتة تظهر بجانب الإجابة</option>
              <option value="input">يكتب الطالب الوحدة (تُصحَّح)</option>
            </select>
          </label>
          {m.response.unit === "label" && <label className="sb-inline"><span>نص الوحدة</span><input type="text" dir="auto" aria-label="نص الوحدة" value={m.response.label} onChange={e => writeConfig({ response: { unit: "label", label: e.target.value } })} disabled={disabled} /></label>}
          {m.response.unit === "input" && <label className="sb-inline"><span>الوحدة الصحيحة</span><input type="text" dir="ltr" aria-label="الوحدة الصحيحة" value={m.key.unit} onChange={e => writeAnswer({ ...m.key, unit: e.target.value })} disabled={disabled} /></label>}
        </div>
      </fieldset>

      <section className="param-sample" data-testid="param-sample" aria-label="عينة معاينة">
        <p><strong>عينة معاينة رقم {sample}</strong> — للمعلم فقط، وليست قيم أي طالب.</p>
        {preview.ok ? (
          <>
            <p dir="ltr">{Object.entries(preview.values).map(([k, v]) => k + " = " + formatParametricNumber(v)).join(", ")}</p>
            <p dir="auto">{preview.text}</p>
            <p data-testid="param-sample-answer">الإجابة الصحيحة للعينة: <bdi dir="ltr">{preview.expected === null ? "—" : formatParametricNumber(preview.expected)}</bdi></p>
          </>
        ) : <p>تعذّر توليد عينة بالإعداد الحالي.</p>}
        <div><button type="button" className="sb-btn sb-btn-sm" onClick={() => setSample(s => s + 1)} disabled={disabled}>عينة جديدة</button></div>
      </section>

      {issues.length > 0 && <ul className="param-issues" data-testid="param-issues" role="status">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
    </div>
  );
}
