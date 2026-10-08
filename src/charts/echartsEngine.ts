// Phase 21A.1 — the LAZY chart ENGINE chunk: the only module that imports the rendering library core (modular, tree-shaken: bar / line /
// pie / scatter, the grid, reference lines and the SVG renderer). Loaded with a dynamic import() from the lazy DataChart component only when a
// chart is actually on screen, so no first-load graph ever contains it. Engine events leave this module only as primitive ExamBank events
// (component / series / data index and pointer offset) — never as library objects.
import { init, use as registerModules } from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EngineOption } from "./echartsAdapter";

registerModules([BarChart, LineChart, PieChart, ScatterChart, GridComponent, MarkLineComponent, SVGRenderer]);

/** Marker the bundle guard looks for: this string exists only in the engine chunk. */
export const CHART_ENGINE_MARKER = "xp-chart-engine-v1";
export type EngineEvent = { type: "click" | "over" | "out"; componentType?: string; seriesIndex?: number; dataIndex?: number; offsetX?: number; offsetY?: number };
/** `resize()` follows the container (width AND height: a print height never outlives the print); `resize(width, height?)` draws at that
 *  size (print: the page width and the chart's own height — the print layout's fluid box must not be measured), until the next `resize()`. The engine paints on its next animation frame; `flush()`
 *  paints NOW — printing lays the page out before any further frame runs. */
export type EngineHandle = { update(option: EngineOption): void; resize(width?: number, height?: number): void; flush(): void; dispose(): void; disposed(): boolean };
type RawParams = { componentType?: unknown; seriesIndex?: unknown; dataIndex?: unknown; event?: { offsetX?: unknown; offsetY?: unknown } };
const toEvent = (type: EngineEvent["type"], p: RawParams | undefined): EngineEvent => ({
  type,
  ...(typeof p?.componentType === "string" ? { componentType: p.componentType } : {}),
  ...(typeof p?.seriesIndex === "number" ? { seriesIndex: p.seriesIndex } : {}),
  ...(typeof p?.dataIndex === "number" ? { dataIndex: p.dataIndex } : {}),
  ...(typeof p?.event?.offsetX === "number" ? { offsetX: p.event.offsetX } : {}),
  ...(typeof p?.event?.offsetY === "number" ? { offsetY: p.event.offsetY } : {})
});

/** The drawn SVG carries a viewBox equal to its drawing size, so a stylesheet can scale the picture to a narrower box (print) instead of the
 *  page cutting it off; the renderer sets only width / height and never touches the viewBox afterwards. */
function fitViewBox(el: HTMLElement) {
  const svg = el.querySelector("svg");
  const w = Number(svg?.getAttribute("width")), h = Number(svg?.getAttribute("height"));
  if (svg && w > 0 && h > 0) { svg.setAttribute("viewBox", "0 0 " + w + " " + h); svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); }
}

/** Mounts one chart instance (SVG) into `el`. The caller owns its lifecycle: update on data / context change, resize, dispose on unmount. */
export function mountChartEngine(el: HTMLElement, option: EngineOption, onEvent: (e: EngineEvent) => void): EngineHandle {
  const chart = init(el, null, { renderer: "svg" });
  el.setAttribute("data-xp-engine", CHART_ENGINE_MARKER);
  chart.setOption(option, { notMerge: true });
  fitViewBox(el);
  chart.on("click", p => onEvent(toEvent("click", p as RawParams)));
  chart.on("mouseover", p => onEvent(toEvent("over", p as RawParams)));
  chart.on("mouseout", p => onEvent(toEvent("out", p as RawParams)));
  return {
    update: option2 => { if (!chart.isDisposed()) { chart.setOption(option2, { notMerge: true }); fitViewBox(el); } },
    resize: (width, height) => { if (!chart.isDisposed()) { chart.resize(width && width > 0 ? { width, ...(height && height > 0 ? { height } : {}) } : { width: "auto", height: "auto" }); fitViewBox(el); } },
    flush: () => { if (!chart.isDisposed()) { chart.getZr().refreshImmediately(); fitViewBox(el); } },
    dispose: () => { if (!chart.isDisposed()) chart.dispose(); },
    disposed: () => chart.isDisposed()
  };
}
