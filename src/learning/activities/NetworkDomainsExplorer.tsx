import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Batch 4 — `interactive-diagram / network-domains / v1` (Book 791381 PDF 98–101, placed on PDF 101 after the
 * Collision Domain and Broadcast Domain pages and the Switch / Router / VLAN table).
 *
 * Four small networks as keyboard-usable radio buttons (Hub · Switch · Router · VLAN). Selecting one redraws a
 * native SVG: every collision domain is outlined with a DASHED box (the book's own drawing convention, PDF 98–99)
 * and every Broadcast domain with a coloured box (PDF 100–101). Two toggles show / hide each outline family so the
 * learner can compare the two ideas. The counts and the reason sentences are read from the block `config` (the
 * book's wording) and mirrored as text in a status region — the outlines are never the only carrier of meaning.
 * No timers, no animation, no simulation of traffic, no network, no persistence. Shell reset (epoch stamp).
 */
type ScenarioId = "hub" | "switch" | "router" | "vlan";
const IDS: ScenarioId[] = ["hub", "switch", "router", "vlan"];
type Scenario = { id: ScenarioId; name: string; title: string; collision: number; broadcast: number; collisionNote: string; broadcastNote: string };
type Config = { scenarios: Scenario[]; collisionLabel: string; broadcastLabel: string; showCollisionLabel: string; showBroadcastLabel: string; legend: string };

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const scenarios: Scenario[] = [];
  for (const raw of Array.isArray(c.scenarios) ? c.scenarios : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const ok = IDS.includes(o.id as ScenarioId) && typeof o.name === "string" && !!o.name && typeof o.title === "string" && !!o.title
      && Number.isInteger(o.collision) && (o.collision as number) >= 1 && Number.isInteger(o.broadcast) && (o.broadcast as number) >= 1
      && typeof o.collisionNote === "string" && typeof o.broadcastNote === "string";
    if (!ok || scenarios.some(s => s.id === o.id)) continue;
    scenarios.push({ id: o.id as ScenarioId, name: o.name as string, title: o.title as string, collision: o.collision as number, broadcast: o.broadcast as number, collisionNote: o.collisionNote as string, broadcastNote: o.broadcastNote as string });
  }
  if (scenarios.length === 0) return null;
  const str = (k: string, fb: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : fb);
  return {
    scenarios,
    collisionLabel: str("collisionLabel", "مجال تصادم"), broadcastLabel: str("broadcastLabel", "مجال Broadcast"),
    showCollisionLabel: str("showCollisionLabel", "أظهر مجالات التصادم"), showBroadcastLabel: str("showBroadcastLabel", "أظهر مجالات Broadcast"),
    legend: str("legend", ""),
  };
}

type Box = { x: number; y: number; w: number; h: number; label?: string };
type Node = { id: string; x: number; y: number; label: string; kind: "pc" | "device" };
type Shape = { nodes: Node[]; edges: [string, string][]; collision: Box[]; broadcast: Box[] };

// Fixed drawings per scenario (viewBox 0 0 320 200). The dashed boxes follow the book's figures: one box around
// everything on a Hub, one box per used switch port otherwise; the coloured boxes follow PDF 100–101.
function shapeOf(id: ScenarioId): Shape {
  const pc = (i: string, x: number, y: number): Node => ({ id: i, x, y, label: i, kind: "pc" });
  const dev = (i: string, x: number, y: number, label: string): Node => ({ id: i, x, y, label, kind: "device" });
  const pcs4 = [pc("A", 45, 150), pc("B", 120, 150), pc("C", 200, 150), pc("D", 275, 150)];
  const perPc = (n: Node): Box => ({ x: n.x - 30, y: 92, w: 60, h: 92 });
  switch (id) {
    case "hub": return {
      nodes: [dev("H", 160, 50, "Hub"), ...pcs4], edges: [["H", "A"], ["H", "B"], ["H", "C"], ["H", "D"]],
      collision: [{ x: 12, y: 22, w: 296, h: 166 }], broadcast: [{ x: 4, y: 14, w: 312, h: 182 }],
    };
    case "switch": return {
      nodes: [dev("S", 160, 50, "Switch"), ...pcs4], edges: [["S", "A"], ["S", "B"], ["S", "C"], ["S", "D"]],
      collision: pcs4.map(perPc), broadcast: [{ x: 4, y: 14, w: 312, h: 182 }],
    };
    case "router": {
      const left = [pc("A", 40, 160), pc("B", 110, 160)], right = [pc("C", 210, 160), pc("D", 280, 160)];
      const box = (n: Node): Box => ({ x: n.x - 26, y: 112, w: 52, h: 76 });
      return {
        nodes: [dev("R", 160, 32, "Router"), dev("S1", 75, 95, "Switch"), dev("S2", 245, 95, "Switch"), ...left, ...right],
        edges: [["R", "S1"], ["R", "S2"], ["S1", "A"], ["S1", "B"], ["S2", "C"], ["S2", "D"]],
        collision: [...left.map(box), ...right.map(box), { x: 100, y: 46, w: 36, h: 36 }, { x: 184, y: 46, w: 36, h: 36 }],
        broadcast: [{ x: 6, y: 78, w: 138, h: 116, label: "Broadcast Domain 1" }, { x: 176, y: 78, w: 138, h: 116, label: "Broadcast Domain 2" }],
      };
    }
    case "vlan": return {
      nodes: [dev("S", 160, 50, "Switch"), ...pcs4], edges: [["S", "A"], ["S", "B"], ["S", "C"], ["S", "D"]],
      collision: pcs4.map(perPc), broadcast: [{ x: 6, y: 84, w: 150, h: 110, label: "VLAN 10" }, { x: 164, y: 84, w: 150, h: 110, label: "VLAN 20" }],
    };
  }
}

export default function NetworkDomainsExplorer({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ index: 0, collision: true, broadcast: true, epoch: 0 });
  const live = state.epoch === commands.reset ? state : { index: 0, collision: true, broadcast: true, epoch: commands.reset };

  if (!cfg) return <p className="learning-domains-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const scenario = cfg.scenarios[Math.min(live.index, cfg.scenarios.length - 1)];
  const shape = shapeOf(scenario.id);
  const at = (id: string) => shape.nodes.find(n => n.id === id)!;
  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };
  const summary = `${scenario.title}: ${scenario.collision} ${cfg.collisionLabel} — ${scenario.collisionNote} · ${scenario.broadcast} ${cfg.broadcastLabel} — ${scenario.broadcastNote}`;

  return (
    <div className="learning-domains" data-reduced-motion={reducedMotion || undefined} data-scenario={scenario.id}>
      <div className="learning-domains-tabs" role="radiogroup" aria-label="اختر الشبكة">
        {cfg.scenarios.map((s, i) => (
          <button key={s.id} type="button" role="radio" aria-checked={i === live.index} className={"learning-domains-tab" + (i === live.index ? " is-active" : "")}
            onClick={() => update({ index: i }, "domains-scenario", { id: s.id })}>
            <span className="learning-domains-tab-name" dir="ltr">{s.name}</span>
            <span className="learning-domains-tab-title">{s.title}</span>
          </button>
        ))}
      </div>
      <div className="learning-domains-toggles">
        <button type="button" className={"learning-domains-toggle" + (live.collision ? " is-on" : "")} aria-pressed={live.collision}
          onClick={() => update({ collision: !live.collision }, "domains-toggle", { layer: "collision", on: !live.collision })}>{cfg.showCollisionLabel}</button>
        <button type="button" className={"learning-domains-toggle" + (live.broadcast ? " is-on" : "")} aria-pressed={live.broadcast}
          onClick={() => update({ broadcast: !live.broadcast }, "domains-toggle", { layer: "broadcast", on: !live.broadcast })}>{cfg.showBroadcastLabel}</button>
      </div>

      <svg className="learning-domains-stage" viewBox="0 0 320 200" role="img" aria-label={summary}>
        {live.broadcast && shape.broadcast.map((b, i) => (
          <g key={"b" + i} className="learning-domains-bbox">
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} className="learning-domains-broadcast" />
            {b.label && <text x={b.x + 6} y={b.y + 12} className="learning-domains-boxlabel">{b.label}</text>}
          </g>
        ))}
        {live.collision && shape.collision.map((b, i) => (
          <rect key={"c" + i} x={b.x} y={b.y} width={b.w} height={b.h} rx={6} className="learning-domains-collision" />
        ))}
        {shape.edges.map(([a, b]) => { const p = at(a), q = at(b); return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="learning-domains-edge" />; })}
        {shape.nodes.map(n => (
          <g key={n.id} className={"learning-domains-node is-" + n.kind} transform={`translate(${n.x} ${n.y})`}>
            {n.kind === "device"
              ? <rect x={-24} y={-11} width={48} height={22} rx={4} className="learning-domains-device" />
              : <rect x={-14} y={-11} width={28} height={20} rx={3} className="learning-domains-pc" />}
            <text y={4} textAnchor="middle" className="learning-domains-label">{n.label}</text>
          </g>
        ))}
      </svg>

      <div className="learning-domains-detail" role="status">
        <p className="learning-domains-counts">
          <span className="learning-domains-count is-collision">{scenario.collision} {cfg.collisionLabel}</span>
          <span className="learning-domains-count is-broadcast">{scenario.broadcast} {cfg.broadcastLabel}</span>
        </p>
        <p className="learning-domains-note"><strong>{cfg.collisionLabel}:</strong> {scenario.collisionNote}</p>
        <p className="learning-domains-note"><strong>{cfg.broadcastLabel}:</strong> {scenario.broadcastNote}</p>
      </div>
      {cfg.legend && <p className="learning-domains-legend">{cfg.legend}</p>}
    </div>
  );
}
