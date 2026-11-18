import { useId, useState } from "react";
import type { GraphPlotterToolV1 } from "./studentToolsSpec";
import { buildPlotSpec, readPlotWindow, plotValuesAt, formatPlotNumber, DEFAULT_WINDOW, PLOT_NAMES } from "./graphPlotter";
import type { FunctionGraphSpecV1 } from "../functionGraphs/functionGraphSpec";
import FunctionGraphView from "../functionGraphs/FunctionGraphView";

// Phase T4 — the student function plotter panel. The drawing, zoom / pan / trace and the analysis belong to the existing graph
// engine (FunctionGraphView, Phase 21A.2); this panel only collects up to the teacher's number of functions and the window. This
// module is its own lazy chunk (the dock loads it on first use), so a calculator-only exam never downloads the graph engine.

const str = (n: number) => String(n);

export default function GraphPlotterTool({ config }: { config: GraphPlotterToolV1 }) {
  const id = useId();
  const count = Math.max(1, Math.min(config.maxFunctions, PLOT_NAMES.length));
  const [exprs, setExprs] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [win, setWin] = useState({ xMin: str(DEFAULT_WINDOW.xMin), xMax: str(DEFAULT_WINDOW.xMax), yMin: str(DEFAULT_WINDOW.yMin), yMax: str(DEFAULT_WINDOW.yMax) });
  const [errors, setErrors] = useState<(string | null)[]>([]);
  const [message, setMessage] = useState("");
  const [spec, setSpec] = useState<FunctionGraphSpecV1 | null>(null);
  const [atX, setAtX] = useState("");
  const [values, setValues] = useState<{ name: string; y: number | null }[] | null>(null);

  const plot = () => {
    setValues(null);
    const w = readPlotWindow(win);
    if (!w.ok) { setMessage(w.message); setErrors([]); return; }
    const r = buildPlotSpec(exprs, w.value, count, config.showAnalysis);
    if (!r.ok) { setErrors(r.errors); setMessage(r.message ?? ""); return; }
    setErrors([]); setMessage(""); setSpec(r.spec);
  };
  const evaluateAt = () => {
    if (!spec) return;
    const t = atX.trim().replace(/[−–]/g, "-");
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) { setValues(null); setMessage("اكتب قيمة x رقمًا."); return; }
    setMessage("");
    setValues(plotValuesAt(spec, Number(t)));
  };
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };

  return (
    <div className="stt-plot" data-testid="tool-graphPlotter">
      {exprs.map((v, i) => (
        <div key={i} className="stt-plot-field">
          <label className="stt-label" htmlFor={id + "-f" + i}><bdi dir="ltr">{PLOT_NAMES[i] + "(x) ="}</bdi></label>
          <input id={id + "-f" + i} className="stt-input" dir="ltr" autoComplete="off" spellCheck={false} maxLength={120} value={v}
            aria-invalid={errors[i] ? true : undefined} aria-describedby={errors[i] ? id + "-e" + i : undefined}
            placeholder={i === 0 ? "x^2 - 4" : i === 1 ? "2x + 1" : "sin(x)"}
            onChange={e => setExprs(list => list.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={onEnter(plot)} />
          {errors[i] && <p className="stt-error" id={id + "-e" + i} role="alert">{errors[i]}</p>}
        </div>
      ))}
      <details className="stt-history">
        <summary>نافذة الرسم</summary>
        <div className="stt-window" dir="ltr">
          {(["xMin", "xMax", "yMin", "yMax"] as const).map(k => (
            <label key={k} className="stt-window-field"><span>{k}</span>
              <input className="stt-input is-short" inputMode="decimal" maxLength={12} value={win[k]} onChange={e => setWin(w => ({ ...w, [k]: e.target.value }))} onKeyDown={onEnter(plot)} />
            </label>
          ))}
        </div>
      </details>
      <div className="stt-row stt-plot-actions">
        <button type="button" className="stt-btn is-primary" onClick={plot}>ارسم</button>
      </div>
      <p className="stt-hint">مثال: <bdi dir="ltr">x^2 - 4</bdi>، <bdi dir="ltr">2x + 1</bdi>، <bdi dir="ltr">sin(x)</bdi>، <bdi dir="ltr">sqrt(x)</bdi>، <bdi dir="ltr">ln(x)</bdi>. الزوايا بالراديان.</p>
      {message && <p className="stt-error" role="alert">{message}</p>}
      {spec && (
        <div className="stt-plot-graph" data-testid="plot-graph">
          <FunctionGraphView spec={spec} />
          <div className="stt-row stt-plot-at">
            <label className="stt-label" htmlFor={id + "-at"}>القيمة عند <bdi dir="ltr">x =</bdi></label>
            <input id={id + "-at"} className="stt-input is-short" dir="ltr" inputMode="decimal" maxLength={12} value={atX} onChange={e => setAtX(e.target.value)} onKeyDown={onEnter(evaluateAt)} />
            <button type="button" className="stt-btn" onClick={evaluateAt}>احسب</button>
          </div>
          {values && (
            <dl className="stt-dl" aria-live="polite" data-testid="plot-values">
              {values.map(v => <div key={v.name}><dt><bdi dir="ltr">{v.name}</bdi></dt><dd>{v.y === null ? "غير معرّفة" : <bdi dir="ltr" className="stt-ltr">{formatPlotNumber(v.y)}</bdi>}</dd></div>)}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
