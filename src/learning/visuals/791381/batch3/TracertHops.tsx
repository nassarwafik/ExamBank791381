import type { LearningVisualProps } from "../../types";

/**
 * «أمر tracert» (Book 791381, PDF 95) — tracert reveals the PATH to a destination hop by hop: it lists each router
 * (hop) the packet passes through on the way. Motion TEACHES it: a packet advances one hop at a time — device → hop1
 * → hop2 → hop3 → destination — instead of jumping straight there. Reduced motion ⇒ a still packet at the first hop.
 */
const NODES = [
  { x: 40, label: "جهازك", hub: false },
  { x: 122, label: "1", hub: true },
  { x: 200, label: "2", hub: true },
  { x: 278, label: "3", hub: true },
  { x: 350, label: "الوجهة", hub: false },
];
const Y = 78;
export default function TracertHops({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const start = NODES[0].x, end = NODES[NODES.length - 1].x;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 150"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="26" textAnchor="middle" direction="ltr">tracert</text>
      {/* links between consecutive hops */}
      {NODES.slice(0, -1).map((n, i) => <line key={i} className="eb-visual-link is-strong" x1={n.x} y1={Y} x2={NODES[i + 1].x} y2={Y} />)}
      {NODES.map((n, i) => (
        <g key={i}>
          {n.hub
            ? <><circle className="eb-visual-hub" cx={n.x} cy={Y} r="14" /><text className="eb-visual-hub-label" x={n.x} y={Y} textAnchor="middle" dominantBaseline="central">{n.label}</text><text className="eb-visual-part-label" x={n.x} y={Y + 28} textAnchor="middle">قفزة</text></>
            : <><rect className="eb-visual-node" x={n.x - 28} y={Y - 16} width="56" height="32" rx="7" /><text className="eb-visual-node-label" x={n.x} y={Y} textAnchor="middle" dominantBaseline="central">{n.label}</text></>}
        </g>
      ))}
      {/* packet advances hop by hop across the whole path */}
      {!reducedMotion ? (
        <g className="eb-visual-packet">
          <rect x="-6" y="-6" width="12" height="12" rx="3" />
          <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;0.25;0.5;0.75;1" keyTimes="0;0.25;0.5;0.75;1" calcMode="discrete"
            path={`M ${start} ${Y - 24} L ${end} ${Y - 24}`} />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={NODES[1].x - 6} y={Y - 30} width="12" height="12" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="142" textAnchor="middle">يعرض الطريق قفزة بعد قفزة حتى الوجهة</text>
    </svg>
  );
}
