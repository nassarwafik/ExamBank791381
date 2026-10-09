import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { compileGraphCurves, curveValue, type CompiledCurve, type FunctionGraphSpecV1, type GraphViewportV1 } from "./functionGraphSpec";
import { buildGraphScene, panView, sceneToData, zoomView, type GraphScene } from "./graphScene";
import { curveFormula, formatGraphNumber, graphTargets, GRAPH_TARGET_KIND_LABELS, GRAPH_TARGET_KIND_PLURALS, type GraphTargetKind } from "./graphTargets";
import "./function-graph.css";

// Phase 21A.2 — the function-graph RUNTIME (lazy chunk; never in the initial graph). An owned, bounded SVG renderer over the pure scene
// (graphScene.ts): the picture is drawn from the validated FunctionGraphSpecV1 only (no HTML from data, no library options, no script).
// The SVG is a visual layer (aria-hidden); every meaning is ALSO plain HTML: title + description (the figure's name and description), a
// keyboard-traceable plot area with live readouts, a semantic selection list (the same target keys the picture accepts: pointer, touch and
// keyboard give the same answer), and a non-visual alternative (formulas, authored points / lines / tangents / regions / intervals and a
// table of values at the axis ticks). Zoom / pan / trace are view state only — never part of an answer — and the authored viewport is
// always one "reset" away; printing uses the authored viewport. No animation is used at all (reduced motion holds by construction).

export type GraphReviewMark = "correct" | "incorrect" | "missed";
export type GraphSelectionProps = {
  kind: GraphTargetKind; mode: "single" | "multiple"; max: number; value: readonly string[]; label: string; readOnly?: boolean;
  onChange?: (next: string[]) => void;
  /** teacher review: the mark of every target that has one (selected and / or expected) */
  review?: Readonly<Record<string, GraphReviewMark>>;
};
type Props = { spec: FunctionGraphSpecV1; selection?: GraphSelectionProps };

const DASH: Record<string, string | undefined> = { solid: undefined, dashed: "8 5", dotted: "2 4" };
const REVIEW_GLYPH: Record<GraphReviewMark, string> = { correct: "✓", incorrect: "✗", missed: "○" };
const REVIEW_TEXT: Record<GraphReviewMark, string> = { correct: "صحيح", incorrect: "خطأ", missed: "لم يُحدَّد" };
const sameView = (a: GraphViewportV1, b: GraphViewportV1) => a.xMin === b.xMin && a.xMax === b.xMax && a.yMin === b.yMin && a.yMax === b.yMax;
const heightFor = (w: number) => Math.round(Math.max(220, Math.min(520, w * (w < 420 ? 0.82 : 0.66))));
type Readout = { x: number; y: number; label: string; at: { x: number; y: number } } | null;

export default function FunctionGraphView({ spec, selection }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const compiled = useMemo(() => compileGraphCurves(spec), [spec]);
  const [view, setView] = useState<GraphViewportV1>(spec.viewport);
  // a new graph (another question, an edit) starts from its own authored viewport (derived during render, no effect)
  const [viewOf, setViewOf] = useState(spec);
  if (viewOf !== spec) { setViewOf(spec); setView(spec.viewport); }
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => { const w = Math.round(el.getBoundingClientRect().width); if (w >= 160) setWidth(prev => (Math.abs(prev - w) >= 2 ? w : prev)); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = heightFor(width);
  const scene = useMemo(() => buildGraphScene({ spec, view, width, height, compiled }), [spec, view, width, height, compiled]);
  const zoomed = !sameView(view, spec.viewport);
  const printScene = useMemo(() => (zoomed ? buildGraphScene({ spec, width: 640, height: heightFor(640), compiled }) : null), [zoomed, spec, compiled]);
  const ia = spec.interaction ?? {};
  const canZoom = ia.zoom !== false, canPan = ia.pan !== false, canTrace = ia.trace !== false, crosshair = ia.crosshair === true;

  const [announce, setAnnounce] = useState("");
  const [readout, setReadout] = useState<Readout>(null);
  const [trace, setTrace] = useState<{ curve: number; x: number } | null>(null);

  // ── selection (semantic keys only; canonical document order) ────────────────────────────────────────────────────────────────────
  const targets = useMemo(() => (selection ? graphTargets(spec, selection.kind) : []), [spec, selection]);
  const order = useMemo(() => new Map(targets.map((t, i) => [t.key, i] as [string, number])), [targets]);
  const chosen = useMemo(() => new Set(selection?.value ?? []), [selection]);
  const toggle = useCallback((key: string) => {
    if (!selection || selection.readOnly || !selection.onChange || !order.has(key)) return;
    const t = targets[order.get(key)!], name = t.label + " " + t.detail;
    const has = chosen.has(key);
    let next: string[];
    if (selection.mode === "single") next = has ? [] : [key];
    else if (has) next = [...chosen].filter(k => k !== key);
    else if (chosen.size >= selection.max) { setAnnounce("لا يمكن تحديد أكثر من " + selection.max + "؛ ألغِ تحديد عنصر أولًا."); return; }
    else next = [...chosen, key];
    next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    setAnnounce((has ? "أُلغي تحديد: " : "تم تحديد: ") + name);
    selection.onChange(next);
  }, [selection, targets, order, chosen]);

  // ── view controls ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const zoomBy = useCallback((f: number, cx?: number, cy?: number) => { if (canZoom) setView(v => zoomView(v, f, cx, cy)); }, [canZoom]);
  const reset = useCallback(() => { setView(spec.viewport); setTrace(null); setReadout(null); setAnnounce("أُعيد الرسم إلى نافذة العرض الأصلية."); }, [spec]);
  const traceable = useMemo(() => compiled.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== "parametric"), [compiled]);
  const curveName = (i: number) => spec.curves[i].label ?? GRAPH_TARGET_KIND_LABELS.curve + " " + (i + 1);
  const describeTrace = (ci: number, x: number) => {
    const y = curveValue(compiled[ci], x);
    return curveName(ci) + ": x = " + formatGraphNumber(x) + (Number.isFinite(y) ? "، y ≈ " + formatGraphNumber(y) : "، الدالة غير معرّفة هنا");
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const v = view, step = (v.xMax - v.xMin) / 100;
    const k = e.key;
    let handled = true;
    if ((k === "+" || k === "=") && canZoom) zoomBy(1.5);
    else if (k === "-" && canZoom) zoomBy(1 / 1.5);
    else if (k === "0") reset();
    else if (k === "Escape") { setTrace(null); setReadout(null); }
    else if (e.shiftKey && canPan && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
      setView(cur => panView(cur, k === "ArrowLeft" ? -0.1 : k === "ArrowRight" ? 0.1 : 0, k === "ArrowDown" ? -0.1 : k === "ArrowUp" ? 0.1 : 0));
    } else if (canTrace && traceable.length && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
      const cur = trace ?? { curve: traceable[0].i, x: (v.xMin + v.xMax) / 2 };
      let next = cur;
      if (k === "ArrowLeft" || k === "ArrowRight") next = { ...cur, x: Math.max(v.xMin, Math.min(v.xMax, cur.x + (k === "ArrowRight" ? step : -step))) };
      else {
        const pos = traceable.findIndex(t => t.i === cur.curve), n = traceable.length;
        next = { ...cur, curve: traceable[((pos + (k === "ArrowDown" ? 1 : -1)) % n + n) % n].i };
      }
      setTrace(next);
      setAnnounce(describeTrace(next.curve, next.x));
    } else handled = false;
    if (handled) e.preventDefault();
  };

  // ── pointer: drag to pan, pinch to zoom, hover readout; targets are clicked ────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; start?: { view: GraphViewportV1; x: number; y: number; d?: number } ; moved: boolean }>({ pointers: new Map(), moved: false });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * scene.width, y: ((e.clientY - r.top) / r.height) * scene.height };
  };
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest?.("[data-fg-target]")) return;
    const p = local(e), st = drag.current;
    st.pointers.set(e.pointerId, p);
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* capture is optional */ }
    const pts = [...st.pointers.values()];
    st.moved = false;
    st.start = { view, x: p.x, y: p.y, ...(pts.length === 2 ? { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) } : {}) };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(e), st = drag.current;
    if (st.pointers.has(e.pointerId) && st.start) {
      st.pointers.set(e.pointerId, p);
      const pts = [...st.pointers.values()];
      if (pts.length === 2 && st.start.d && canZoom) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), c = sceneToData(scene, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        setView(zoomView(st.start.view, d / st.start.d, c.x, c.y));
        st.moved = true;
      } else if (pts.length === 1 && canPan) {
        const dx = p.x - st.start.x, dy = p.y - st.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) st.moved = true;
        if (st.moved) {
          const w = scene.plot.right - scene.plot.left, h = scene.plot.bottom - scene.plot.top;
          setView(panView(st.start.view, -dx / w, dy / h));
        }
      }
      return;
    }
    if (e.pointerType !== "mouse" || !traceable.length) return;
    const dpt = sceneToData(scene, p.x, p.y);
    let best: Readout = null, bestD = Infinity;
    for (const { c, i } of traceable) {
      const y = curveValue(c as CompiledCurve, dpt.x);
      if (!Number.isFinite(y)) continue;
      const py = scene.plot.bottom - ((y - scene.view.yMin) / (scene.view.yMax - scene.view.yMin)) * (scene.plot.bottom - scene.plot.top);
      const dist = Math.abs(py - p.y);
      if (dist < bestD) { bestD = dist; best = { x: dpt.x, y, label: curveName(i), at: { x: p.x, y: py } }; }
    }
    setReadout(best && bestD < 60 ? best : null);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => { const st = drag.current; st.pointers.delete(e.pointerId); if (!st.pointers.size) st.start = undefined; };
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !canZoom) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;                                       // a plain wheel scrolls the page
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const c = sceneToData(scene, ((e.clientX - r.left) / r.width) * scene.width, ((e.clientY - r.top) / r.height) * scene.height);
      setView(v => zoomView(v, e.deltaY < 0 ? 1.25 : 0.8, c.x, c.y));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [canZoom, scene]);

  const tracePoint = trace ? (() => { const y = curveValue(compiled[trace.curve], trace.x); return Number.isFinite(y) ? { x: trace.x, y } : null; })() : null;
  const marks = selection?.review;
  const selectable = (kind: GraphTargetKind) => !!selection && selection.kind === kind;
  return (
    <figure className="fg" data-fg-graph={spec.id} aria-labelledby={uid + "-t"} aria-describedby={uid + "-d"}>
      <figcaption className="fg-caption">
        <span id={uid + "-t"} className="fg-title" dir="auto">{spec.title}</span>
        <span id={uid + "-d"} className="fg-desc" dir="auto">{spec.description}</span>
      </figcaption>
      {(canZoom || canPan) && (
        <div className="fg-toolbar" role="toolbar" aria-label={"أدوات الرسم: " + spec.title}>
          {canZoom && <button type="button" className="fg-tool" onClick={() => zoomBy(1.5)} aria-label="تكبير">＋</button>}
          {canZoom && <button type="button" className="fg-tool" onClick={() => zoomBy(1 / 1.5)} aria-label="تصغير">−</button>}
          <button type="button" className="fg-tool" onClick={reset} disabled={!zoomed && !trace} aria-label="إعادة الضبط إلى نافذة العرض الأصلية">إعادة الضبط</button>
        </div>
      )}
      <div ref={stageRef} className="fg-stage" tabIndex={0} role="group" aria-roledescription="رسم دالة تفاعلي" aria-label={"منطقة الرسم: " + spec.title} aria-describedby={uid + "-k"} onKeyDown={onKeyDown} data-fg-zoomed={zoomed ? "true" : undefined}>
        <GraphSvg scene={scene} spec={spec} uid={uid} svgRef={svgRef} selection={selection} chosen={chosen} marks={marks} selectable={selectable} onTarget={toggle}
          tracePoint={tracePoint} readout={readout} crosshair={crosshair}
          handlers={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave: () => setReadout(null) }} />
        {(readout || tracePoint) && (
          <div className="fg-readout" aria-hidden="true">
            {readout ? <>{readout.label}: <bdi dir="ltr">({formatGraphNumber(readout.x)}, {formatGraphNumber(readout.y)})</bdi></> : trace && describeTrace(trace.curve, trace.x)}
          </div>
        )}
      </div>
      <p id={uid + "-k"} className="fg-sr-only">
        {(canTrace && traceable.length ? "الأسهم يمين ويسار تتبّع المنحنى، والأسهم أعلى وأسفل تنتقل بين المنحنيات. " : "") + (canPan ? "Shift مع الأسهم يحرّك الرسم. " : "") + (canZoom ? "+ و − للتكبير والتصغير. " : "") + "0 يعيد نافذة العرض الأصلية."}
      </p>
      {selection && <SelectionList selection={selection} targets={targets} chosen={chosen} onToggle={toggle} />}
      <GraphAlternative spec={spec} compiled={compiled} scene={scene} />
      {spec.source && <p className="fg-source" dir="auto">المصدر: {spec.source}</p>}
      <div className="fg-sr-only" aria-live="polite" role="status">{announce}</div>
      {printScene && (
        <div className="fg-print" aria-hidden="true">
          <GraphSvg scene={printScene} spec={spec} uid={uid + "p"} selection={selection} chosen={chosen} marks={marks} selectable={selectable} tracePoint={null} readout={null} crosshair={false} />
        </div>
      )}
    </figure>
  );
}

function SelectionList({ selection, targets, chosen, onToggle }: { selection: GraphSelectionProps; targets: ReturnType<typeof graphTargets>; chosen: ReadonlySet<string>; onToggle: (k: string) => void }) {
  const bound = selection.mode === "single" ? "اختر عنصرًا واحدًا" : "يمكنك اختيار حتى " + selection.max;
  return (
    <div className="fg-select" role="group" aria-label={selection.label}>
      <p className="fg-select-label" dir="auto">{selection.label} <span className="fg-select-hint">({bound} من {GRAPH_TARGET_KIND_PLURALS[selection.kind]})</span></p>
      <ul className="fg-options">
        {targets.map(t => {
          const mark = selection.review?.[t.key];
          return (
            <li key={t.key}>
              <button type="button" className="fg-option" aria-pressed={chosen.has(t.key)} data-fg-option={t.key} data-fg-review={mark}
                disabled={selection.readOnly || !selection.onChange} onClick={() => onToggle(t.key)}>
                {mark && <span className="fg-option-mark" aria-hidden="true">{REVIEW_GLYPH[mark]} </span>}
                <span dir="auto">{t.label}</span> <bdi dir="auto" className="fg-option-detail">{t.detail}</bdi>
                {mark && <span className="fg-sr-only"> — {REVIEW_TEXT[mark]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The non-visual alternative: the authored mathematics as text plus a table of values at the x-axis ticks (what a sighted reader reads off
 *  the grid). Authored values only — never a numerically "detected" root or extremum (which could also give an answer away). */
function GraphAlternative({ spec, compiled, scene }: { spec: FunctionGraphSpecV1; compiled: CompiledCurve[]; scene: GraphScene }) {
  const traceable = compiled.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== "parametric");
  const xs = sameView(spec.viewport, scene.view) ? scene.xTicks.map(t => t.value) : [];
  const ticks = (xs.length ? xs : Array.from({ length: 9 }, (_, k) => spec.viewport.xMin + ((spec.viewport.xMax - spec.viewport.xMin) * k) / 8)).slice(0, 41);
  const item = (key: string, body: ReactNode) => <li key={key}>{body}</li>;
  return (
    <details className="fg-alt">
      <summary>الوصف النصي وجدول القيم</summary>
      <ul className="fg-alt-list">
        {spec.curves.map((c, i) => item("c" + c.id, <><span dir="auto">{c.label ?? GRAPH_TARGET_KIND_LABELS.curve + " " + (i + 1)}</span>: <bdi dir="ltr">{curveFormula(c)}</bdi></>))}
        {(spec.points ?? []).map((p, i) => item("p" + p.id, <><span dir="auto">{p.label ?? GRAPH_TARGET_KIND_LABELS.point + " " + (i + 1)}</span>{p.open ? " (نقطة مفرغة)" : ""}: <bdi dir="ltr">({formatGraphNumber(p.x)}, {formatGraphNumber(p.y)})</bdi></>))}
        {(spec.lines ?? []).map((l, i) => item("l" + l.id, <><span dir="auto">{l.label ?? GRAPH_TARGET_KIND_LABELS.line + " " + (i + 1)}</span>: <bdi dir="ltr">{(l.orientation === "vertical" ? "x = " : "y = ") + formatGraphNumber(l.value)}</bdi></>))}
        {(spec.tangents ?? []).map((t, i) => item("t" + t.id, <><span dir="auto">{t.label ?? GRAPH_TARGET_KIND_LABELS.tangent + " " + (i + 1)}</span>: {t.kind === "tangent" ? "مماس" : "عمودي على المماس"} عند <bdi dir="ltr">x = {formatGraphNumber(t.x)}</bdi>{t.slope !== undefined ? <> بميل <bdi dir="ltr">{formatGraphNumber(t.slope)}</bdi></> : null}</>))}
        {(spec.regions ?? []).map((r, i) => item("r" + r.id, <><span dir="auto">{r.label ?? GRAPH_TARGET_KIND_LABELS.region + " " + (i + 1)}</span>: منطقة مظللة من <bdi dir="ltr">x = {formatGraphNumber(r.from)}</bdi> إلى <bdi dir="ltr">x = {formatGraphNumber(r.to)}</bdi></>))}
        {(spec.intervals ?? []).map((v, i) => item("i" + v.id, <><span dir="auto">{v.label ?? GRAPH_TARGET_KIND_LABELS.interval + " " + (i + 1)}</span>: <bdi dir="ltr">{(v.fromClosed ?? true ? "[" : "(") + formatGraphNumber(v.from) + ", " + formatGraphNumber(v.to) + (v.toClosed ?? true ? "]" : ")")}</bdi></>))}
      </ul>
      {traceable.length > 0 && (
        <div className="fg-table-wrap">
          <table className="fg-table">
            <caption>قيم الدوال عند علامات محور x</caption>
            <thead><tr><th scope="col">x</th>{traceable.map(({ i }) => <th scope="col" key={i} dir="auto">{spec.curves[i].label ?? "y" + (i + 1)}</th>)}</tr></thead>
            <tbody>{ticks.map(x => (
              <tr key={x}><th scope="row" dir="ltr">{formatGraphNumber(x)}</th>{traceable.map(({ c, i }) => { const y = curveValue(c, x); return <td key={i} dir="ltr">{Number.isFinite(y) ? formatGraphNumber(y) : "غير معرّفة"}</td>; })}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </details>
  );
}

type SvgProps = {
  scene: GraphScene; spec: FunctionGraphSpecV1; uid: string; svgRef?: Ref<SVGSVGElement>; selection?: GraphSelectionProps; chosen: ReadonlySet<string>;
  marks?: Readonly<Record<string, GraphReviewMark>>; selectable: (k: GraphTargetKind) => boolean; onTarget?: (key: string) => void;
  tracePoint: { x: number; y: number } | null; readout: Readout; crosshair: boolean;
  handlers?: { onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerLeave: () => void };
};
function GraphSvg({ scene: s, spec, uid, svgRef, chosen, marks, selectable, onTarget, tracePoint, readout, crosshair, handlers }: SvgProps) {
  const { plot } = s;
  const clip = "url(#" + uid + "-clip)";
  const toPx = (x: number, y: number) => ({ x: plot.left + ((x - s.view.xMin) / (s.view.xMax - s.view.xMin)) * (plot.right - plot.left), y: plot.bottom - ((y - s.view.yMin) / (s.view.yMax - s.view.yMin)) * (plot.bottom - plot.top) });
  const target = (key: string, kind: GraphTargetKind) => (selectable(kind) && onTarget ? { "data-fg-target": key, onClick: () => onTarget(key), className: "fg-hit" } : null);
  const sel = (key: string) => chosen.has(key);
  const mark = (key: string, x: number, y: number) => (marks?.[key] ? <text className="fg-review-glyph" data-fg-review={marks[key]} x={x + 10} y={y + 4}>{REVIEW_GLYPH[marks[key]]}</text> : null);
  const fontSize = s.width < 420 ? 11 : 12;
  return (
    <svg ref={svgRef} className="fg-svg" viewBox={"0 0 " + s.width + " " + s.height} width="100%" height={s.height} aria-hidden="true" focusable="false" direction="ltr" fontSize={fontSize} {...handlers}>
      <defs>
        <clipPath id={uid + "-clip"}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath>
        <pattern id={uid + "-hatch"} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" className="fg-hatch" /></pattern>
      </defs>
      <rect className="fg-plot-bg" x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
      {s.gridX && s.xTicks.map(t => <line key={"gx" + t.value} className="fg-grid" x1={t.px} x2={t.px} y1={plot.top} y2={plot.bottom} />)}
      {s.gridY && s.yTicks.map(t => <line key={"gy" + t.value} className="fg-grid" y1={t.px} y2={t.px} x1={plot.left} x2={plot.right} />)}
      {s.xAxisY !== null && <line className="fg-axis" x1={plot.left} x2={plot.right} y1={s.xAxisY} y2={s.xAxisY} />}
      {s.yAxisX !== null && <line className="fg-axis" y1={plot.top} y2={plot.bottom} x1={s.yAxisX} x2={s.yAxisX} />}
      {s.xTicks.map(t => <text key={"tx" + t.value} className="fg-tick" x={t.px} y={plot.bottom + fontSize + 4} textAnchor="middle">{t.label}</text>)}
      {s.yTicks.map(t => <text key={"ty" + t.value} className="fg-tick" x={plot.left - 5} y={t.px + 4} textAnchor="end">{t.label}</text>)}
      {spec.axes?.x?.label && <text className="fg-axis-label" x={plot.right - 2} y={(s.xAxisY ?? plot.bottom) - 6} textAnchor="end" style={{ unicodeBidi: "plaintext" }}>{spec.axes.x.label}</text>}
      {spec.axes?.y?.label && <text className="fg-axis-label" x={(s.yAxisX ?? plot.left) + 6} y={plot.top + fontSize} textAnchor="start" style={{ unicodeBidi: "plaintext" }}>{spec.axes.y.label}</text>}
      <g clipPath={clip}>
        {s.regions.map(r => (
          <g key={r.key} data-fg-region={r.id} data-fg-selected={sel(r.key) || undefined}>
            <path className="fg-region" d={r.d} fill={"url(#" + uid + "-hatch)"} />
            <path className="fg-region-tint" d={r.d} />
            {selectable("region") && onTarget && <path {...target(r.key, "region")} d={r.d} fill="transparent" />}
          </g>
        ))}
        {s.lines.map(l => (
          <g key={l.key} data-fg-line={l.id} data-fg-selected={sel(l.key) || undefined}>
            {sel(l.key) && <line className="fg-halo" {...(l.vertical ? { x1: l.px, x2: l.px, y1: plot.top, y2: plot.bottom } : { y1: l.px, y2: l.px, x1: plot.left, x2: plot.right })} />}
            <line className={"fg-line fg-c" + l.color} strokeDasharray={DASH[l.line]} {...(l.vertical ? { x1: l.px, x2: l.px, y1: plot.top, y2: plot.bottom } : { y1: l.px, y2: l.px, x1: plot.left, x2: plot.right })} />
            {selectable("line") && onTarget && <line {...target(l.key, "line")} stroke="transparent" strokeWidth={18} {...(l.vertical ? { x1: l.px, x2: l.px, y1: plot.top, y2: plot.bottom } : { y1: l.px, y2: l.px, x1: plot.left, x2: plot.right })} />}
          </g>
        ))}
        {s.curves.map(c => (
          <g key={c.key} data-fg-selected={sel(c.key) || undefined}>
            {sel(c.key) && <path className="fg-halo" d={c.d} />}
            <path className={"fg-curve fg-c" + c.color} data-fg-curve={c.id} d={c.d} strokeDasharray={DASH[c.line]} />
            {selectable("curve") && onTarget && <path {...target(c.key, "curve")} d={c.d} fill="none" stroke="transparent" strokeWidth={18} />}
          </g>
        ))}
        {s.tangents.map(t => (
          <g key={t.key} data-fg-tangent={t.id} data-fg-selected={sel(t.key) || undefined}>
            {sel(t.key) && <line className="fg-halo" x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} />}
            <line className={"fg-tangent" + (t.kind === "normal" ? " fg-normal" : "")} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} />
            {selectable("tangent") && onTarget && <line {...target(t.key, "tangent")} x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} stroke="transparent" strokeWidth={18} />}
          </g>
        ))}
        {s.intervals.map(v => {
          const y = s.xAxisY ?? plot.bottom - 4;
          return (
            <g key={v.key} data-fg-interval={v.id} data-fg-selected={sel(v.key) || undefined}>
              {sel(v.key) && <line className="fg-halo" x1={v.x1} x2={v.x2} y1={y} y2={y} />}
              <line className="fg-interval" x1={v.x1} x2={v.x2} y1={y} y2={y} />
              <circle className={v.fromClosed ? "fg-end fg-end-closed" : "fg-end"} cx={v.x1} cy={y} r={4.5} />
              <circle className={v.toClosed ? "fg-end fg-end-closed" : "fg-end"} cx={v.x2} cy={y} r={4.5} />
              {selectable("interval") && onTarget && <line {...target(v.key, "interval")} x1={v.x1} x2={v.x2} y1={y} y2={y} stroke="transparent" strokeWidth={22} />}
            </g>
          );
        })}
        {s.endpoints.map((e, i) => <circle key={"e" + i} className={"fg-end" + (e.open ? "" : " fg-end-closed")} cx={e.at.x} cy={e.at.y} r={4} />)}
        {s.points.map(p => (
          <g key={p.key} data-fg-selected={sel(p.key) || undefined}>
            {sel(p.key) && <circle className="fg-ring" cx={p.at.x} cy={p.at.y} r={11} />}
            <circle className={"fg-point" + (p.open ? " fg-point-open" : "")} data-fg-point={p.id} cx={p.at.x} cy={p.at.y} r={sel(p.key) ? 6.5 : 5} />
            {selectable("point") && onTarget && <circle {...target(p.key, "point")} cx={p.at.x} cy={p.at.y} r={16} fill="transparent" />}
          </g>
        ))}
        {crosshair && readout && <g className="fg-crosshair"><line x1={readout.at.x} x2={readout.at.x} y1={plot.top} y2={plot.bottom} /><line y1={readout.at.y} y2={readout.at.y} x1={plot.left} x2={plot.right} /></g>}
        {readout && <circle className="fg-trace" cx={readout.at.x} cy={readout.at.y} r={4} />}
        {tracePoint && (() => { const q = toPx(tracePoint.x, tracePoint.y); return <g className="fg-crosshair"><line x1={q.x} x2={q.x} y1={plot.top} y2={plot.bottom} /><circle className="fg-trace" cx={q.x} cy={q.y} r={5} /></g>; })()}
      </g>
      {s.curves.map(c => c.label && c.labelAt ? <text key={"lc" + c.id} className={"fg-label fg-label-c" + c.color} x={Math.max(plot.left + 4, c.labelAt.x - 4)} y={Math.max(plot.top + fontSize, c.labelAt.y - 8)} textAnchor="end" style={{ unicodeBidi: "plaintext" }}>{c.label}</text> : null)}
      {s.points.map(p => <g key={"lp" + p.id}>{p.label && <text className="fg-label" x={p.at.x + 8} y={p.at.y - 8} style={{ unicodeBidi: "plaintext" }}>{p.label}</text>}{mark(p.key, p.at.x, p.at.y)}</g>)}
      {s.lines.map(l => <g key={"ll" + l.id}>{l.label && <text className="fg-label" x={l.vertical ? l.px + 5 : plot.right - 4} y={l.vertical ? plot.top + fontSize + 2 : l.px - 5} textAnchor={l.vertical ? "start" : "end"} style={{ unicodeBidi: "plaintext" }}>{l.label}</text>}{mark(l.key, l.vertical ? l.px : plot.right - 30, l.vertical ? plot.top + 30 : l.px)}</g>)}
      {s.tangents.map(t => <g key={"lt" + t.id}>{t.label && <text className="fg-label" x={t.at.x + 10} y={t.at.y + 16} style={{ unicodeBidi: "plaintext" }}>{t.label}</text>}{mark(t.key, t.at.x + 4, t.at.y + 30)}</g>)}
      {s.regions.map(r => <g key={"lr" + r.id}>{r.label && <text className="fg-label" x={r.labelAt.x} y={r.labelAt.y} textAnchor="middle" style={{ unicodeBidi: "plaintext" }}>{r.label}</text>}{mark(r.key, r.labelAt.x, r.labelAt.y + 14)}</g>)}
      {s.intervals.map(v => { const y = (s.xAxisY ?? plot.bottom - 4) - 10; return <g key={"li" + v.id}>{v.label && <text className="fg-label" x={(v.x1 + v.x2) / 2} y={y} textAnchor="middle" style={{ unicodeBidi: "plaintext" }}>{v.label}</text>}{mark(v.key, v.x2, y)}</g>; })}
      {s.curves.map(c => (marks?.[c.key] && c.labelAt ? <g key={"mc" + c.id}>{mark(c.key, c.labelAt.x, c.labelAt.y + 14)}</g> : null))}
      <rect className="fg-frame" x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
    </svg>
  );
}
