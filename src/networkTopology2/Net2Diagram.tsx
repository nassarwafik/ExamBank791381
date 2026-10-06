import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Net2Config, Net2Device, Net2Link } from "../net2Model";
import { useSimulationClock } from "../smartsim/dynamic/useSimulationClock";
import { usePrefersReducedMotion } from "../smartsim/dynamic/usePrefersReducedMotion";
import { clockProgress } from "../smartsim/dynamic/simulationClock";
import "./net2.css";

// Phase 20C — the networkTopology@2 diagram (original ExamBank artwork: no third-party device icons or branding). A responsive inline SVG
// drawn from the CANONICAL config only: six device kinds, links with their exact ports, down links dashed, wireless associations as dotted
// arcs, the selected device highlighted. Selection by pointer is a convenience; the hosts always render a keyboard device list next to it.
// Dragging exists only in the AUTHORING editor (`editable`); the student diagram has no drag, no draggable attribute and no structure edit.
const W = 1000, H = 640, PAD_X = 70, PAD_Y = 60;
const px = (x: number) => PAD_X + x * (W - 2 * PAD_X);
const py = (y: number) => PAD_Y + y * (H - 2 * PAD_Y - 60);
const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));

function Glyph({ kind }: { kind: Net2Device["kind"] }) {
  switch (kind) {
    case "router": return (<><circle className="net2-shape" r={38} /><path className="net2-glyph" d="M-20 0h40M0-20v40M14-6l6 6-6 6M-14-6l-6 6 6 6M-6-14l6-6 6 6M-6 14l6 6 6-6" /></>);
    case "switch": return (<><rect className="net2-shape" x={-50} y={-28} width={100} height={56} rx={10} /><path className="net2-glyph" d="M-30-8h56l-8-7M30 8h-56l8 7" /></>);
    case "ap": return (<><rect className="net2-shape" x={-36} y={-6} width={72} height={30} rx={8} /><path className="net2-glyph" d="M-14-16a20 20 0 0 1 28 0M-24-26a34 34 0 0 1 48 0M0 4v6" /></>);
    case "laptop": return (<><rect className="net2-shape" x={-34} y={-30} width={68} height={42} rx={5} /><path className="net2-glyph" d="M-46 22h92l-8-10h-76z" /></>);
    case "server": return (<><rect className="net2-shape" x={-28} y={-40} width={56} height={76} rx={6} /><path className="net2-glyph" d="M-16-24h32M-16-10h32M-16 4h32M10 22h4" /></>);
    default: return (<><rect className="net2-shape" x={-40} y={-34} width={80} height={52} rx={6} /><path className="net2-glyph" d="M0 18v10M-18 30h36" /></>);
  }
}

// Phase 20E — the TRANSIENT flow overlay: the engine's own hops of the last ping / tracert (computed by net2Flow from the operational engine,
// never here) drawn as a straight polyline through the hop device centres. Consecutive hops are joined straight even when they are not
// cabled to each other: a wireless host's frames cross its access point, which the engine's switch trail does not list (the AP is a
// transparent bridge), so the line goes host → first switch directly. A moving dot travels the path driven by the presentation clock
// (0.5 s per hop, ONE frame loop, autoplay); under reduced motion the static path is shown with no frame loop and no dot. A failed flow
// is drawn up to the last device the engine reached, with a failure marker there — never as a success. Presentation only: nothing here
// decides reachability, and the overlay is remounted (fresh clock) for every new flow by its `id`.
export type Net2DiagramFlow = { id: number; ok: boolean; hops: readonly string[] };
const FLOW_SECONDS_PER_HOP = 0.5;
type Pt = { x: number; y: number };
function FlowOverlay({ ok, hops, points }: { ok: boolean; hops: readonly string[]; points: readonly Pt[] }) {
  const reduced = usePrefersReducedMotion();
  const segments = Math.max(0, points.length - 1);
  const clock = useSimulationClock(segments * FLOW_SECONDS_PER_HOP, { autoPlay: true, reducedMotion: reduced });
  const { pause } = clock;
  useEffect(() => { if (reduced) pause(); }, [reduced, pause]);
  const progress = reduced ? 1 : clockProgress(clock.state);
  const at = progress * segments, i = Math.min(Math.floor(at), Math.max(0, segments - 1)), f = segments ? at - i : 0;
  const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
  const dot = a && b ? { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f } : undefined;
  const line = (ps: readonly Pt[]) => ps.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const last = points[points.length - 1];
  return (
    <g className={"dyn-flow " + (ok ? "is-ok" : "is-failed")} data-testid="net2-flow" data-ok={ok ? "true" : "false"} data-hops={hops.join(" ")} aria-hidden="true" pointerEvents="none">
      {segments > 0 && <polyline className="dyn-flow-path" points={line(points)} />}
      {segments > 0 && !reduced && dot && <polyline className="dyn-flow-done" points={line([...points.slice(0, i + 1), dot])} />}
      {segments > 0 && !reduced && dot && <circle className="dyn-flow-dot" data-testid="net2-flow-dot" r={13} cx={dot.x.toFixed(1)} cy={dot.y.toFixed(1)} />}
      {ok && last && <circle className="dyn-flow-end" r={56} cx={last.x} cy={last.y} />}
      {!ok && last && (
        <g className="dyn-flow-fail" data-testid="net2-flow-fail" transform={"translate(" + last.x + " " + (last.y - 52) + ")"}>
          <circle r={20} /><path d="M-9-9L9 9M9-9L-9 9" />
        </g>
      )}
    </g>
  );
}

export type Net2DiagramProps = {
  config: Net2Config;
  title: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  linkDown?: (link: Net2Link) => boolean;
  /** Wireless associations to draw (host id → AP id). */
  wireless?: readonly { host: string; ap: string }[];
  editable?: boolean;
  onMove?: (id: string, x: number, y: number) => void;
  testId?: string;
  /** The transient flow of the last ping / tracert (presentation only; never stored). */
  flow?: Net2DiagramFlow | null;
};

export default function Net2Diagram({ config, title, selectedId, onSelect, linkDown, wireless, editable, onMove, testId, flow }: Net2DiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const byId = new Map(config.devices.map(d => [d.id, d]));
  const pos = (d: Net2Device) => (drag && drag.id === d.id ? { x: drag.x, y: drag.y } : { x: d.x, y: d.y });
  const toUnit = (e: ReactPointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H;
    return { x: clamp01((sx - PAD_X) / (W - 2 * PAD_X)), y: clamp01((sy - PAD_Y) / (H - 2 * PAD_Y - 60)) };
  };
  return (
    <div className="net2-diagram" data-testid={testId ?? "net2-diagram"}>
      <svg ref={svgRef} viewBox={"0 0 " + W + " " + H} role="img" aria-label={title}
        onPointerMove={editable ? e => { if (!drag) return; const u = toUnit(e); if (u) setDrag({ id: drag.id, ...u }); } : undefined}
        onPointerUp={editable ? () => { if (drag && onMove) onMove(drag.id, drag.x, drag.y); setDrag(null); } : undefined}
        onPointerLeave={editable ? () => setDrag(null) : undefined}>
        {config.links.map(l => {
          const a = byId.get(l.a.deviceId), b = byId.get(l.b.deviceId);
          if (!a || !b) return null;
          const pa = pos(a), pb = pos(b);
          const ax = px(pa.x), ay = py(pa.y), bx = px(pb.x), by = py(pb.y);
          const down = linkDown ? linkDown(l) : false;
          const at = (t: number) => ({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
          const la = at(0.24), lb = at(0.76);
          return (
            <g key={l.id} data-link-id={l.id} data-down={down ? "true" : "false"}>
              <line className={"net2-link" + (down ? " is-down" : "")} x1={ax} y1={ay} x2={bx} y2={by} />
              <text className="net2-port" x={la.x} y={la.y - 8} textAnchor="middle">{l.a.port}</text>
              <text className="net2-port" x={lb.x} y={lb.y - 8} textAnchor="middle">{l.b.port}</text>
            </g>
          );
        })}
        {(wireless ?? []).map(w => {
          const h = byId.get(w.host), a = byId.get(w.ap);
          if (!h || !a) return null;
          return <line key={"w" + w.host} className="net2-wifi" x1={px(pos(h).x)} y1={py(pos(h).y)} x2={px(pos(a).x)} y2={py(pos(a).y)} data-wifi={w.host} />;
        })}
        {config.devices.map(d => {
          const p = pos(d);
          return (
            <g key={d.id} className={"net2-node" + (selectedId === d.id ? " is-selected" : "") + (editable ? " is-movable" : "")} data-kind={d.kind} data-device-id={d.id}
              transform={"translate(" + px(p.x) + " " + py(p.y) + ")"} onClick={() => onSelect?.(d.id)}
              onPointerDown={editable ? e => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDrag({ id: d.id, x: d.x, y: d.y }); } : undefined}>
              <rect className="net2-halo" x={-62} y={-52} width={124} height={122} rx={16} />
              <Glyph kind={d.kind} />
              <text y={62} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        {flow && <FlowOverlay key={flow.id} ok={flow.ok} hops={flow.hops} points={flow.hops.flatMap(id => { const d = byId.get(id); return d ? [{ x: px(pos(d).x), y: py(pos(d).y) }] : []; })} />}
      </svg>
    </div>
  );
}
