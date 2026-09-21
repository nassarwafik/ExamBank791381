import type { LearningVisualProps } from "../../types";

/**
 * «الشبكة المباشرة P2P» (Book 791381, PDF 58) — the ONLY concept this page teaches: two devices communicate DIRECTLY,
 * node-to-node, with NO intermediate device between them. (Bus/Ring appear later on PDF 59, and Star/Tree/Hybrid on
 * PDF 60 — none of them belong to this page.) Motion: one packet travels straight from device A to device B and back
 * along the single direct link. Reduced motion ⇒ a still packet resting on the link. Names render LTR.
 */
const A = { x: 78, y: 92 };
const B = { x: 302, y: 92 };
const LINK_D = `M ${A.x + 30} ${A.y} L ${B.x - 30} ${B.y}`;
export default function P2pDirect({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const device = (p: { x: number; y: number }, label: string) => (
    <g>
      <rect className="eb-visual-node" x={p.x - 30} y={p.y - 22} width="60" height="44" rx="8" />
      <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="30" textAnchor="middle" direction="ltr">P2P</text>
      {/* the single DIRECT link */}
      <line className="eb-visual-link is-strong" x1={A.x + 30} y1={A.y} x2={B.x - 30} y2={B.y} />
      <path id="p2p-link" className="eb-visual-route" d={LINK_D} />
      {device(A, "جهاز A")}
      {device(B, "جهاز B")}
      {/* the packet travels straight between the two devices — nothing sits in the middle */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-7" y="-6" width="14" height="12" rx="3" />
          <animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear"><mpath href="#p2p-link" /></animateMotion>
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={(A.x + B.x) / 2 - 7} y={A.y - 6} width="14" height="12" rx="3" />
      )}
      <text className="eb-visual-part-label" x="190" y={A.y + 44} textAnchor="middle">اتصال مباشر — لا يوجد جهاز وسيط بينهما</text>
      <text className="eb-visual-caption-svg" x="190" y="168" textAnchor="middle">‏P2P: تواصل مباشر بين جهازين (نقطة إلى نقطة)</text>
    </svg>
  );
}
