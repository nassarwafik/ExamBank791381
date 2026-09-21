import type { LearningVisualProps } from "../../types";

/**
 * «بروتوكول STP» (Book 791381, PDF 102) — three switches (SW1·SW2·SW3) wired with redundant links would form a LOOP;
 * STP prevents the loop by logically BLOCKING one redundant path, so traffic flows over the remaining active tree and
 * the endless circulation stops. Motion TEACHES it: a packet travels only the active tree (SW1↔SW2↔SW3) and never
 * crosses the blocked link, which is drawn broken with a clear «محظور» mark. Reduced motion ⇒ a still packet on the
 * active tree. (No root-election / BPDU detail — not on this page.)
 */
const SW1 = { x: 190, y: 42 };
const SW2 = { x: 66, y: 156 };
const SW3 = { x: 314, y: 156 };
export default function StpLoopBlocking({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const sw = (p: { x: number; y: number }, label: string) => (
    <g>
      <rect className="eb-visual-switch-box" x={p.x - 26} y={p.y - 15} width="52" height="30" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* active tree links */}
      <line className="eb-visual-link is-strong" x1={SW1.x} y1={SW1.y} x2={SW2.x} y2={SW2.y} />
      <line className="eb-visual-link is-strong" x1={SW2.x} y1={SW2.y} x2={SW3.x} y2={SW3.y} />
      {/* the redundant link STP BLOCKS */}
      <line data-blocked="1" className="eb-visual-divider" x1={SW3.x} y1={SW3.y} x2={SW1.x} y2={SW1.y} stroke="var(--eb-danger)" />
      {/* block mark on the redundant link midpoint */}
      <g data-blockmark="1" transform={`translate(${(SW1.x + SW3.x) / 2} ${(SW1.y + SW3.y) / 2})`}>
        <circle className="eb-visual-pin" r="11" />
        <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#fff" strokeWidth="2" fill="none" />
      </g>
      <text className="eb-visual-part-label" x={(SW1.x + SW3.x) / 2 + 20} y={(SW1.y + SW3.y) / 2 - 10}>منفذ محظور</text>
      {sw(SW1, "SW1")}
      {sw(SW2, "SW2")}
      {sw(SW3, "SW3")}
      {/* packet travels ONLY the active tree, never the blocked link */}
      {!reducedMotion ? (
        <g className="eb-visual-packet">
          <rect x="-6" y="-6" width="12" height="12" rx="3" />
          <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear"
            path={`M ${SW1.x} ${SW1.y} L ${SW2.x} ${SW2.y} L ${SW3.x} ${SW3.y}`} />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={(SW1.x + SW2.x) / 2 - 6} y={(SW1.y + SW2.y) / 2 - 6} width="12" height="12" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">STP يحظر مسارًا زائدًا فيمنع الحلقة ويبقي الشجرة الفعّالة</text>
    </svg>
  );
}
