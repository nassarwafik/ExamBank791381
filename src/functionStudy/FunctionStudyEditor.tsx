import { useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import FunctionStudyWorkspace from "./FunctionStudyWorkspace";
import { rationalCertificationChecks, rationalCertificationConfig } from "./functionStudyTemplates";
import { EXTREMUM_LABEL, INTERVAL_LABEL, TASK_TITLE, endpointToken } from "./functionStudyLabels";
import { FUNCTION_STUDY_LIMITS, FUNCTION_STUDY_TASKS, compileFunction, evaluateFunctionAt, validateFunctionStudyConfig, type FunctionStudyTask } from "../functionStudyModel";
import { parseNumberInput, parseNumberList, showNumber } from "../trustedSim/smartSimNumberInput";
import "./function-study.css";

// Phase 20A.2 — functionStudy2d@1 AUTHORING (lazy). The teacher writes f(x) in the SAFE expression language (live status from the same
// parser the server uses — never JavaScript), sets the drawing window and the analysis groups the student must answer, and writes the
// PRIVATE analytical truth per group (no CAS in v1: the teacher's key is the authority) with an explicit tolerance, a weight and the
// scoring mode. A probe evaluates f at any x through the shared evaluator; a collapsed preview runs the real student workspace.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const CHECK_FOR_TASK: Readonly<Record<FunctionStudyTask, string>> = Object.freeze({
  domainExclusions: "domain.exclusions", xIntercepts: "intercepts.x", yIntercept: "intercept.y", verticalAsymptotes: "asymptotes.vertical",
  horizontalAsymptotes: "asymptotes.horizontal", extrema: "extrema.points", monotonicIntervals: "monotonic.intervals"
});
const TASK_FOR_CHECK: Readonly<Record<string, FunctionStudyTask>> = Object.freeze(Object.fromEntries(Object.entries(CHECK_FOR_TASK).map(([t, k]) => [k, t as FunctionStudyTask])));
const HINT: Readonly<Record<string, string>> = Object.freeze({
  "domain.exclusions": "مثال: -2, 1", "asymptotes.vertical": "مثال: -2, 1", "asymptotes.horizontal": "مثال: 0", "intercept.y": "مثال: 2",
  "intercepts.x": "نقاط x y مفصولة بـ ; مثال: 2 0", "extrema.points": "مثال: min 0 2; max 4 0.2222", "monotonic.intervals": "مثال: decreasing -inf -2; increasing 0 1"
});
// ── text ⇄ expected value (the canonical validator remains the judge: an unparsable text is stored as text and blocks finalization) ──
const items = (text: string) => text.split(";").map(s => s.replace(/[()]/g, " ").split(/[\s,،]+/).filter(Boolean)).filter(t => t.length > 0);
function parseExpected(kind: string, text: string): unknown {
  if (kind === "intercept.y") { const n = parseNumberInput(text); return n === undefined ? text : n; }
  if (kind === "domain.exclusions" || kind === "asymptotes.vertical" || kind === "asymptotes.horizontal") return parseNumberList(text) ?? text;
  const out: unknown[] = [];
  for (const t of items(text)) {
    if (kind === "intercepts.x") { const [x, y] = t.map(parseNumberInput); if (t.length !== 2 || x === undefined || y === undefined) return text; out.push({ x, y }); }
    else if (kind === "extrema.points") { const [k, ...r] = t; const [x, y] = r.map(parseNumberInput); if (t.length !== 3 || (k !== "min" && k !== "max") || x === undefined || y === undefined) return text; out.push({ kind: k, x, y }); }
    else {
      const [k, a, b] = t; const from = endpointToken(a ?? "") ?? parseNumberInput(a ?? ""), to = endpointToken(b ?? "") ?? parseNumberInput(b ?? "");
      if (t.length !== 3 || (k !== "increasing" && k !== "decreasing") || from === undefined || to === undefined) return text;
      out.push({ kind: k, from, to });
    }
  }
  return out;
}
function formatExpected(kind: string, v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return showNumber(v);
  if (!Array.isArray(v)) return "";
  const n = (x: unknown) => (typeof x === "number" ? showNumber(x) : String(x));
  if (kind === "intercepts.x") return v.filter(isObj).map(p => n(p.x) + " " + n(p.y)).join("; ");
  if (kind === "extrema.points") return v.filter(isObj).map(p => String(p.kind) + " " + n(p.x) + " " + n(p.y)).join("; ");
  if (kind === "monotonic.intervals") return v.filter(isObj).map(p => String(p.kind) + " " + n(p.from) + " " + n(p.to)).join("; ");
  return v.map(n).join(", ");
}

export default function FunctionStudyEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const expression = isObj(c.expression) ? c.expression : { language: 2, variable: "x", source: "" };
  const win = isObj(c.window) ? c.window : {};
  const tasks = isObj(c.tasks) ? c.tasks : {};
  const list = checks.filter(isObj);
  const [probe, setProbe] = useState("0");
  const [preview, setPreview] = useState(0);
  const source = typeof expression.source === "string" ? expression.source : "";
  const compiled = compileFunction(source);
  const valid = validateFunctionStudyConfig(config);
  const setConfig = (next: Obj) => onChange({ config: { v: 1, expression, window: win, tasks, ...next } });
  const setCheck = (i: number, patch: Obj) => onChange({ checks: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const px = parseNumberInput(probe);
  const probeResult = compiled.ok && px !== undefined ? evaluateFunctionAt(compiled.ast, px) : undefined;
  const unchecked = FUNCTION_STUDY_TASKS.filter(t => tasks[t] === true && !list.some(k => k.kind === CHECK_FOR_TASK[t]));
  return (
    <div className="fnstudy-editor" data-testid="fnstudy-editor">
      <div className="fnstudy-row">
        <button type="button" disabled={disabled} onClick={() => onChange({ config: rationalCertificationConfig(), checks: rationalCertificationChecks(), scoring: "proportional" })}>قالب: الدالة النسبية (2x−4)/((x−1)(x+2))</button>
      </div>
      <fieldset>
        <legend>الدالة (لغة التعابير الآمنة، المتغير x فقط)</legend>
        <label><span>الدالة f(x)</span><input dir="ltr" className="fnstudy-ltr" autoComplete="off" spellCheck={false} maxLength={FUNCTION_STUDY_LIMITS.sourceChars} value={source} disabled={disabled}
          onChange={e => setConfig({ expression: { language: 2, variable: "x", source: e.target.value } })} /></label>
        <p className="fnstudy-note" data-testid="fnstudy-expression-status" role="status">{compiled.ok ? "✓ تعبير صالح." : "✗ تعبير غير صالح (" + compiled.code + "): استخدم x والأعداد و + - * / ^ والدوال abs, sqrt, pow, log, log10, exp, min, max, round, floor, ceil."}</p>
        <div className="fnstudy-row">
          <label><span>تجربة: x =</span><input dir="ltr" inputMode="decimal" value={probe} onChange={e => setProbe(e.target.value)} /></label>
          <span className="fnstudy-ltr" data-testid="fnstudy-probe">{probeResult === undefined ? "—" : probeResult.ok ? "f = " + showNumber(probeResult.value) : "غير معرّفة (" + probeResult.code + ")"}</span>
        </div>
      </fieldset>
      <fieldset>
        <legend>نافذة الرسم</legend>
        <div className="fnstudy-fields">
          {(["xMin", "xMax", "yMin", "yMax", "sampleCount"] as const).map(k => (
            <label key={k}><span className="fnstudy-ltr">{k}</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={win[k]} disabled={disabled} onValue={v => setConfig({ window: { ...win, [k]: v } })} /></label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>مجموعات التحليل المطلوبة من الطالب</legend>
        {FUNCTION_STUDY_TASKS.map(t => (
          <label key={t} className="fnstudy-row"><input type="checkbox" checked={tasks[t] === true} disabled={disabled} onChange={e => setConfig({ tasks: { ...Object.fromEntries(FUNCTION_STUDY_TASKS.map(k => [k, tasks[k] === true])), [t]: e.target.checked } })} /><span>{TASK_TITLE[t]}</span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend>مفتاح التصحيح الخاص (لا يصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={e => onChange({ scoring: e.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul className="fnstudy-list" aria-label="الفحوص">
          {list.map((k, i) => {
            const kind = String(k.kind);
            return (
              <li key={String(k.id) + ":" + kind} data-testid="fnstudy-check">
                <strong>{TASK_TITLE[TASK_FOR_CHECK[kind]] ?? kind}</strong>
                <label><span>الوصف</span><input value={typeof k.label === "string" ? k.label : ""} disabled={disabled} onChange={e => setCheck(i, { label: e.target.value })} /></label>
                <label><span>الإجابة المتوقعة</span><SmartSimDraftInput dir="ltr" placeholder={HINT[kind]} value={k.expected} disabled={disabled} format={v => formatExpected(kind, v)} parse={text => parseExpected(kind, text)} onValue={v => setCheck(i, { expected: v })} /></label>
                <label><span>السماحية ±</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.tolerance} disabled={disabled} onValue={v => setCheck(i, { tolerance: v })} /></label>
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => setCheck(i, { weight: v })} /></label>
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        {unchecked.length > 0 && (
          <div className="fnstudy-row">
            {unchecked.map(t => (
              <button key={t} type="button" className="is-secondary" disabled={disabled}
                onClick={() => onChange({ checks: [...list, { id: t, label: TASK_TITLE[t], weight: 1, kind: CHECK_FOR_TASK[t], expected: CHECK_FOR_TASK[t] === "intercept.y" ? 0 : [], tolerance: 0.01 }] })}>+ فحص: {TASK_TITLE[t]}</button>
            ))}
          </div>
        )}
        <p className="fnstudy-note">صيغة القيم القصوى: <span className="fnstudy-ltr">min x y</span> أو <span className="fnstudy-ltr">max x y</span> ({EXTREMUM_LABEL.min} / {EXTREMUM_LABEL.max})؛ الفترات: <span className="fnstudy-ltr">increasing|decreasing from to</span> ({INTERVAL_LABEL.increasing} / {INTERVAL_LABEL.decreasing}) مع <span className="fnstudy-ltr">-inf</span> و<span className="fnstudy-ltr">+inf</span>. الإجابة الفارغة («لا يوجد») غير مدعومة في هذا الإصدار كي لا يحصل الطالب على علامة دون عمل.</p>
      </fieldset>
      <details data-testid="fnstudy-preview" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="fnstudy-note">أصلح الإعداد لعرض المعاينة.</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <FunctionStudyWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}
