import { callLabel, layoutCalls, type CallTree } from "./callTree";

// Visual lab V8 — the call tree drawn (its own small SVG, in the player's lazy chunk). The call running now is filled, the calls waiting
// under it are outlined, a finished call is quiet and shows «= its value». One `role="img"` with a sentence for a screen reader.
const MONO = 8.2;
const w = (s: string) => [...s].length * MONO;

export default function CallTreeView({ tree }: { tree: CallTree }) {
  const pos = layoutCalls(tree);
  const ids = [...tree.nodes.keys()];
  const cellW = Math.max(56, ...ids.map(id => { const n = tree.nodes.get(id)!; return Math.max(w(callLabel(n)), w("= " + (n.ret ?? ""))) + 18; }));
  const colW = cellW + 14, rowH = 64, top = 10, ch = 38;
  const cols = Math.max(1, ...[...pos.values()].map(p => p.x + 1));
  const rows = Math.max(1, ...[...pos.values()].map(p => p.depth + 1));
  const W = cols * colW + 10, H = top + rows * rowH;
  const cx = (id: number) => 5 + pos.get(id)!.x * colW + colW / 2;
  const cy = (id: number) => top + pos.get(id)!.depth * rowH;
  const running = ids.find(id => tree.nodes.get(id)!.state === "running");
  const say = "شجرة الاستدعاءات: " + ids.length + " استدعاءً حتى الآن" + (running !== undefined ? "، يعمل الآن " + callLabel(tree.nodes.get(running)!) : "") + ". "
    + ids.filter(id => tree.nodes.get(id)!.state === "done" && tree.nodes.get(id)!.ret !== undefined).slice(0, 8).map(id => callLabel(tree.nodes.get(id)!) + " أعاد " + tree.nodes.get(id)!.ret).join("، ");
  return (
    <div className="learning-ds-canvas" dir="ltr" data-testid="lab-call-tree">
      <svg className="learning-ds-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ minWidth: Math.round(W * 0.72) }} role="img" aria-label={say}>
        {ids.map(id => {
          const n = tree.nodes.get(id)!;
          return n.parent === null ? null : (
            <line key={"e" + id} className="learning-ds-link" x1={cx(n.parent)} y1={cy(n.parent) + ch} x2={cx(id)} y2={cy(id)} />
          );
        })}
        {ids.map(id => {
          const n = tree.nodes.get(id)!;
          const x = cx(id) - cellW / 2, y = cy(id);
          return (
            <g key={id} className={"lab-call is-" + n.state} data-call={id}>
              <rect className={"learning-ds-cell" + (n.state === "running" ? " is-head" : n.state === "waiting" ? " is-round" : "")} x={x} y={y} width={cellW} height={ch} rx="6" />
              <text className="learning-ds-value" x={cx(id)} y={y + (n.state === "done" && n.ret !== undefined ? 16 : 23)} textAnchor="middle">{callLabel(n)}</text>
              {n.state === "done" && n.ret !== undefined && <text className="learning-ds-tag" x={cx(id)} y={y + 32} textAnchor="middle">{"= " + n.ret}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
