// Phase 21A.1 — the LAZY interactive data chart. Input is an already validated canonical ChartSpecV1. ExamBank renders everything a reader
// needs as React TEXT: the figure title and description, a structural summary, the legend, the tooltip, the keyboard selection list (answer
// surfaces) and the full data table generated from the spec. The rendering engine draws only the picture: it is loaded with a dynamic import()
// when a chart is on screen (the advanced kinds add a second chunk), receives an option built by the ExamBank adapter, and reports pointer
// events that the adapter turns back into semantic keys at once. The picture is hidden from assistive technology; the table and the selection
// list are its accessible equivalent. Disposal: one engine instance per mounted chart, disposed on unmount / engine change; a load that
// resolves after unmount never mounts.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChartSpecV1 } from "./chartSpec";
import { chartDataTable, chartSummary, chartTargets, nextChartSelection, type ChartSelectionMode, type ChartTargetKind } from "./chartData";
import { buildEngineOption, chartHeight, chartLegend, formatValue, needsAdvancedEngine, targetFromEvent, tooltipFromEvent, widthLayout } from "./echartsAdapter";
import { defaultChartTokens, effectiveAnimation, readChartTokens } from "./chartTheme";
import type { EngineEvent, EngineHandle } from "./echartsEngine";
import type { EngineOption } from "./echartsAdapter";
import { usePrefersReducedMotion } from "../ui/usePrefersReducedMotion";
import { useMediaQuery } from "../ui/useMediaQuery";
import "./charts.css";

/** Review state of one selectable target (teacher review / student result view). */
export type ChartTargetMark = "correct" | "incorrect" | "missed";
export type ChartSelectionSurface = {
  kind: ChartTargetKind;
  mode: ChartSelectionMode;
  /** At most this many targets (multiple / range). */
  max: number;
  value: readonly string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  /** Visible label of the selection list (the question's instruction is the stem; this names the list). */
  label?: string;
  marks?: Readonly<Record<string, ChartTargetMark>>;
};
export type DataChartProps = {
  spec: ChartSpecV1;
  /** Teacher preview / practice: the `subtle` policy may play as `normal`. */
  preview?: boolean;
  selection?: ChartSelectionSurface;
};

/** Width below which the chart uses its compact layout (phones). */
export const COMPACT_WIDTH = 480;
/** The width the engine draws at while the page is printed (≈ 170 mm: inside A4 and Letter margins); the print stylesheet scales the SVG
 *  down further when the printed column is narrower. */
export const PRINT_WIDTH = 640;
const MARK_TEXT: Record<ChartTargetMark, string> = { correct: "صحيح", incorrect: "غير صحيح", missed: "لم يُحدَّد" };
const MARK_GLYPH: Record<ChartTargetMark, string> = { correct: "✓", incorrect: "✗", missed: "○" };
const MODE_TEXT = (mode: ChartSelectionMode, max: number) => (mode === "single" ? "اختر عنصرًا واحدًا." : mode === "range" ? "اختر نطاقًا متصلًا: العنصر الأول ثم الأخير." : "يمكنك اختيار حتى " + max + " عناصر.");
/** A text measurer for label truncation with real widths (a 2D canvas; created once). Undefined where there is no canvas — the engine then
 *  truncates by its own estimate. */
let measurer: ((text: string, font: string) => number) | null | undefined;
const textMeasure = (): ((text: string, font: string) => number) | undefined => {
  if (measurer === undefined) {
    try {
      const c = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      measurer = c ? (t: string, f: string) => { c.font = f; return c.measureText(t).width; } : null;
    } catch { measurer = null; }
  }
  return measurer ?? undefined;
};
const loadEngine = (advanced: boolean) => (advanced ? Promise.all([import("./echartsEngine"), import("./echartsAdvanced")]).then(([engine, adv]) => ({ engine, advanced: adv.CHART_ADVANCED_MARKER })) : import("./echartsEngine").then(engine => ({ engine, advanced: "" })));
type Tip = { x: number; y: number; title: string; lines: string[] };

export default function DataChart({ spec, preview, selection }: DataChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = { title: "xp-chart-" + uid + "-t", desc: "xp-chart-" + uid + "-d", summary: "xp-chart-" + uid + "-s", table: "xp-chart-" + uid + "-tb", list: "xp-chart-" + uid + "-l" };
  const figureRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<EngineHandle | null>(null);
  const [width, setWidth] = useState(0);
  const [tokens, setTokens] = useState(defaultChartTokens);
  const [attempt, setAttempt] = useState(0);
  // `unloadable`: the engine module itself could not be imported — browsers keep a failed module import for the life of the page, so only
  // a reload can show the chart (a throwing mount, by contrast, can be retried once)
  const [loaded, setLoaded] = useState<{ key: string; ok: boolean; unloadable?: boolean } | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  // `n` re-mounts the announcement on every activation, so an identical repeat is announced again (a live region only speaks changes)
  const [announce, setAnnounce] = useState({ text: "", n: 0 });
  const reducedMotion = usePrefersReducedMotion();
  const print = useMediaQuery("print");

  const compact = width > 0 && width < COMPACT_WIDTH;
  const height = chartHeight(spec, compact);
  const animation = effectiveAnimation(spec.animation, { reducedMotion, print, preview });
  const advanced = needsAdvancedEngine(spec);
  // the engine state is DERIVED from the last load outcome of the current engine set / attempt (no state reset inside an effect)
  const engineKey = (advanced ? "advanced:" : "common:") + attempt;
  const state: "loading" | "ready" | "error" = loaded?.key === engineKey ? (loaded.ok ? "ready" : "error") : "loading";
  const selKind = selection?.kind;
  const targets = useMemo(() => (selKind ? chartTargets(spec, selKind) : []), [spec, selKind]);
  const order = useMemo(() => targets.map(t => t.key), [targets]);
  const selectedKey = selection ? selection.value.join("\u0000") : "";
  // only charts with a horizontal category axis lay out by width (label rotation / caps), and in 32 px steps: a resize re-renders the
  // engine option only when the layout can change, not on every pixel
  const layoutWidth = width > 0 && !(spec.kind === "pie" || spec.kind === "scatter" || spec.kind === "radar" || (spec.kind === "bar" && spec.orientation === "horizontal")) ? Math.floor(width / 32) * 32 : 0;
  const option = useMemo(() => buildEngineOption(spec, {
    tokens, animation, compact, width: layoutWidth, measure: textMeasure(),
    ...(selKind ? { selectionKind: selKind, selected: new Set(selectedKey ? selectedKey.split("\u0000") : []) } : {})
  }), [spec, tokens, animation, compact, layoutWidth, selKind, selectedKey]);
  const optionRef = useRef(option);
  // the option for paper: the print width's layout, no animation (built when printing starts)
  const printOptionRef = useRef<() => EngineOption>(() => option);

  // the latest semantic handler, read by the engine's listener (the engine instance is not re-created when the selection changes)
  // the live announcement says what actually happened, from the difference between the selections before and after: the items selected,
  // the items deselected (a range that shrinks or moves), the limit when the activated item could not be added, or "unchanged" — never
  // "deselected" for an item that was never selected; nothing is emitted when nothing changed
  const activate = useCallback((key: string) => {
    if (!selection || selection.readOnly || !selection.onChange) return;
    const before = selection.value, next = nextChartSelection(selection.mode, order, before, key, selection.max);
    const name = (k: string) => targets.find(t => t.key === k)?.label ?? k;
    const added = next.filter(k => !before.includes(k)), removed = before.filter(k => !next.includes(k));
    const parts = [
      ...(added.length ? ["تم تحديد: " + added.map(name).join("، ")] : []),
      ...(removed.length ? ["أُلغي تحديد: " + removed.map(name).join("، ")] : []),
      ...(!next.includes(key) && !before.includes(key) ? ["بلغت الحد الأقصى (" + selection.max + ")؛ لم يُحدَّد: " + name(key)] : [])
    ];
    const text = (parts.length ? parts.join("؛ ") : "لا تغيير، محدَّد بالفعل: " + name(key)) + " — المحدَّد " + next.length;
    setAnnounce(a => ({ text, n: a.n + 1 }));
    if (added.length || removed.length) selection.onChange(next);
  }, [selection, order, targets]);
  const onEngineEvent = useRef<(e: EngineEvent) => void>(() => {});
  // the engine (mounted once) always reads the latest option and handler through these refs
  useLayoutEffect(() => {
    optionRef.current = option;
    printHeightRef.current = chartHeight(spec, false);
    printOptionRef.current = () => buildEngineOption(spec, {
      tokens, animation: "none", compact: false, width: PRINT_WIDTH, measure: textMeasure(),
      ...(selKind ? { selectionKind: selKind, selected: new Set(selectedKey ? selectedKey.split("\u0000") : []) } : {})
    });
    onEngineEvent.current = (e: EngineEvent) => {
      if (e.type === "out") { setTip(null); return; }
      const t = tooltipFromEvent(spec, e);
      setTip(t && typeof e.offsetX === "number" && typeof e.offsetY === "number" ? { x: e.offsetX, y: e.offsetY, ...t } : null);
      if (e.type === "click" && selKind) { const key = targetFromEvent(spec, selKind, e); if (key !== null) activate(key); }
    };
  });

  useLayoutEffect(() => {
    if (figureRef.current) setTokens(readChartTokens(figureRef.current));
    if (stageRef.current) setWidth(Math.round(stageRef.current.clientWidth));
  }, []);

  // width-only observation, throttled to one measurement per frame; the height depends on the width CLASS only, so it cannot loop
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0, last = Math.round(el.clientWidth);
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const w = Math.round(el.clientWidth);
        if (w === last) return;
        last = w;
        setWidth(w);
        if (!printingRef.current) handleRef.current?.resize();               // while printing the engine keeps the print width
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  // engine lifecycle: load lazily, mount once into the host, dispose on unmount or when the engine set changes
  useEffect(() => {
    let cancelled = false;
    const key = (advanced ? "advanced:" : "common:") + attempt;
    loadEngine(advanced).then(({ engine, advanced: marker }) => {
      if (cancelled || !hostRef.current) return;
      if (marker) hostRef.current.setAttribute("data-xp-engine-advanced", marker);
      handleRef.current = engine.mountChartEngine(hostRef.current, optionRef.current, e => onEngineEvent.current(e));
      setLoaded({ key, ok: true });
    }, () => { if (!cancelled) { setLoaded({ key, ok: false, unloadable: true }); setTableOpen(true); } })
      .catch(() => { if (!cancelled) { setLoaded({ key, ok: false }); setTableOpen(true); } });
    return () => { cancelled = true; handleRef.current?.dispose(); handleRef.current = null; setTip(null); };
  }, [advanced, attempt]);

  // a new option is applied (a full redraw) unless only the stage width moved and the labels are laid out the same: resizing a page of
  // charts then costs the engine's own relayout (resize), not a redraw per chart per step
  // print: nothing re-measures the stage and no animation frame runs before the print layout, so just before it the engine takes the
  // print-width layout (labels rotated / thinned for 640 px, no animation), draws at that width and the chart's own desktop height (the
  // print layout's fluid box is never measured) and PAINTS NOW (flush); afterwards it takes the screen option and its container's width and
  // height again. The print stylesheet scales the SVG to the printed column through its viewBox.
  // WHILE printing, anything that would re-apply the screen option (the print media query switching the animation off, a width or height
  // change of the print layout) re-applies the print option instead — the screen layout never reaches paper.
  const printingRef = useRef(false);
  const printHeightRef = useRef(chartHeight(spec, false));
  const paintPrint = (h: EngineHandle) => { h.update(printOptionRef.current()); h.resize(PRINT_WIDTH, printHeightRef.current); h.flush(); };
  const applied = useRef<{ inputs: readonly unknown[]; layout: string } | null>(null);
  useEffect(() => {
    const inputs = [spec, tokens, animation, compact, selKind, selectedKey], layout = widthLayout(option), prev = applied.current;
    applied.current = { inputs, layout };
    const h = handleRef.current;
    if (h && printingRef.current) { paintPrint(h); return; }
    if (prev && prev.layout === layout && prev.inputs.every((v, i) => Object.is(v, inputs[i]))) return;
    h?.update(option);
  }, [option, spec, tokens, animation, compact, selKind, selectedKey]);
  useEffect(() => { const h = handleRef.current; if (h && printingRef.current) paintPrint(h); else h?.resize(); }, [height]);
  useEffect(() => {
    const before = () => { printingRef.current = true; const h = handleRef.current; if (h) paintPrint(h); };
    const after = () => { printingRef.current = false; const h = handleRef.current; if (!h) return; h.update(optionRef.current); h.resize(); h.flush(); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  const table = useMemo(() => chartDataTable(spec), [spec]);
  const legend = useMemo(() => chartLegend(spec), [spec]);
  const tipStyle = tip ? {
    top: Math.max(4, tip.y + (tip.y > height / 2 ? -12 : 12)),
    ...(tip.x > (width || 0) / 2 ? { right: Math.max(4, (width || 0) - tip.x + 12) } : { left: Math.max(4, tip.x + 12) }),
    transform: tip.y > height / 2 ? "translateY(-100%)" : undefined
  } : undefined;
  const selected = new Set(selection?.value ?? []);

  return (
    <figure ref={figureRef} tabIndex={-1} className="xp-chart" data-xp-chart-kind={spec.kind} data-xp-chart-state={state} data-xp-compact={compact ? "true" : "false"} data-xp-animation={animation}
      aria-labelledby={ids.title} aria-describedby={ids.desc + " " + ids.summary}>
      <figcaption className="xp-chart-caption">
        <span className="xp-chart-title" id={ids.title} dir="auto">{spec.title}</span>
        <span className="xp-chart-desc" id={ids.desc} dir="auto">{spec.description}</span>
      </figcaption>
      <p className="xp-chart-summary" id={ids.summary}>{chartSummary(spec)}</p>
      {legend.length > 0 && (
        <ul className="xp-chart-legend" aria-label="مفتاح الرسم">
          {legend.map(l => <li key={l.key}><span className="xp-chart-swatch" data-xp-mark={l.mark} style={{ background: l.color, borderColor: l.color }} aria-hidden="true" /><bdi>{l.label}</bdi></li>)}
        </ul>
      )}
      <div ref={stageRef} className="xp-chart-stage" style={{ height }} aria-hidden="true" onMouseLeave={() => setTip(null)}>
        <div ref={hostRef} className="xp-chart-host" />
        {tip && (
          <div className="xp-chart-tip" style={tipStyle}>
            <span className="xp-chart-tip-title" dir="auto">{tip.title}</span>
            {tip.lines.map((l, i) => <span className="xp-chart-tip-line" dir="auto" key={i}>{l}</span>)}
          </div>
        )}
        {state === "loading" && <span className="xp-chart-status">جارٍ تحميل الرسم البياني…</span>}
      </div>
      {/* a module that could not be imported stays failed for the life of the page (browsers keep the failed import): no button that cannot
          work, the reload is named instead. A throwing mount gets one retry; a second failure says so honestly. Focus moves to the figure
          (the button disappears while the engine loads) */}
      {state === "error" && (
        <p className="xp-chart-error" role="status">
          {loaded?.unloadable ? "تعذّر تحميل الرسم البياني؛ البيانات كاملة في الجدول أدناه، ويُعرض الرسم بعد إعادة تحميل الصفحة."
            : attempt === 0 ? "تعذّر عرض الرسم البياني؛ البيانات كاملة في الجدول أدناه." : "تعذّر عرض الرسم البياني مرة أخرى؛ البيانات كاملة في الجدول أدناه، ويمكن إعادة تحميل الصفحة لاحقًا لعرضه."}
          {attempt === 0 && !loaded?.unloadable && <>{" "}<button type="button" className="xp-chart-retry" onClick={() => { figureRef.current?.focus(); setAttempt(1); }}>إعادة المحاولة</button></>}
        </p>
      )}
      {selection && (
        <div className="xp-chart-select" role="group" aria-labelledby={ids.list} data-xp-mode={selection.mode}>
          <p className="xp-chart-select-label" id={ids.list}>{selection.label ?? "اختر من الرسم البياني"}{!selection.readOnly && selection.onChange && <> <span className="xp-chart-select-hint">{MODE_TEXT(selection.mode, selection.max)}</span></>}</p>
          <ul className="xp-chart-options">
            {targets.map(t => {
              const on = selected.has(t.key), mark = selection.marks?.[t.key];
              return (
                <li key={t.key}>
                  <button type="button" className="xp-chart-option" aria-pressed={on} data-xp-key={t.key} data-xp-review={mark}
                    disabled={selection.readOnly || !selection.onChange} onClick={() => activate(t.key)}>
                    <bdi>{t.label}</bdi>
                    {mark && <span className="xp-chart-option-mark"> — <span aria-hidden="true">{MARK_GLYPH[mark]} </span>{MARK_TEXT[mark]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="xp-chart-sr" aria-live="polite"><span key={announce.n}>{announce.text}</span></p>
        </div>
      )}
      <div className="xp-chart-foot">
        <button type="button" className="xp-chart-table-toggle" aria-expanded={tableOpen} aria-controls={ids.table} onClick={() => setTableOpen(o => !o)}>{tableOpen ? "إخفاء جدول البيانات" : "عرض البيانات كجدول"}</button>
        {spec.source && <span className="xp-chart-source" dir="auto">المصدر: {spec.source}</span>}
      </div>
      <div id={ids.table} className="xp-chart-table-wrap" hidden={!tableOpen} role="region" aria-label={"بيانات: " + spec.title} tabIndex={tableOpen ? 0 : -1}>
        <table className="xp-chart-table">
          <caption className="xp-chart-sr">{spec.title}</caption>
          <thead><tr>{table.columns.map((c, i) => <th scope="col" key={i} dir="auto">{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => (
            <tr key={i}><th scope="row" dir="auto">{r.header}</th>{r.cells.map((c, j) => <td key={j} dir="auto">{c === null ? <span className="xp-chart-missing">—<span className="xp-chart-sr"> (لا قيمة)</span></span> : typeof c === "number" ? formatValue(c) : c}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </figure>
  );
}
