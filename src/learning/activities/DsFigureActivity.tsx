import { useMemo } from "react";
import type { LearningActivityProps } from "./engine";
import { layoutBst, readDsFigure, treeHeight, treeLeaves, treeSize, type DsPanel } from "./ds";
import { ChainDrawing, QueueDrawing, StackDrawing, TreeDrawing } from "./DsDraw";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — `interactive-diagram / ds-figure / v1`: a drawing of the course's
 * structures written as DATA (one to four panels: a stack, a queue, a chain with the names pointing at its cells, a binary tree
 * with its levels), so every figure of the course is drawn by the same code as the trace and the lab. A tree panel may list its
 * facts (root, leaves, height, number of cells). Static: no state, no timers, nothing executed.
 */
function Panel({ p }: { p: DsPanel }) {
  if (p.kind === "stack" || p.kind === "queue") return p.kind === "stack" ? <StackDrawing items={p.items} /> : <QueueDrawing items={p.items} />;
  if (p.kind === "chain") return <ChainDrawing cells={p.items.map((v, i) => ({ key: i, v, hi: p.hi.includes(i), labels: p.pointers.filter(q => q[1] === i).map(q => ({ name: q[0] })) }))} />;
  const laid = layoutBst(p.tree);
  return (
    <>
      <TreeDrawing levels cells={laid.map(n => ({ key: n.node.key, v: n.node.v, x: n.x, depth: n.depth, parent: n.parent, hi: p.hi.includes(n.node.key), labels: p.pointers.filter(q => q[1] === n.node.key).map(q => ({ name: q[0] })) }))} />
      {p.facts && p.tree && (
        <ul className="learning-ds-facts">
          <li>الجذر: <span dir="ltr">{p.tree.v}</span></li>
          <li>الأوراق: <span dir="ltr">{treeLeaves(p.tree).map(n => n.v).join(" ، ")}</span></li>
          <li>الارتفاع: <span dir="ltr">{treeHeight(p.tree)}</span></li>
          <li>عدد الخلايا: <span dir="ltr">{treeSize(p.tree)}</span></li>
        </ul>
      )}
    </>
  );
}

export default function DsFigureActivity({ block }: LearningActivityProps) {
  const cfg = useMemo(() => readDsFigure(block.config), [block.config]);
  if (!cfg) return <p className="learning-trace-empty" role="note">هذا الرسم غير متوفر حاليًا.</p>;
  return (
    <div className="learning-ds learning-ds-figure">
      {cfg.panels.map((p, i) => (
        <figure key={i} className="learning-ds-panel">
          <Panel p={p} />
          {p.label && <figcaption className="learning-ds-caption">{p.label}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
