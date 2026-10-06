import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NetworkTopologyConfigV1, TopologyDevice, TopologyLink } from "../networkTopologyModel";
import "./network-topology.css";

// Phase 20B — the ExamBank network diagram (original artwork: no third-party device icons or branding). A responsive inline SVG drawn from
// the CANONICAL config only: devices at their normalized positions, links with the exact endpoint ports, down links dashed, the selected
// device highlighted. Pointer selection here is a convenience — the accessible path is the device list the hosts render next to it (the
// SVG is one labelled image). Dragging is AUTHORING-only (`editable`): pointer events, coordinates clamped to 0..1 and rounded; positions
// are presentation data and never reach grading.
const W = 1000, H = 620, PAD_X = 70, PAD_Y = 60;
const px = (x: number) => PAD_X + x * (W - 2 * PAD_X);
const py = (y: number) => PAD_Y + y * (H - 2 * PAD_Y - 60);
const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));

function Glyph({ kind }: { kind: TopologyDevice["kind"] }) {
  if (kind === "router") return (<>
    <circle className="nettopo-shape" r={38} />
    <path className="nettopo-glyph" d="M-20 0h40M0-20v40M14-6l6 6-6 6M-14-6l-6 6 6 6M-6-14l6-6 6 6M-6 14l6 6 6-6" />
  </>);
  if (kind === "switch") return (<>
    <rect className="nettopo-shape" x={-50} y={-28} width={100} height={56} rx={10} />
    <path className="nettopo-glyph" d="M-30-8h56l-8-7M30 8h-56l8 7" />
  </>);
  return (<>
    <rect className="nettopo-shape" x={-40} y={-34} width={80} height={52} rx={6} />
    <path className="nettopo-glyph" d="M0 18v10M-18 30h36" />
  </>);
}

export type TopologyDiagramProps = {
  config: NetworkTopologyConfigV1;
  title: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** True when a link is not operational (drawn dashed). */
  linkDown?: (link: TopologyLink) => boolean;
  editable?: boolean;
  onMove?: (id: string, x: number, y: number) => void;
  testId?: string;
};

export default function TopologyDiagram({ config, title, selectedId, onSelect, linkDown, editable, onMove, testId }: TopologyDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const pos = (d: TopologyDevice) => (drag && drag.id === d.id ? { x: drag.x, y: drag.y } : { x: d.x, y: d.y });
  const byId = new Map(config.devices.map(d => [d.id, d]));
  const toUnit = (e: ReactPointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H;
    return { x: clamp01((sx - PAD_X) / (W - 2 * PAD_X)), y: clamp01((sy - PAD_Y) / (H - 2 * PAD_Y - 60)) };
  };
  return (
    <div className="nettopo-diagram" data-testid={testId ?? "nettopo-diagram"}>
      <svg ref={svgRef} viewBox={"0 0 " + W + " " + H} role="img" aria-label={title}
        onPointerMove={e => { if (!drag) return; const u = toUnit(e); if (u) setDrag({ id: drag.id, ...u }); }}
        onPointerUp={() => { if (drag && onMove) onMove(drag.id, drag.x, drag.y); setDrag(null); }}
        onPointerLeave={() => setDrag(null)}>
        {config.links.map(l => {
          const a = byId.get(l.a.deviceId), b = byId.get(l.b.deviceId);
          if (!a || !b) return null;
          const pa = pos(a), pb = pos(b);
          const ax = px(pa.x), ay = py(pa.y), bx = px(pb.x), by = py(pb.y);
          const down = linkDown ? linkDown(l) : false;
          const at = (t: number) => ({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
          const la = at(0.24), lb = at(0.76);
          return (
            <g key={l.id} data-testid="nettopo-link" data-link-id={l.id} data-down={down ? "true" : "false"}>
              <line className={"nettopo-link" + (down ? " is-down" : "")} x1={ax} y1={ay} x2={bx} y2={by} />
              <text className="nettopo-port" x={la.x} y={la.y - 8} textAnchor="middle">{l.a.port}</text>
              <text className="nettopo-port" x={lb.x} y={lb.y - 8} textAnchor="middle">{l.b.port}</text>
            </g>
          );
        })}
        {config.devices.map(d => {
          const p = pos(d);
          return (
            <g key={d.id} className={"nettopo-node" + (selectedId === d.id ? " is-selected" : "") + (editable ? " is-draggable" : "")} data-kind={d.kind} data-device-id={d.id}
              transform={"translate(" + px(p.x) + " " + py(p.y) + ")"}
              onClick={() => onSelect?.(d.id)}
              onPointerDown={e => { if (!editable) return; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDrag({ id: d.id, x: d.x, y: d.y }); }}>
              <rect className="nettopo-halo" x={-62} y={-48} width={124} height={118} rx={16} />
              <Glyph kind={d.kind} />
              <text y={60} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
