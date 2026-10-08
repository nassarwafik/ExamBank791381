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
import { buildEngineOption, chartHeight, chartLegend, formatValue, needsAdvancedEngine, targetFromEvent, tooltipFromEvent } from "./echartsAdapter";
import { defaultChartTokens, effectiveAnimation, readChartTokens } from "./chartTheme";
import type { EngineEvent, EngineHandle } from "./echartsEngine";
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
const MARK_TEXT: Record<ChartTargetMark, string> = { correct: "صحيح", incorrect: "غير صحيح", missed: "لم يُحدَّد" };
const MODE_TEXT = (mode: ChartSelectionMode, max: number) => (mode === "single" ? "اختر عنصرًا واحدًا." : mode === "range" ? "اختر نطاقًا متصلًا: العنصر الأول ثم الأخير." : "يمكنك اختيار حتى " + max + " عناصر.");
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
  const [loaded, setLoaded] = useState<{ key: string; ok: boolean } | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [announce, setAnnounce] = useState("");
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
  const option = useMemo(() => buildEngineOption(spec, {
    tokens, animation, compact,
    ...(selKind ? { selectionKind: selKind, selected: new Set(selectedKey ? selectedKey.split("\u0000") : []) } : {})
  }), [spec, tokens, animation, compact, selKind, selectedKey]);
  const optionRef = useRef(option);

  // the latest semantic handler, read by the engine's listener (the engine instance is not re-created when the selection changes)
  const activate = useCallback((key: string) => {
    if (!selection || selection.readOnly || !selection.onChange) return;
    const next = nextChartSelection(selection.mode, order, selection.value, key, selection.max);
    const label = targets.find(t => t.key === key)?.label ?? key;
    setAnnounce((next.includes(key) ? "تم تحديد: " : "أُلغي تحديد: ") + label + " — المحدَّد " + next.length);
    selection.onChange(next);
  }, [selection, order, targets]);
  const onEngineEvent = useRef<(e: EngineEvent) => void>(() => {});
  // the engine (mounted once) always reads the latest option and handler through these refs
  useLayoutEffect(() => {
    optionRef.current = option;
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
        handleRef.current?.resize();
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
    }).catch(() => { if (!cancelled) { setLoaded({ key, ok: false }); setTableOpen(true); } });
    return () => { cancelled = true; handleRef.current?.dispose(); handleRef.current = null; setTip(null); };
  }, [advanced, attempt]);

  useEffect(() => { handleRef.current?.update(option); }, [option]);
  useEffect(() => { handleRef.current?.resize(); }, [height]);

  const table = useMemo(() => chartDataTable(spec), [spec]);
  const legend = useMemo(() => chartLegend(spec), [spec]);
  const tipStyle = tip ? {
    top: Math.max(4, tip.y + (tip.y > height / 2 ? -12 : 12)),
    ...(tip.x > (width || 0) / 2 ? { right: Math.max(4, (width || 0) - tip.x + 12) } : { left: Math.max(4, tip.x + 12) }),
    transform: tip.y > height / 2 ? "translateY(-100%)" : undefined
  } : undefined;
  const selected = new Set(selection?.value ?? []);

  return (
    <figure ref={figureRef} className="xp-chart" data-xp-chart-kind={spec.kind} data-xp-chart-state={state} data-xp-compact={compact ? "true" : "false"} data-xp-animation={animation}
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
      {state === "error" && (
        <p className="xp-chart-error" role="status">
          تعذّر عرض الرسم البياني؛ البيانات كاملة في الجدول أدناه.{" "}
          <button type="button" className="xp-chart-retry" onClick={() => setAttempt(a => a + 1)}>إعادة المحاولة</button>
        </p>
      )}
      {selection && (
        <div className="xp-chart-select" role="group" aria-labelledby={ids.list} data-xp-mode={selection.mode}>
          <p className="xp-chart-select-label" id={ids.list}>{selection.label ?? "اختر من الرسم البياني"} <span className="xp-chart-select-hint">{MODE_TEXT(selection.mode, selection.max)}</span></p>
          <ul className="xp-chart-options">
            {targets.map(t => {
              const on = selected.has(t.key), mark = selection.marks?.[t.key];
              return (
                <li key={t.key}>
                  <button type="button" className="xp-chart-option" aria-pressed={on} data-xp-key={t.key} data-xp-review={mark}
                    disabled={selection.readOnly || !selection.onChange} onClick={() => activate(t.key)}>
                    <bdi>{t.label}</bdi>
                    {mark && <span className="xp-chart-option-mark"> — {MARK_TEXT[mark]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="xp-chart-sr" aria-live="polite">{announce}</p>
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
