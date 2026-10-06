import { useId, useMemo, useState, type ReactNode } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { sampleFunction, validateFunctionStudyConfig, type FunctionStudyConfigV1, type FunctionStudyTask } from "../functionStudyModel";
import { initialFunctionStudyState, normalizeFunctionStudyAction, replayFunctionStudy, type FunctionStudyStateV1 } from "../functionStudyPlugin";
import { parseNumberInput, parseNumberList, showNumber } from "../trustedSim/smartSimNumberInput";
import { EXTREMUM_LABEL, INTERVAL_LABEL, TASK_TITLE, endpointToken, showEndpoint, showList, showPoint } from "./functionStudyLabels";
import "./function-study.css";

// Phase 20A.2 — the functionStudy2d@1 STUDENT workspace (lazy; also the teacher preview). It shows the PUBLIC function (an LTR island
// inside the RTL page) and its graph — sampled by the shared safe engine, broken at singularities — and NOTHING the analysis asks for:
// no asymptote, intercept, extremum or interval is ever drawn or labelled by the workspace itself. Only the student's OWN saved analysis
// is drawn back (dashed lines, markers, open circles). Every graded group is entered through labelled forms (the keyboard path); a save
// emits ONE semantic action that replaces the group, validated by the same normalizer the server replays. Invalid input never emits.
const W = 480, H = 320, PAD = 28;
type Act = { type?: unknown };
const typeOf = (a: unknown) => (a && typeof a === "object" ? (a as Act).type : undefined);

function Task({ task, children }: { task: FunctionStudyTask; children: ReactNode }) {
  return <fieldset className="fnstudy-task" data-testid="fnstudy-task" data-task={task}><legend>{TASK_TITLE[task]}</legend>{children}</fieldset>;
}
function Saved({ text }: { text: string }) { return <p className="fnstudy-saved">المحفوظ: <span className="fnstudy-ltr">{text}</span></p>; }
function Problem({ error }: { error: string }) { return error ? <p className="fnstudy-error" role="alert">{error}</p> : null; }

/** A single list of numbers (exclusions, vertical / horizontal asymptotes). */
function NumberListTask({ task, field, type, saved, disabled, label, submit }: { task: FunctionStudyTask; field: string; type: string; saved: number[]; disabled?: boolean; label: string; submit: (a: Record<string, unknown>) => string }) {
  const [draft, setDraft] = useState(saved.map(showNumber).join(", "));
  const [error, setError] = useState("");
  const save = () => { const v = parseNumberList(draft); setError(v === undefined ? "أدخل أعدادًا مفصولة بفواصل (مثل 1, -2)." : submit({ type, [field]: v })); };
  return (
    <Task task={task}>
      <label><span>{label}</span><input type="text" dir="ltr" inputMode="decimal" autoComplete="off" spellCheck={false} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} /></label>
      {!disabled && <div className="fnstudy-row"><button type="button" onClick={save}>حفظ</button></div>}
      <Problem error={error} />
      <Saved text={showList(saved)} />
    </Task>
  );
}

type Row = Record<string, string>;
/** Repeating rows (x-intercepts, extrema, intervals): every row is validated, then the whole group is saved as one action. */
function RowsTask({ task, addLabel, rowLabel, rows: initial, fields, disabled, toAction, savedText, submit }: {
  task: FunctionStudyTask; addLabel: string; rowLabel: string; rows: Row[]; disabled?: boolean; savedText: string;
  fields: { key: string; label: (n: number) => string; options?: { value: string; label: string }[] }[];
  toAction: (rows: Row[]) => Record<string, unknown> | string; submit: (a: Record<string, unknown>) => string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [error, setError] = useState("");
  const blank = () => Object.fromEntries(fields.map(f => [f.key, f.options ? f.options[0].value : ""]));
  const save = () => { const a = toAction(rows); setError(typeof a === "string" ? a : submit(a)); };
  return (
    <Task task={task}>
      {rows.map((r, i) => (
        <div className="fnstudy-row" key={i}>
          {fields.map(f => (
            <label key={f.key}><span>{f.label(i + 1)}</span>
              {f.options
                ? <select value={r[f.key]} disabled={disabled} onChange={e => setRows(rows.map((x, k) => (k === i ? { ...x, [f.key]: e.target.value } : x)))}>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : <input type="text" dir="ltr" autoComplete="off" spellCheck={false} value={r[f.key]} disabled={disabled} onChange={e => setRows(rows.map((x, k) => (k === i ? { ...x, [f.key]: e.target.value } : x)))} />}
            </label>
          ))}
          {!disabled && <button type="button" className="is-secondary" onClick={() => setRows(rows.filter((_, k) => k !== i))}>حذف {rowLabel} {i + 1}</button>}
        </div>
      ))}
      {!disabled && <div className="fnstudy-row"><button type="button" className="is-secondary" onClick={() => setRows([...rows, blank()])} disabled={rows.length >= 20}>{addLabel}</button><button type="button" onClick={save}>حفظ</button></div>}
      <Problem error={error} />
      <Saved text={savedText} />
    </Task>
  );
}
const numberOrError = (text: string, what: string): number | string => { const n = parseNumberInput(text); return n === undefined ? "أدخل رقمًا صالحًا في " + what + "." : n; };

export default function FunctionStudyWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const clip = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const cfg = useMemo<FunctionStudyConfigV1 | null>(() => { const r = validateFunctionStudyConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayFunctionStudy(cfg, actions) : null), [cfg, actions]);
  const sample = useMemo(() => (cfg ? sampleFunction(cfg) : null), [cfg]);
  if (!cfg || !sample) return <p className="ncli-unavailable" role="note" data-testid="fnstudy-unavailable">إعداد دراسة الدالة لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const st: FunctionStudyStateV1 = replay && replay.ok ? replay.state : initialFunctionStudyState();
  const base = replay && replay.ok ? [...actions] : [];
  /** Validates with the plugin's normalizer, replaces earlier actions of the same group and emits; returns an error text or "". */
  const submit = (action: Record<string, unknown>): string => {
    if (!normalizeFunctionStudyAction(action, cfg).ok) return "تحقق من القيم: أعداد منتهية بلا تكرار (حتى 20)، وبداية كل فترة أصغر من نهايتها.";
    const next = [...base.filter(a => typeOf(a) !== action.type), action];
    const r = replayFunctionStudy(cfg, next);
    if (!r.ok) return "تعذّر حفظ التحليل.";
    onChange(next, r.state);
    return "";
  };
  const { xMin, xMax, yMin, yMax } = cfg.window;
  const px = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);
  const span = yMax - yMin, cy = (y: number) => py(Math.min(yMax + span, Math.max(yMin - span, y)));
  const inX = (x: number) => x >= xMin && x <= xMax, inY = (y: number) => y >= yMin && y <= yMax;
  const ticks = (lo: number, hi: number) => { const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4))); const k = (hi - lo) / step > 10 ? step * 2 : step; const out: number[] = []; for (let v = Math.ceil(lo / k) * k; v <= hi + 1e-9 && out.length < 30; v += k) out.push(Number(v.toPrecision(10))); return out; };
  const t = cfg.tasks;
  return (
    <div className="fnstudy" data-testid="fnstudy-workspace" aria-label={label ? label + " — دراسة دالة" : "دراسة دالة"}>
      <p className="fnstudy-formula">ادرس الدالة <span className="fnstudy-ltr">f(x)</span>: <code className="fnstudy-ltr" dir="ltr" data-testid="fnstudy-expression">{cfg.expression.source}</code></p>
      <p className="fnstudy-note">الرسم للاستكشاف فقط ولا يحدد الإجابات؛ أدخل تحليلك في النماذج ثم احفظ كل مجموعة. يُرسم ما تحفظه على المنحنى.</p>
      <div className="fnstudy-graph" data-testid="fnstudy-graph" dir="ltr">
        <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label={"منحنى الدالة على النافذة من " + showNumber(xMin) + " إلى " + showNumber(xMax)}>
          <defs><clipPath id={clip}><rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} /></clipPath></defs>
          {ticks(xMin, xMax).map(v => <g key={"x" + v}><line className="fnstudy-gridline" x1={px(v)} x2={px(v)} y1={PAD} y2={H - PAD} /><text className="fnstudy-tick" x={px(v) - 6} y={H - PAD + 14}>{showNumber(v)}</text></g>)}
          {ticks(yMin, yMax).map(v => <g key={"y" + v}><line className="fnstudy-gridline" x1={PAD} x2={W - PAD} y1={py(v)} y2={py(v)} /><text className="fnstudy-tick" x={2} y={py(v) + 4}>{showNumber(v)}</text></g>)}
          {inY(0) && <line className="fnstudy-axis" x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} />}
          {inX(0) && <line className="fnstudy-axis" x1={px(0)} x2={px(0)} y1={PAD} y2={H - PAD} />}
          <g clipPath={"url(#" + clip + ")"}>
            {sample.segments.filter(s => s.length > 1).map((s, i) => <polyline key={i} className="fnstudy-curve" data-testid="fnstudy-curve" points={s.map(p => px(p.x).toFixed(2) + "," + cy(p.y).toFixed(2)).join(" ")} />)}
            {st.verticalAsymptotes.filter(inX).map(v => <line key={"va" + v} className="fnstudy-vline" data-testid="fnstudy-vline" x1={px(v)} x2={px(v)} y1={PAD} y2={H - PAD} />)}
            {st.horizontalAsymptotes.filter(inY).map(v => <line key={"ha" + v} className="fnstudy-hline" data-testid="fnstudy-hline" x1={PAD} x2={W - PAD} y1={py(v)} y2={py(v)} />)}
            {st.domainExclusions.filter(inX).map(v => <circle key={"ex" + v} className="fnstudy-exclusion" data-testid="fnstudy-exclusion" cx={px(v)} cy={inY(0) ? py(0) : H - PAD} r="5" />)}
            {st.xIntercepts.map(p => <circle key={"xi" + p.x} className="fnstudy-marker" data-testid="fnstudy-marker" cx={px(p.x)} cy={cy(p.y)} r="5" />)}
            {st.yIntercept && <circle className="fnstudy-marker" data-testid="fnstudy-marker" cx={px(0)} cy={cy(st.yIntercept.y)} r="5" />}
            {st.extrema.map(p => <circle key={"e" + p.x} className="fnstudy-marker is-extremum" data-testid="fnstudy-marker" cx={px(p.x)} cy={cy(p.y)} r="6" />)}
          </g>
        </svg>
      </div>
      <div className="fnstudy-tasks">
        {t.domainExclusions && <NumberListTask task="domainExclusions" field="values" type="domain.setExclusions" saved={st.domainExclusions} disabled={disabled} label="استثناءات المجال: قيم x غير المعرّفة (مفصولة بفواصل)" submit={submit} />}
        {t.xIntercepts && <RowsTask task="xIntercepts" addLabel="+ نقطة" rowLabel="النقطة" disabled={disabled} submit={submit} savedText={st.xIntercepts.length ? st.xIntercepts.map(showPoint).join("، ") : "—"}
          rows={st.xIntercepts.map(p => ({ x: showNumber(p.x), y: showNumber(p.y) }))}
          fields={[{ key: "x", label: n => "x للنقطة " + n }, { key: "y", label: n => "y للنقطة " + n }]}
          toAction={rows => { const points = []; for (const r of rows) { const x = numberOrError(r.x, "x"), y = numberOrError(r.y, "y"); if (typeof x === "string") return x; if (typeof y === "string") return y; points.push({ x, y }); } return { type: "intercepts.setX", points }; }} />}
        {t.yIntercept && <YInterceptTask saved={st.yIntercept ? st.yIntercept.y : null} disabled={disabled} submit={submit} />}
        {t.verticalAsymptotes && <NumberListTask task="verticalAsymptotes" field="values" type="asymptotes.setVertical" saved={st.verticalAsymptotes} disabled={disabled} label="خطوط التقارب الرأسية: قيم x (مفصولة بفواصل)" submit={submit} />}
        {t.horizontalAsymptotes && <NumberListTask task="horizontalAsymptotes" field="values" type="asymptotes.setHorizontal" saved={st.horizontalAsymptotes} disabled={disabled} label="خطوط التقارب الأفقية: قيم y (مفصولة بفواصل)" submit={submit} />}
        {t.extrema && <RowsTask task="extrema" addLabel="+ قيمة قصوى" rowLabel="القيمة" disabled={disabled} submit={submit} savedText={st.extrema.length ? st.extrema.map(p => EXTREMUM_LABEL[p.kind] + " " + showPoint(p)).join("، ") : "—"}
          rows={st.extrema.map(p => ({ kind: p.kind, x: showNumber(p.x), y: showNumber(p.y) }))}
          fields={[{ key: "kind", label: n => "نوع القيمة " + n, options: [{ value: "min", label: EXTREMUM_LABEL.min }, { value: "max", label: EXTREMUM_LABEL.max }] }, { key: "x", label: n => "x للقيمة " + n }, { key: "y", label: n => "y للقيمة " + n }]}
          toAction={rows => { const points = []; for (const r of rows) { const x = numberOrError(r.x, "x"), y = numberOrError(r.y, "y"); if (typeof x === "string") return x; if (typeof y === "string") return y; points.push({ kind: r.kind, x, y }); } return { type: "extrema.set", points }; }} />}
        {t.monotonicIntervals && <RowsTask task="monotonicIntervals" addLabel="+ فترة" rowLabel="الفترة" disabled={disabled} submit={submit}
          savedText={st.monotonicIntervals.length ? st.monotonicIntervals.map(i => INTERVAL_LABEL[i.kind] + " (" + showEndpoint(i.from) + ", " + showEndpoint(i.to) + ")").join("، ") : "—"}
          rows={st.monotonicIntervals.map(i => ({ kind: i.kind, from: i.from === "-inf" ? "-inf" : showNumber(i.from), to: i.to === "+inf" ? "+inf" : showNumber(i.to) }))}
          fields={[{ key: "kind", label: n => "نوع الفترة " + n, options: [{ value: "increasing", label: INTERVAL_LABEL.increasing }, { value: "decreasing", label: INTERVAL_LABEL.decreasing }] }, { key: "from", label: n => "بداية الفترة " + n }, { key: "to", label: n => "نهاية الفترة " + n }]}
          toAction={rows => {
            const intervals = [];
            for (const r of rows) {
              const from = endpointToken(r.from) === "-inf" ? "-inf" : numberOrError(r.from, "بداية الفترة (عدد أو ‎-inf‎)");
              const to = endpointToken(r.to) === "+inf" ? "+inf" : numberOrError(r.to, "نهاية الفترة (عدد أو ‎+inf‎)");
              if (typeof from === "string" && from !== "-inf") return from;
              if (typeof to === "string" && to !== "+inf") return to;
              intervals.push({ kind: r.kind, from, to });
            }
            return { type: "intervals.set", intervals };
          }} />}
      </div>
    </div>
  );
}
function YInterceptTask({ saved, disabled, submit }: { saved: number | null; disabled?: boolean; submit: (a: Record<string, unknown>) => string }) {
  const [draft, setDraft] = useState(saved === null ? "" : showNumber(saved));
  const [error, setError] = useState("");
  const save = () => {
    if (!draft.trim()) { setError(submit({ type: "intercept.setY", y: null })); return; }
    const v = parseNumberInput(draft);
    setError(v === undefined ? "أدخل رقمًا صالحًا (أو اترك الحقل فارغًا للمسح)." : submit({ type: "intercept.setY", y: v }));
  };
  return (
    <Task task="yIntercept">
      <label><span>المقطع الصادي: قيمة y حين تكون x صفرًا</span><input type="text" dir="ltr" inputMode="decimal" autoComplete="off" value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} /></label>
      {!disabled && <div className="fnstudy-row"><button type="button" onClick={save}>حفظ</button></div>}
      <Problem error={error} />
      <Saved text={saved === null ? "—" : showPoint({ x: 0, y: saved })} />
    </Task>
  );
}
