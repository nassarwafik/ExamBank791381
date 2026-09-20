import type { LearningVisualProps } from "../../types";

/**
 * «أجهزة في نفس الشبكة» (Book 791381, PDF 43) — devices are in the same network when the NETWORK part stays the same
 * and only the host part differs. Faithful set: 192.168.1.1 / .2 / .10 / .20 on /24 share the prefix 192.168.1.
 * Motion: the shared prefix pulses across all devices, then a link highlights that they can talk directly. Reduced
 * motion ⇒ shared prefix highlighted statically, no traveling link.
 */
const HOSTS = [
  { x: 70, y: 46, host: "1", name: "PC1" },
  { x: 300, y: 46, host: "2", name: "PC2" },
  { x: 70, y: 168, host: "10", name: "Printer" },
  { x: 300, y: 168, host: "20", name: "Phone" },
];
const HUB = { x: 190, y: 107 };

export default function SameNetwork({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {HOSTS.map((h, i) => (
        <path key={"l" + i} id={"sn-l" + i} className="eb-visual-link" fill="none" d={`M ${HUB.x} ${HUB.y} L ${h.x} ${h.y}`} />
      ))}
      <circle className={"eb-visual-hub" + (reducedMotion ? "" : " eb-visual-glow-anim")} cx={HUB.x} cy={HUB.y} r="30" />
      <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y - 4} textAnchor="middle" dominantBaseline="central">شبكة</text>
      <text className="eb-visual-token is-inverse" x={HUB.x} y={HUB.y + 11} textAnchor="middle" dominantBaseline="central" direction="ltr">/24</text>
      {HOSTS.map((h, i) => (
        <g key={"h" + i}>
          <rect className="eb-visual-node" x={h.x - 58} y={h.y - 20} width="116" height="40" rx="8" />
          <text className="eb-visual-token" x={h.x} y={h.y} textAnchor="middle" dominantBaseline="central" direction="ltr">
            <tspan className="eb-visual-prefix">192.168.1.</tspan><tspan className="eb-visual-hostpart">{h.host}</tspan>
          </text>
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">نفس جزء الشبكة (‏192.168.1) — يختلف جزء الجهاز فقط</text>
    </svg>
  );
}
