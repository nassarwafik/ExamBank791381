import type { LearningVisualProps } from "../../types";

/**
 * «أهم البروتوكولات — الفكرة» (Book 791381, PDF 87) — this page introduces only the IDEA of a protocol: a set of
 * agreed rules (a shared language) that two devices both follow so they understand each other; every network service
 * has a protocol with a clear job. The specific protocol NAMES (HTTP, DNS, DHCP, …) are taught on later pages and are
 * deliberately NOT shown here. Motion: a message travels from Device A through the shared rulebook to Device B and is
 * understood. Below, the generic job categories the page mentions (نقل/تصفح/بريد/أمان). Reduced motion ⇒ still.
 */
const A = { x: 56, y: 60 };
const B = { x: 324, y: 60 };
const JOBS = ["نقل", "تصفّح", "بريد", "أمان"];
export default function ProtocolAgreement({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const device = (p: { x: number; y: number }, label: string) => (
    <g>
      <rect className="eb-visual-node" x={p.x - 30} y={p.y - 22} width="60" height="44" rx="8" />
      <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 178"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line className="eb-visual-link" x1={A.x + 30} y1={A.y} x2={B.x - 30} y2={B.y} />
      {/* the shared agreed-rules band in the middle (the protocol) */}
      <rect className="eb-visual-seg is-v4" x="130" y={A.y - 20} width="120" height="40" rx="9" />
      <text className="eb-visual-part-label" x="190" y={A.y - 4} textAnchor="middle">قواعد متّفق عليها</text>
      <text className="eb-visual-token" x="190" y={A.y + 12} textAnchor="middle">بروتوكول</text>
      {device(A, "جهاز A")}
      {device(B, "جهاز B")}
      <path id="pa-flow" className="eb-visual-route" d={`M ${A.x + 30} ${A.y} L ${B.x - 30} ${B.y}`} />
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-7" y="-6" width="14" height="12" rx="3" /><animateMotion dur="3s" repeatCount="indefinite"><mpath href="#pa-flow" /></animateMotion></g>
      ) : (
        <rect className="eb-visual-packet-static" x={A.x + 30} y={A.y - 6} width="14" height="12" rx="3" />
      )}
      <text className="eb-visual-part-label" x="190" y={A.y + 40} textAnchor="middle">يفهم الجهازان بعضهما لأنهما يتّبعان القواعد نفسها</text>
      {/* generic job categories the page mentions — NOT specific protocol names */}
      {JOBS.map((j, i) => {
        const w = 78, gap = 8, total = JOBS.length * w + (JOBS.length - 1) * gap, x = (380 - total) / 2 + i * (w + gap);
        return (
          <g key={j}>
            <rect className="eb-visual-node" x={x} y="128" width={w} height="28" rx="7" />
            <text className="eb-visual-part-label" x={x + w / 2} y="143" textAnchor="middle">{j}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="172" textAnchor="middle">لكل خدمة بروتوكول بمهمة واضحة · القواعد المتّفق عليها تُنجح الاتصال</text>
    </svg>
  );
}
