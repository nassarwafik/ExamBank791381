import { graphSentence, type OgGraph, type OgNode } from "./objectGraph";
import { layoutObjects, OL } from "./objectLayout";
import SaveDrawing from "./SaveDrawing";

/**
 * Visual lab V10 (docs/enterprise-csharp-visual-lab-plan.md §20) — the object diagram of one step (objectGraph.ts): the variables
 * on the left, then each object, array or Dictionary as a box of rows (fields / cells / keys). A row that refers to another box has
 * a dot and an ARROW to that box; a row that changed in this step is lit, a box that `new` just made says «جديد». One SVG with
 * `role="img"` and the whole diagram in words. Left to right like the code. No timers, no state.
 * V13 (§23): the boxes are placed by objectLayout.ts (each level with the rows that refer to it, the variables level with their box),
 * and «حفظ صورة» saves the drawing as a picture (SaveDrawing).
 */
const MONO = 8.7;   // the bold monospace of the values at 14px (a little wider than the plain drawings' 8.2)
const textW = (s: string) => [...s].length * MONO;
const { HEAD, ROW, CHIP, PAD } = OL;
const rowsH = (n: OgNode) => Math.max(1, n.rows.length + (n.more ? 1 : 0)) * ROW;

function measure(n: OgNode): { w: number; keyW: number } {
  const keyW = Math.max(26, ...n.rows.map(r => textW(r.key) + 14));
  const valW = Math.max(44, ...n.rows.map(r => (r.ref !== null ? 26 : textW(r.text) + 24) + (r.marks.length ? textW("◂ " + r.marks.join(", ")) + 8 : 0)));
  const titleW = textW(n.title + " #" + n.id) + 20 + (n.fresh ? textW("جديد") + 10 : 0);
  return { w: Math.max(titleW, keyW + valW, textW("… و" + n.more) + 20), keyW };
}

/**
 * A curve from (sx, sy) to a box, its head drawn by hand (no <marker>, no repeated ids). A box further right is entered from its
 * left side; a box in the same column or to the left (a field referring back: Friend → an earlier Person, a.Other = b) from its
 * RIGHT side, the curve going round on the right — never through the boxes between.
 */
function Link({ sx, sy, right = sx, to, className }: { sx: number; sy: number; right?: number; to: { x: number; y: number; w: number }; className: string }) {
  const ty = to.y + HEAD / 2;
  if (to.x > sx) {
    const tx = to.x, dx = Math.max(24, (tx - sx) / 2);
    return (
      <g>
        <path className={className} d={`M${sx} ${sy} C${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx - 4} ${ty}`} />
        <path className={className + " learning-ds-head"} d={`M${tx} ${ty} L${tx - 8} ${ty - 4.5} L${tx - 8} ${ty + 4.5}z`} />
      </g>
    );
  }
  const tx = to.x + to.w, out = Math.max(right, tx) + 34 + Math.min(40, Math.abs(sy - ty) / 6);
  return (
    <g>
      <path className={className} d={`M${sx} ${sy} C${out} ${sy}, ${out} ${ty}, ${tx + 4} ${ty}`} />
      <path className={className + " learning-ds-head"} d={`M${tx} ${ty} L${tx + 8} ${ty - 4.5} L${tx + 8} ${ty + 4.5}z`} />
    </g>
  );
}

export default function ObjectDiagram({ graph, motion, fileName = "objects" }: { graph: OgGraph; motion?: boolean; fileName?: string }) {
  const rootW = graph.roots.length ? Math.max(40, ...graph.roots.map(r => textW(r.name) + 18)) : 0;
  const layout = layoutObjects(graph, measure, rootW);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const boxes = new Map([...layout.boxes.values()].map(b => [b.id, { ...b, n: byId.get(b.id)! }]));
  const w = layout.width, h = layout.height + (graph.hidden ? 20 : 0);
  const into = (id: number) => { const b = boxes.get(id)!; return { x: b.x, y: b.y, w: b.w }; };
  return (
    <div className="lab-drawing">
    <SaveDrawing fileName={fileName} />
    <div className="learning-ds-canvas lab-og" dir="ltr">
      <svg className="learning-ds-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ minWidth: Math.round(w * 0.72) }} role="img" aria-label={graphSentence(graph)}>
        {layout.roots.map(r => {
          const y = r.y;
          return (
            <g key={r.name + ":" + r.target}>
              <rect className={"lab-og-chip" + (r.top ? "" : " is-dim")} x={PAD} y={y} width={rootW} height={CHIP} rx="4" />
              <text className={"learning-ds-name" + (r.top ? "" : " is-dim")} x={PAD + rootW / 2} y={y + CHIP / 2 + 5} textAnchor="middle">{r.name}</text>
              <Link className="learning-ds-pointer" sx={PAD + rootW} sy={y + CHIP / 2} to={into(r.target)} />
            </g>
          );
        })}
        {[...boxes.values()].map(({ n, x, y, w: bw, keyW }) => (
          <g key={n.id} className={n.fresh && motion ? "is-enter is-pop" : undefined}>
            <rect className={"lab-og-box" + (n.fresh ? " is-fresh" : "")} x={x} y={y} width={bw} height={HEAD + rowsH(n)} rx="5" />
            <text className="lab-og-title" x={x + 10} y={y + HEAD / 2 + 5}>{n.title}<tspan className="lab-og-id">{" #" + n.id}</tspan></text>
            {n.fresh && <text className="lab-og-new" x={x + bw - 8} y={y + HEAD / 2 + 5} textAnchor="end">جديد</text>}
            {n.rows.length === 0 && <text className="learning-ds-muted" x={x + 10} y={y + HEAD + ROW / 2 + 4}>فارغ</text>}
            {n.rows.map((r, i) => {
              const ry = y + HEAD + i * ROW;
              return (
                <g key={i}>
                  <rect className={"lab-og-row" + (r.changed ? " is-changed" : "")} x={x + 1} y={ry} width={bw - 2} height={ROW} />
                  <text className="lab-og-key" x={x + 8} y={ry + ROW / 2 + 4}>{r.key}</text>
                  <line className="learning-ds-split" x1={x + keyW} y1={ry} x2={x + keyW} y2={ry + ROW} />
                  {r.ref !== null ? <circle className="learning-ds-dot" cx={x + keyW + 13} cy={ry + ROW / 2} r="3.5" />
                    : <text className={"learning-ds-value" + (r.changed ? " lab-og-hot" : "")} x={x + keyW + 8} y={ry + ROW / 2 + 5}>{r.text}</text>}
                  {r.marks.length > 0 && <text className="learning-ds-name" x={x + bw - 6} y={ry + ROW / 2 + 5} textAnchor="end">{"◂ " + r.marks.join(", ")}</text>}
                </g>
              );
            })}
            {n.more > 0 && <text className="learning-ds-muted" x={x + 10} y={y + HEAD + n.rows.length * ROW + ROW / 2 + 4}>{"… و" + n.more + " أخرى"}</text>}
          </g>
        ))}
        {[...boxes.values()].flatMap(({ n, x, y, w: bw, keyW }) => n.rows.map((r, i) => (r.ref === null || !boxes.has(r.ref) ? null
          : <Link key={n.id + ":" + i} className="learning-ds-link" sx={x + keyW + 13} sy={y + HEAD + i * ROW + ROW / 2} right={x + bw} to={into(r.ref)} />)))}
        {graph.hidden > 0 && <text className="learning-ds-muted" x={PAD} y={h - 8}>{"و" + graph.hidden + " كائنات أخرى لا تتسع لها الصورة"}</text>}
      </svg>
    </div>
    </div>
  );
}
