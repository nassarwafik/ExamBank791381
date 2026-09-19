import { useEffect, useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Units 4–6 phase — `interactive-diagram / network-topologies / v1` (Book 791381 PDF 58–60).
 *
 * Six forms — P2P · Bus · Ring · Star · Tree · Hybrid — as keyboard-usable radio buttons; selecting one REDRAWS
 * the native SVG: Bus shows the shared line, Ring the closed circular path with direction arrows, Star an obvious
 * central device, Tree its levels (labelled), Hybrid a Star joined to a Bus segment. «أرسل» highlights the path the
 * data takes from one device to another hop by hop, mirrored as text (aria-live); for Bus an extra «أرسل جهازين
 * معًا» shows the book's own conceptual collision (a labelled marker + a sentence). Reduced motion renders the
 * final path at once. Shell reset. No network, no persistence, conceptual only (not a simulator). Names,
 * descriptions and the collision wording come from the block's `config`.
 */
type Topo = { id: TopoId; name: string; title: string; description: string };
type TopoId = "p2p" | "bus" | "ring" | "star" | "tree" | "hybrid";
const IDS: TopoId[] = ["p2p", "bus", "ring", "star", "tree", "hybrid"];
type Config = { topologies: Topo[]; centerLabel: string; collisionLabel: string; collisionNote: string };

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const topologies: Topo[] = [];
  for (const t of Array.isArray(c.topologies) ? c.topologies : []) {
    const o = t as Record<string, unknown>;
    if (IDS.includes(o?.id as TopoId) && typeof o.name === "string" && typeof o.title === "string" && typeof o.description === "string") topologies.push({ id: o.id as TopoId, name: o.name, title: o.title, description: o.description });
  }
  if (topologies.length === 0) return null;
  const str = (k: string, fb: string) => (typeof c[k] === "string" ? (c[k] as string) : fb);
  return { topologies, centerLabel: str("centerLabel", "Switch"), collisionLabel: str("collisionLabel", "تصادم Collision"), collisionNote: str("collisionNote", "") };
}

type N = { id: string; x: number; y: number; label: string; kind: "pc" | "device" };
type Shape = { nodes: N[]; edges: [string, string][]; path: string[]; bus?: { y: number; x1: number; x2: number }; ring?: boolean; levels?: { y: number; label: string }[] };

function shapeOf(id: TopoId, center: string): Shape {
  const pc = (i: string, x: number, y: number, label = i): N => ({ id: i, x, y, label, kind: "pc" });
  const dev = (i: string, x: number, y: number, label: string): N => ({ id: i, x, y, label, kind: "device" });
  switch (id) {
    case "p2p": return { nodes: [pc("A", 90, 90, "جهاز 1"), pc("B", 230, 90, "جهاز 2")], edges: [["A", "B"]], path: ["A", "B"] };
    case "bus": return { nodes: [pc("A", 60, 60), pc("B", 130, 60), pc("C", 200, 60), pc("D", 270, 60)], edges: [], path: ["A", "bus", "C"], bus: { y: 120, x1: 30, x2: 300 } };
    case "ring": return { nodes: [pc("A", 160, 30), pc("B", 260, 90), pc("C", 160, 150), pc("D", 60, 90)], edges: [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]], path: ["A", "B", "C"], ring: true };
    case "star": return { nodes: [dev("S", 160, 90, center), pc("A", 60, 40), pc("B", 260, 40), pc("C", 60, 150), pc("D", 260, 150)], edges: [["S", "A"], ["S", "B"], ["S", "C"], ["S", "D"]], path: ["A", "S", "D"] };
    case "tree": return {
      nodes: [dev("R", 160, 30, center), dev("S1", 80, 90, center), dev("S2", 240, 90, center), pc("A", 40, 150), pc("B", 120, 150), pc("C", 200, 150), pc("D", 280, 150)],
      edges: [["R", "S1"], ["R", "S2"], ["S1", "A"], ["S1", "B"], ["S2", "C"], ["S2", "D"]], path: ["A", "S1", "R", "S2", "D"],
      levels: [{ y: 30, label: "المستوى 1" }, { y: 90, label: "المستوى 2" }, { y: 150, label: "المستوى 3" }],
    };
    case "hybrid": return {
      nodes: [dev("S", 90, 90, center), pc("A", 30, 40), pc("B", 30, 140), pc("C", 200, 60), pc("D", 270, 60)],
      edges: [["S", "A"], ["S", "B"], ["S", "bus"]], path: ["A", "S", "bus", "D"], bus: { y: 120, x1: 150, x2: 300 },
    };
  }
}

const STEP_MS = 650;

export default function NetworkTopologiesExplorer({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [sel, setSel] = useState<{ index: number; epoch: number }>({ index: 0, epoch: 0 });
  const [run, setRun] = useState({ id: 0, started: false, step: 0, collision: false, epoch: 0 });
  const index = sel.epoch === commands.reset ? sel.index : 0;
  const liveRun = useMemo(() => (run.epoch === commands.reset ? run : { id: run.id, started: false, step: 0, collision: false, epoch: commands.reset }), [run, commands.reset]);
  const topo = cfg?.topologies[Math.min(index, (cfg?.topologies.length ?? 1) - 1)];
  const shape = useMemo(() => (topo ? shapeOf(topo.id, cfg?.centerLabel ?? "Switch") : null), [topo, cfg?.centerLabel]);
  const last = shape ? shape.path.length - 1 : 0;
  const step = liveRun.started ? (reducedMotion ? last : Math.min(liveRun.step, last)) : -1;

  useEffect(() => {
    if (!liveRun.started || liveRun.collision || reducedMotion || liveRun.step >= last) return;
    const t = setTimeout(() => setRun({ ...liveRun, step: liveRun.step + 1 }), STEP_MS);
    return () => clearTimeout(t);
  }, [liveRun, reducedMotion, last]);

  if (!cfg || !topo || !shape) return <p className="learning-topo-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const nodeById = (id: string) => shape.nodes.find(n => n.id === id);
  const labelOf = (id: string) => (id === "bus" ? "الخط المشترك" : nodeById(id)?.label ?? id);
  const pointOf = (id: string): { x: number; y: number } => (id === "bus" ? { x: ((shape.bus?.x1 ?? 0) + (shape.bus?.x2 ?? 0)) / 2, y: shape.bus?.y ?? 0 } : { x: nodeById(id)!.x, y: nodeById(id)!.y });
  const choose = (i: number) => {
    setSel({ index: i, epoch: commands.reset });
    setRun(r => ({ ...r, started: false, step: 0, collision: false, epoch: commands.reset }));
    emit({ type: "interaction", activityId: block.id, name: "topology-select", detail: { topology: cfg.topologies[i].id } });
  };
  const send = () => { setRun({ id: liveRun.id + 1, started: true, step: 0, collision: false, epoch: commands.reset }); emit({ type: "interaction", activityId: block.id, name: "topology-send", detail: { topology: topo.id } }); };
  const collide = () => { setRun({ id: liveRun.id + 1, started: true, step: last, collision: true, epoch: commands.reset }); emit({ type: "interaction", activityId: block.id, name: "topology-collision", detail: { topology: topo.id } }); };
  const onPath = (a: string, b: string) => { const i = shape.path.indexOf(a), j = shape.path.indexOf(b); return (i >= 0 && j === i + 1 && step >= j) || (j >= 0 && i === j + 1 && step >= i); };
  const packet = step >= 0 && !liveRun.collision ? pointOf(shape.path[step]) : null;
  const done = liveRun.started && !liveRun.collision && step === last;
  const busDrop = (n: N) => shape.bus && n.kind === "pc" && n.x >= shape.bus.x1 && n.x <= shape.bus.x2 && n.y < shape.bus.y;
  const busOn = shape.path.includes("bus") && step >= shape.path.indexOf("bus");

  return (
    <div className="learning-topo" data-reduced-motion={reducedMotion || undefined} data-topology={topo.id}>
      <div className="learning-topo-tabs" role="radiogroup" aria-label="أشكال الشبكات">
        {cfg.topologies.map((t, i) => (
          <button key={t.id} type="button" role="radio" aria-checked={i === index} className={"learning-topo-tab" + (i === index ? " is-active" : "")} onClick={() => choose(i)}>
            <span className="learning-topo-tab-name" dir="ltr">{t.name}</span>
            <span className="learning-topo-tab-title">{t.title}</span>
          </button>
        ))}
      </div>

      <svg className="learning-topo-stage" viewBox="0 0 320 180" role="img" aria-label={`${topo.name} — ${topo.title}: ${topo.description}`}>
        {shape.levels?.map(l => <text key={l.label} x="6" y={l.y + 4} className="learning-topo-level">{l.label}</text>)}
        {shape.bus && <line x1={shape.bus.x1} y1={shape.bus.y} x2={shape.bus.x2} y2={shape.bus.y} className={"learning-topo-bus" + (busOn ? " is-on" : "")} />}
        {shape.bus && shape.nodes.filter(busDrop).map(n => <line key={"drop" + n.id} x1={n.x} y1={n.y + 12} x2={n.x} y2={shape.bus!.y} className={"learning-topo-edge" + (onPath(n.id, "bus") ? " is-on" : "")} />)}
        {shape.edges.map(([a, b]) => {
          const pa = pointOf(a), pb = b === "bus" ? { x: shape.bus!.x1, y: shape.bus!.y } : pointOf(b);
          return <line key={a + b} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={"learning-topo-edge" + (onPath(a, b) ? " is-on" : "") + (shape.ring ? " is-ring" : "")} markerEnd={shape.ring ? "url(#learning-topo-arrow)" : undefined} />;
        })}
        {shape.ring && <defs><marker id="learning-topo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" className="learning-topo-arrowhead" /></marker></defs>}
        {shape.nodes.map(n => (
          <g key={n.id} className={"learning-topo-node is-" + n.kind + (shape.path.includes(n.id) && step >= shape.path.indexOf(n.id) ? " is-on" : "")}>
            {n.kind === "device"
              ? <rect x={n.x - 24} y={n.y - 11} width="48" height="22" rx="5" className="learning-topo-device" />
              : <rect x={n.x - 16} y={n.y - 12} width="32" height="24" rx="4" className="learning-topo-pc" />}
            <text x={n.x} y={n.y + 4} textAnchor="middle" className="learning-topo-label">{n.label}</text>
          </g>
        ))}
        {packet && <circle cx={packet.x} cy={packet.y - 18} r="6" className="learning-topo-packet" />}
        {liveRun.collision && shape.bus && (
          <g className="learning-topo-collision">
            <circle cx={(shape.bus.x1 + shape.bus.x2) / 2} cy={shape.bus.y} r="11" className="learning-topo-collision-mark" />
            <text x={(shape.bus.x1 + shape.bus.x2) / 2} y={shape.bus.y + 28} textAnchor="middle" className="learning-topo-collision-label">{cfg.collisionLabel}</text>
          </g>
        )}
      </svg>

      <div className="learning-topo-detail" aria-live="polite">
        <p className="learning-topo-title"><span className="learning-topo-badge" dir="ltr">{topo.name}</span>{topo.title}</p>
        <p className="learning-topo-desc">{topo.description}</p>
      </div>

      <div className="learning-topo-actions">
        <button type="button" className="eb-button is-primary learning-topo-send" onClick={send}>أرسل</button>
        {topo.id === "bus" && <button type="button" className="eb-button is-quiet learning-topo-send" onClick={collide}>أرسل جهازين معًا</button>}
      </div>

      {liveRun.started && !liveRun.collision && (
        <ol className="learning-topo-steps" aria-label="مسار البيانات" aria-live="polite">
          {shape.path.slice(1).map((id, i) => (
            <li key={i} className={"learning-topo-step" + (step >= i + 1 ? " is-done" : "")} aria-current={step === i + 1 ? "step" : undefined}>
              <span className="learning-topo-stepno" aria-hidden="true">{i + 1}</span><span dir="auto">{labelOf(shape.path[i])} ← {labelOf(id)}</span>
            </li>
          ))}
        </ol>
      )}
      {done && <p className="learning-topo-result" role="status">وصلت البيانات من {labelOf(shape.path[0])} إلى {labelOf(shape.path[last])} عبر {shape.path.length - 1} {shape.path.length - 1 === 1 ? "خطوة" : shape.path.length - 1 === 2 ? "خطوتين" : "خطوات"}.</p>}
      {liveRun.collision && <p className="learning-topo-result is-collision" role="status">{cfg.collisionNote}</p>}
    </div>
  );
}
