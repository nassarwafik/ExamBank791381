import { memo, useId } from "react";
import { DYNAMIC_LIMITS, SIMULATION_CLOCK_VERSION } from "./simulationClock";
import { linearScale, niceTicks, pathData } from "./progressivePath";
import "./dynamic.css";

// Phase 20E — the trusted, repository-owned 2D plot of the dynamic SmartSim runtime. Every element is constructed here from NUMBERS: axes,
// ticks, labels, an optional faint reference curve, the progressive series (the prefix the caller computed for the current simulation time),
// the synchronized current marker, the current-time line, event markers and an optional zero line. No markup, path string, href or style
// ever comes from data; text arrives as React text nodes. Non-finite domains / points never reach an attribute; points and events are
// bounded; the drawing is clipped to the plot area.
export type PlotPoint = { x: number; y: number };
export type PlotSeries = { id: string; points: readonly PlotPoint[]; dashed?: boolean; className?: string };
export type PlotEvent = { x: number; y: number; label: string; kind: string };
export type DynamicPlot2DProps = {
  width: number; height: number;
  xDomain: readonly [number, number]; yDomain: readonly [number, number];
  xLabel: string; yLabel: string; title: string; testId?: string;
  reference?: readonly PlotSeries[]; progress: readonly PlotSeries[];
  marker?: PlotPoint & { label?: string }; nowX?: number;
  events?: readonly PlotEvent[]; zeroLine?: boolean; grid?: boolean;
};
const PAD = { left: 44, right: 12, top: 12, bottom: 30 };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const safeDomain = (d: readonly [number, number]): [number, number] => {
  const a = finite(d[0]) ? d[0] : 0, b = finite(d[1]) ? d[1] : 1;
  return a === b ? [a - 1, b + 1] : a < b ? [a, b] : [b, a];
};
const SAFE_CLASS = /^[a-z][a-z0-9-]{0,40}$/;
const fmt = (v: number) => String(Number(v.toPrecision(4)));

function DynamicPlot2D({ width, height, xDomain, yDomain, xLabel, yLabel, title, testId, reference = [], progress, marker, nowX, events = [], zeroLine, grid = true }: DynamicPlot2DProps) {
  const clip = "dynclip" + useId().replace(/[^A-Za-z0-9_-]/g, "");
  const W = finite(width) && width > 0 ? width : 320, H = finite(height) && height > 0 ? height : 200;
  const [x0, x1] = safeDomain(xDomain), [y0, y1] = safeDomain(yDomain);
  const sx = linearScale(x0, x1, PAD.left, W - PAD.right), sy = linearScale(y0, y1, H - PAD.bottom, PAD.top);
  const xt = niceTicks(x0, x1, 6), yt = niceTicks(y0, y1, 5);
  const inX = (v: number) => finite(v) && v >= x0 && v <= x1, inY = (v: number) => finite(v) && v >= y0 && v <= y1;
  const series = (s: PlotSeries, kind: "ref" | "prog") => (
    <path key={kind + s.id} data-series={kind === "prog" ? s.id : undefined} data-reference={kind === "ref" ? s.id : undefined}
      className={"xp-dyn-series" + (kind === "ref" ? " is-reference" : "") + (s.dashed ? " is-dashed" : "") + (s.className && SAFE_CLASS.test(s.className) ? " " + s.className : "")}
      d={pathData(s.points, sx, sy)} />
  );
  const showMarker = marker && finite(marker.x) && finite(marker.y);
  return (
    <svg className="xp-dyn-plot" viewBox={"0 0 " + W + " " + H} role="img" aria-label={title} data-testid={testId} data-clock={SIMULATION_CLOCK_VERSION}>
      <defs><clipPath id={clip}><rect x={PAD.left} y={PAD.top} width={Math.max(0, W - PAD.left - PAD.right)} height={Math.max(0, H - PAD.top - PAD.bottom)} /></clipPath></defs>
      {grid && xt.map(v => <line key={"gx" + v} className="xp-dyn-grid" x1={sx(v)} x2={sx(v)} y1={PAD.top} y2={H - PAD.bottom} />)}
      {grid && yt.map(v => <line key={"gy" + v} className="xp-dyn-grid" x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} />)}
      <line className="xp-dyn-axis" x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} />
      <line className="xp-dyn-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} />
      {xt.map(v => <text key={"tx" + v} className="xp-dyn-tick" x={sx(v)} y={H - PAD.bottom + 14} textAnchor="middle">{fmt(v)}</text>)}
      {yt.map(v => <text key={"ty" + v} className="xp-dyn-tick" x={PAD.left - 4} y={sy(v) + 4} textAnchor="end">{fmt(v)}</text>)}
      <text className="xp-dyn-label" x={W - PAD.right} y={H - 4} textAnchor="end">{xLabel}</text>
      <text className="xp-dyn-label" x={4} y={PAD.top - 2}>{yLabel}</text>
      <g clipPath={"url(#" + clip + ")"}>
        {zeroLine && inY(0) && <line className="xp-dyn-zero" x1={PAD.left} x2={W - PAD.right} y1={sy(0)} y2={sy(0)} />}
        {reference.slice(0, DYNAMIC_LIMITS.seriesMax).map(s => series(s, "ref"))}
        {progress.slice(0, DYNAMIC_LIMITS.seriesMax).map(s => series(s, "prog"))}
        {finite(nowX) && inX(nowX) && <line className="xp-dyn-now" x1={sx(nowX)} x2={sx(nowX)} y1={PAD.top} y2={H - PAD.bottom} />}
        {events.slice(0, DYNAMIC_LIMITS.eventMarkersMax).filter(e => finite(e.x) && finite(e.y)).map((e, i) => (
          <g key={"ev" + i} className="xp-dyn-event" data-kind={SAFE_CLASS.test(e.kind) ? e.kind : "event"} transform={"translate(" + sx(e.x).toFixed(2) + " " + sy(e.y).toFixed(2) + ")"}>
            <title>{e.label}</title>
            <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" />
          </g>
        ))}
        {showMarker && <circle className="xp-dyn-marker" data-testid="dyn-marker" data-x={marker!.x.toFixed(4)} data-y={marker!.y.toFixed(4)} cx={sx(marker!.x).toFixed(2)} cy={sy(marker!.y).toFixed(2)} r={5}>{marker!.label && <title>{marker!.label}</title>}</circle>}
      </g>
    </svg>
  );
}
export default memo(DynamicPlot2D);
