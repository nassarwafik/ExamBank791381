import type { LearningVisualProps } from "../../types";

/**
 * «جهاز Switch» (Book 791381, PDF 52) — a switch remembers MAC addresses and sends the frame to the intended device
 * ONLY; the others receive nothing. Faithful to the page's example (frame for PC3 goes out only PC3's port). Motion:
 * a single frame travels to the one destination port. Reduced motion ⇒ one static frame on the destination link.
 */
const PORTS = [
  { x: 320, y: 40, name: "PC2", dest: false },
  { x: 320, y: 110, name: "PC3", dest: true },
  { x: 320, y: 180, name: "PC4", dest: false },
];
const SW = { x: 80, y: 110 };

export default function SwitchUnicast({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {PORTS.map((p, i) => (
        <path key={"l" + i} id={"sw-l" + i} className={"eb-visual-link" + (p.dest ? " is-strong" : " is-faint")} fill="none" d={`M ${SW.x + 30} ${SW.y} L ${p.x - 42} ${p.y}`} />
      ))}
      <rect className="eb-visual-switch-box" x={SW.x - 34} y={SW.y - 26} width="68" height="52" rx="8" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central">Switch</text>
      {PORTS.map((p, i) => (
        <g key={"p" + i}>
          <rect className={"eb-visual-node" + (p.dest ? " is-target" : " is-dim")} x={p.x - 42} y={p.y - 18} width="84" height="36" rx="7" />
          <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{p.name}</text>
        </g>
      ))}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-8" y="-7" width="16" height="14" rx="3" />
          <animateMotion dur="2s" repeatCount="indefinite" keyTimes="0;0.75;1" keyPoints="0;1;1" calcMode="linear"><mpath href="#sw-l1" /></animateMotion>
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={(SW.x + 30 + PORTS[1].x - 42) / 2 - 8} y={SW.y - 7} width="16" height="14" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="210" textAnchor="middle">إلى الجهاز المقصود فقط (حسب عنوان MAC)</text>
    </svg>
  );
}
