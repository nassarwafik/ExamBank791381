import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { formatParametricNumber, formatParametricValue, type ParametricFormat } from "../../parametricEngine";
import { PARAMETRIC_SAMPLE_COUNTS, previewParametricSample, previewParametricSamples, upgradeParametricConfigToV2, validateParametricNumericQuestion, type ParametricInspectedSample } from "../../parametricNumericQuestion";
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

/** Phase 19B editor, kept for v1 (generatorVersion 1) questions: they stay v1 until the teacher explicitly upgrades the draft. */
function ParametricNumericEditorV1({ node, onChange, disabled }: AuthoringEditorProps) {
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
      <div className="param-upgrade" role="note">
        <span>هذا السؤال بالإصدار 1 (أعداد صحيحة فقط). الترقية تتيح القيم العشرية والقيم المشتقة والدوال الإضافية وتنسيق العرض، لكنها تغيّر القيم المولّدة للمحاولات الجديدة.</span>
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => { const up = upgradeParametricConfigToV2(n.parametric); if (up) onChange({ parametric: up } as never); }} disabled={disabled || upgradeParametricConfigToV2(n.parametric) === null}>ترقية إلى الإصدار 2</button>
      </div>

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

// ── Phase 19C — the v2 editor (generatorVersion 2) ──────────────────────────────────────────────────────────────────────
// Eight teacher-facing sections, no JSON and no AST vocabulary: variables (explicit integer / decimal), derived values, constraints,
// the question template, the answer formula, the answer comparison, the display format and the sample generator with a TEACHER-ONLY
// solution inspector. Samples are PREVIEW-namespace instances computed locally (pure functions): nothing is fetched, no attempt is
// touched, and no preview data is ever written onto the question. Every problem comes from the canonical validator, inline.
type Kind = "integer" | "decimal";
type VarV2 = { id: string; kind: Kind; min: number; max: number; step: number; format?: ParametricFormat };
type DerivedV2 = { id: string; expression: string; format?: ParametricFormat };
const readFormat = (f: unknown): ParametricFormat | undefined => (isObj(f) && (f.kind === "fixed" || f.kind === "percentage") && typeof f.decimals === "number" ? { kind: f.kind, decimals: f.decimals } : isObj(f) && f.kind === "plain" ? { kind: "plain" } : undefined);
function readModelV2(node: Record<string, unknown>) {
  const base = readModel(node);
  const p = isObj(node.parametric) ? node.parametric : {};
  const variables: VarV2[] = Array.isArray(p.variables) ? p.variables.filter(isObj).map(v => { const f = readFormat(v.format); return { id: typeof v.id === "string" ? v.id : "", kind: v.kind === "decimal" ? "decimal" : "integer", min: numOr(v.min, 1), max: numOr(v.max, 10), step: numOr(v.step, 1), ...(f ? { format: f } : {}) }; }) : [];
  const derived: DerivedV2[] = Array.isArray(p.derivedVariables) ? p.derivedVariables.filter(isObj).map(d => { const f = readFormat(d.format); return { id: typeof d.id === "string" ? d.id : "", expression: typeof d.expression === "string" ? d.expression : "", ...(f ? { format: f } : {}) }; }) : [];
  return { ...base, variables, derived };
}
type ModelV2 = ReturnType<typeof readModelV2>;
const fmtNum = (v: number) => formatParametricNumber(v);
const valuesLine = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => k + " = " + fmtNum(v)).join(", ");

function SampleInspector({ s }: { s: Extract<ParametricInspectedSample, { ok: true }> }) {
  return (
    <div className="param-inspector" data-testid="param-inspector" role="region" aria-label={"فحص الحل للعينة " + s.sample}>
      <p><strong>المتغيرات:</strong> <bdi dir="ltr">{valuesLine(s.values)}</bdi></p>
      {Object.keys(s.derived).length > 0 && <p><strong>القيم المشتقة:</strong> <bdi dir="ltr">{valuesLine(s.derived)}</bdi></p>}
      {s.constraints.length > 0 && <ul className="param-inspector-constraints" aria-label="تقييم القيود">{s.constraints.map((c, i) => <li key={i}><bdi dir="ltr">{c.source}</bdi> — <bdi dir="ltr">{c.left === null ? "؟" : fmtNum(c.left)} | {c.right === null ? "؟" : fmtNum(c.right)}</bdi> {c.holds ? "✓" : "✗"}</li>)}</ul>}
      <p><strong>تعبير الإجابة:</strong> <bdi dir="ltr">{s.expression ?? "—"}</bdi></p>
      <p><strong>الناتج الدقيق:</strong> <bdi dir="ltr">{s.expected === null ? "—" : fmtNum(s.expected)}</bdi></p>
      {s.policy && <p><strong>سياسة المقارنة:</strong> {s.policy.mode === "tolerance" ? "التسامح ± " + fmtNum(s.policy.tolerance) : "مدى من الناتج − " + fmtNum(s.policy.below) + " إلى الناتج + " + fmtNum(s.policy.above)}{s.policy.unit ? " · الوحدة: " + s.policy.unit : ""}</p>}
      <p className="sb-hint">رقم المحاولة المقبولة للمولّد: {s.candidate}. هذه البيانات للمعلم فقط ولا تُرسل إلى الطالب.</p>
    </div>
  );
}

function ParametricNumericEditorV2({ node, onChange, disabled }: AuthoringEditorProps) {
  const n = node as unknown as Record<string, unknown>;
  const m = readModelV2(n);
  const [count, setCount] = useState(3);
  const [start, setStart] = useState(1);
  const [inspect, setInspect] = useState<number | null>(null);
  const issues = useMemo(() => validateParametricNumericQuestion(n), [n]);
  const samples = useMemo(() => previewParametricSamples(n, count, start), [n, count, start]);
  const symbols = [...m.variables.map(v => v.id), ...m.derived.map(d => d.id)].filter(Boolean);

  const writeConfig = (next: Partial<Pick<ModelV2, "variables" | "derived" | "constraints" | "response">>) => {
    const v = { ...m, ...next };
    onChange({ parametric: { v: 2, generatorVersion: 2, variables: v.variables, derivedVariables: v.derived, constraints: v.constraints, response: v.response } } as never);
  };
  const writeAnswer = (key: Model["key"], response: Response = m.response) => {
    const answer: Record<string, unknown> = key.mode === "range" ? { expression: key.expression, mode: "range", below: key.below, above: key.above } : { expression: key.expression, mode: "tolerance", tolerance: key.tolerance };
    if (response.unit === "input" && key.unit !== "") answer.unit = key.unit;
    onChange({ answer } as never);
  };
  const setVar = (i: number, patch: Partial<VarV2>) => writeConfig({ variables: m.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const setDerived = (i: number, patch: Partial<DerivedV2>) => writeConfig({ derived: m.derived.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setResponse = (response: Response) => { writeConfig({ response }); writeAnswer(m.key, response); };
  const insertPlaceholder = (id: string) => { const t = typeof n.text === "string" ? n.text : ""; onChange({ text: t + (t === "" || t.endsWith(" ") ? "" : " ") + "{{" + id + "}}" } as never); };
  const setFormat = (id: string, f: ParametricFormat | undefined) => {
    const strip = <T extends { format?: ParametricFormat }>(x: T): T => { const { format: _drop, ...rest } = x; void _drop; return (f && f.kind !== "plain" ? { ...rest, format: f } : rest) as T; };
    if (m.variables.some(v => v.id === id)) writeConfig({ variables: m.variables.map(v => (v.id === id ? strip(v) : v)) });
    else writeConfig({ derived: m.derived.map(d => (d.id === id ? strip(d) : d)) });
  };
  const formatOf = (id: string): ParametricFormat | undefined => m.variables.find(v => v.id === id)?.format ?? m.derived.find(d => d.id === id)?.format;
  const num = (raw: string): number | undefined => intOrUndefined(raw);

  return (
    <div className="qt-editor qt-editor-parametricNumeric" data-testid="qt-editor-parametricNumeric">
      <fieldset>
        <legend>المتغيرات</legend>
        <p className="sb-hint">لكل متغير نوع صريح: عدد صحيح أو عدد عشري (حتى 6 منازل). تُولَّد القيم من الحد الأدنى إلى الأعلى بالخطوة المحددة.</p>
        {m.variables.map((v, i) => (
          <div className="param-var-row" key={i}>
            <label className="sb-inline"><span>المعرّف</span><input type="text" dir="ltr" aria-label={"معرّف المتغير " + (i + 1)} value={v.id} onChange={e => setVar(i, { id: e.target.value })} disabled={disabled} /></label>
            <label className="sb-inline"><span>النوع</span>
              <select aria-label={"نوع المتغير " + (i + 1)} value={v.kind} onChange={e => setVar(i, { kind: e.target.value === "decimal" ? "decimal" : "integer" })} disabled={disabled}>
                <option value="integer">عدد صحيح</option>
                <option value="decimal">عدد عشري</option>
              </select>
            </label>
            <label className="sb-inline"><span>من</span><input type="number" step={v.kind === "decimal" ? "any" : "1"} dir="ltr" aria-label={"أدنى قيمة للمتغير " + (i + 1)} value={v.min} onChange={e => { const x = num(e.target.value); if (x !== undefined) setVar(i, { min: x }); }} disabled={disabled} /></label>
            <label className="sb-inline"><span>إلى</span><input type="number" step={v.kind === "decimal" ? "any" : "1"} dir="ltr" aria-label={"أعلى قيمة للمتغير " + (i + 1)} value={v.max} onChange={e => { const x = num(e.target.value); if (x !== undefined) setVar(i, { max: x }); }} disabled={disabled} /></label>
            <label className="sb-inline"><span>الخطوة</span><input type="number" step={v.kind === "decimal" ? "any" : "1"} min="0" dir="ltr" aria-label={"خطوة المتغير " + (i + 1)} value={v.step} onChange={e => { const x = num(e.target.value); if (x !== undefined) setVar(i, { step: x }); }} disabled={disabled} /></label>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"إدراج {{" + v.id + "}} في نص السؤال"} onClick={() => insertPlaceholder(v.id)} disabled={disabled || v.id === ""}>{"إدراج {{" + v.id + "}}"}</button>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"حذف المتغير " + (i + 1)} onClick={() => writeConfig({ variables: m.variables.filter((_, j) => j !== i) })} disabled={disabled || m.variables.length <= 1}>حذف</button>
          </div>
        ))}
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => writeConfig({ variables: [...m.variables, { id: nextVarId(new Set(symbols)), kind: "integer", min: 1, max: 10, step: 1 }] })} disabled={disabled}>+ متغير</button>
      </fieldset>

      <fieldset>
        <legend>القيم المشتقة</legend>
        <p className="sb-hint">قيمة تُحسب من المتغيرات أو من قيم مشتقة أخرى، مثل <bdi dir="ltr">area = a * b</bdi>. يُرفض الاعتماد الدائري.</p>
        {m.derived.map((d, i) => (
          <div className="param-var-row" key={i}>
            <label className="sb-inline"><span>الاسم</span><input type="text" dir="ltr" aria-label={"اسم القيمة المشتقة " + (i + 1)} value={d.id} onChange={e => setDerived(i, { id: e.target.value })} disabled={disabled} /></label>
            <label className="sb-inline param-expression"><span>الصيغة</span><input type="text" dir="ltr" aria-label={"صيغة القيمة المشتقة " + (i + 1)} value={d.expression} placeholder="a * b" onChange={e => setDerived(i, { expression: e.target.value })} disabled={disabled} /></label>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"إدراج {{" + d.id + "}} في نص السؤال"} onClick={() => insertPlaceholder(d.id)} disabled={disabled || d.id === ""}>{"إدراج {{" + d.id + "}}"}</button>
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"حذف القيمة المشتقة " + (i + 1)} onClick={() => writeConfig({ derived: m.derived.filter((_, j) => j !== i) })} disabled={disabled}>حذف</button>
          </div>
        ))}
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => writeConfig({ derived: [...m.derived, { id: nextVarId(new Set(symbols)), expression: "" }] })} disabled={disabled}>+ قيمة مشتقة</button>
      </fieldset>

      <fieldset>
        <legend>القيود</legend>
        <p className="sb-hint">مقارنة واحدة لكل قيد (‎== != &lt; &lt;= &gt; &gt;=‎)، مثل <bdi dir="ltr">a != b</bdi> أو <bdi dir="ltr">sqrt(a) &lt; b</bdi>؛ يجب أن تتحقق كلها معًا.</p>
        {m.constraints.map((c, i) => (
          <div className="param-constraint-row" key={i}>
            <input type="text" dir="ltr" aria-label={"القيد " + (i + 1)} value={c} onChange={e => writeConfig({ constraints: m.constraints.map((x, j) => (j === i ? e.target.value : x)) })} disabled={disabled} />
            <button type="button" className="sb-btn sb-btn-sm" aria-label={"حذف القيد " + (i + 1)} onClick={() => writeConfig({ constraints: m.constraints.filter((_, j) => j !== i) })} disabled={disabled}>حذف</button>
          </div>
        ))}
        <button type="button" className="sb-btn sb-btn-sm" onClick={() => writeConfig({ constraints: [...m.constraints, ""] })} disabled={disabled}>+ قيد</button>
      </fieldset>

      <fieldset>
        <legend>نص السؤال</legend>
        <p className="sb-hint">اكتب نص السؤال في حقل نص السؤال واستخدم <bdi dir="ltr">{"{{a}}"}</bdi> لعرض قيمة. الرموز المتاحة: <bdi dir="ltr">{symbols.join("، ") || "—"}</bdi>. يحصل كل طالب في كل محاولة على قيم ثابتة لا تتغير بالتحديث أو الإيقاف المؤقت.</p>
      </fieldset>

      <fieldset>
        <legend>صيغة الإجابة</legend>
        <label className="sb-field param-expression"><span>تعبير الإجابة</span>
          <input type="text" dir="ltr" aria-label="تعبير الإجابة" value={m.key.expression} placeholder="area" onChange={e => writeAnswer({ ...m.key, expression: e.target.value })} disabled={disabled} />
        </label>
        <p className="sb-hint">المسموح: الأعداد والرموز و <bdi dir="ltr">+ - * / % ^</bdi> والأقواس و <bdi dir="ltr">abs round floor ceil min max sqrt pow log log10 exp</bdi>. لا يُنفَّذ أي كود. للنسبة المئوية اكتب <bdi dir="ltr">100 * correct / total</bdi>.</p>
      </fieldset>

      <fieldset>
        <legend>مقارنة الإجابة</legend>
        <div className="sb-field-row">
          <label className="sb-inline"><span>طريقة المقارنة</span>
            <select aria-label="طريقة المقارنة" value={m.key.mode} onChange={e => writeAnswer({ ...m.key, mode: e.target.value === "range" ? "range" : "tolerance", tolerance: 0, below: 0, above: 0 })} disabled={disabled}>
              <option value="tolerance">الناتج ± تسامح</option>
              <option value="range">مدى حول الناتج</option>
            </select>
          </label>
          {m.key.mode === "tolerance" ? (
            <label className="sb-inline"><span>التسامح (±)</span><input type="number" step="any" min="0" dir="ltr" aria-label="التسامح" value={m.key.tolerance} onChange={e => { const x = num(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, tolerance: x }); }} disabled={disabled} /></label>
          ) : (
            <>
              <label className="sb-inline"><span>أقل من الناتج بمقدار</span><input type="number" step="any" min="0" dir="ltr" aria-label="أقل من الناتج بمقدار" value={m.key.below} onChange={e => { const x = num(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, below: x }); }} disabled={disabled} /></label>
              <label className="sb-inline"><span>أعلى من الناتج بمقدار</span><input type="number" step="any" min="0" dir="ltr" aria-label="أعلى من الناتج بمقدار" value={m.key.above} onChange={e => { const x = num(e.target.value); if (x !== undefined) writeAnswer({ ...m.key, above: x }); }} disabled={disabled} /></label>
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

      <fieldset>
        <legend>تنسيق العرض</legend>
        <p className="sb-hint">التنسيق يغيّر طريقة كتابة القيمة في نص السؤال فقط؛ التصحيح يستخدم القيم الدقيقة دائمًا. إن عرضت قيمة مقرّبة فاجعل التسامح مناسبًا.</p>
        {symbols.map(id => {
          const f = formatOf(id);
          return (
            <div className="param-var-row" key={id}>
              <label className="sb-inline"><span dir="ltr">{id}</span>
                <select aria-label={"تنسيق عرض " + id} value={f?.kind ?? "plain"} onChange={e => setFormat(id, e.target.value === "fixed" || e.target.value === "percentage" ? { kind: e.target.value, decimals: f && f.kind !== "plain" ? f.decimals : 2 } : undefined)} disabled={disabled}>
                  <option value="plain">كما هو</option>
                  <option value="fixed">منازل عشرية ثابتة</option>
                  <option value="percentage">نسبة مئوية</option>
                </select>
              </label>
              {f && f.kind !== "plain" && <label className="sb-inline"><span>المنازل</span><input type="number" step="1" min="0" max="10" dir="ltr" aria-label={"منازل " + id + " العشرية"} value={f.decimals} onChange={e => { const x = num(e.target.value); if (x !== undefined) setFormat(id, { kind: f.kind, decimals: x }); }} disabled={disabled} /></label>}
              {f && f.kind !== "plain" && <span className="sb-hint" dir="ltr">{formatParametricValue(f.kind === "percentage" ? 0.1234 : 3.14159, f)}</span>}
            </div>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>توليد العينات</legend>
        <p className="sb-hint">عينات معاينة للمعلم فقط من مساحة معاينة منفصلة — ليست قيم أي طالب ولا تنشئ محاولة ولا تُحفظ في السؤال.</p>
        <div className="sb-field-row">
          <label className="sb-inline"><span>عدد العينات</span>
            <select aria-label="عدد العينات" value={count} onChange={e => { setCount(Number(e.target.value)); setStart(1); setInspect(null); }} disabled={disabled}>
              {PARAMETRIC_SAMPLE_COUNTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" className="sb-btn sb-btn-sm" onClick={() => { setStart(s => s + count); setInspect(null); }} disabled={disabled}>عينات أخرى</button>
        </div>
        {samples.ok ? (
          <ol className="param-samples" data-testid="param-samples">
            {samples.samples.map(s => (
              <li key={s.sample} className="param-sample" data-testid="param-sample-item">
                <p><strong>عينة {s.sample}</strong> {s.ok && s.issues.length === 0 ? "✓ صالحة" : "⚠"}</p>
                {s.ok ? (
                  <>
                    <p dir="auto">{s.text}</p>
                    <p dir="ltr">{valuesLine(s.values)}{Object.keys(s.derived).length ? " · " + valuesLine(s.derived) : ""}</p>
                    <p data-testid="param-sample-expected">الإجابة المتوقعة: <bdi dir="ltr">{s.expected === null ? "—" : fmtNum(s.expected)}</bdi></p>
                    {s.issues.length > 0 && <p className="param-issues">{s.issues.map(x => x.message).join(" ")}</p>}
                    <button type="button" className="sb-btn sb-btn-sm" aria-expanded={inspect === s.sample} onClick={() => setInspect(v => (v === s.sample ? null : s.sample))}>{"فحص الحل للعينة " + s.sample}</button>
                    {inspect === s.sample && <SampleInspector s={s} />}
                  </>
                ) : <p className="param-issues">{s.issues.map(x => x.message).join(" ")}</p>}
              </li>
            ))}
          </ol>
        ) : <p className="param-issues">تعذّر توليد العينات بالإعداد الحالي.</p>}
      </fieldset>

      {issues.length > 0 && <ul className="param-issues" data-testid="param-issues" role="status">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
    </div>
  );
}

export default function ParametricNumericEditor(props: AuthoringEditorProps) {
  const p = (props.node as unknown as { parametric?: { v?: unknown } }).parametric;
  return p && p.v === 2 ? <ParametricNumericEditorV2 {...props} /> : <ParametricNumericEditorV1 {...props} />;
}
