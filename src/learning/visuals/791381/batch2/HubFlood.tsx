import type { LearningVisualProps } from "../../types";

/**
 * «جهاز Hub» (Book 791381, PDF 50) — a hub sends incoming data to EVERY port; only the intended device uses it, the
 * others ignore it. Motion: one frame arrives and is copied out to all three ports at once (flooding). Reduced
 * motion ⇒ static frames shown on every link (the flooding is legible without animation).
 */
const PORTS = [
  { x: 320, y: 40, use: false },
  { x: 320, y: 110, use: true },
  { x: 320, y: 180, use: false },
];
const HUB = { x: 80, y: 110 };

export default function HubFlood({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {PORTS.map((p, i) => (
        <path key={"l" + i} id={"hb-l" + i} className="eb-visual-link" fill="none" d={`M ${HUB.x + 30} ${HUB.y} L ${p.x - 46} ${p.y}`} />
      ))}
      <rect className="eb-visual-hub-box" x={HUB.x - 30} y={HUB.y - 26} width="60" height="52" rx="8" />
      <text className="eb-visual-node-label is-inverse" x={HUB.x} y={HUB.y} textAnchor="middle" dominantBaseline="central">Hub</text>
      {PORTS.map((p, i) => (
        <g key={"p" + i}>
          <rect className={"eb-visual-node" + (p.use ? " is-target" : " is-dim")} x={p.x - 46} y={p.y - 18} width="92" height="36" rx="7" />
          <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{p.use ? "يستعملها" : "يتجاهلها"}</text>
        </g>
      ))}
      {/* incoming frame + flooded copies to all ports */}
      {!reducedMotion ? PORTS.map((_, i) => (
        <g key={"pk" + i} className="eb-visual-packet is-flood"><rect x="-8" y="-7" width="16" height="14" rx="3" />
          <animateMotion dur="1.8s" repeatCount="indefinite"><mpath href={`#hb-l${i}`} /></animateMotion>
        </g>
      )) : PORTS.map((p, i) => (
        <rect key={"sk" + i} className="eb-visual-packet-static" x={(HUB.x + 30 + p.x - 46) / 2 - 8} y={(HUB.y + p.y) / 2 - 7} width="16" height="14" rx="3" />
      ))}
      <text className="eb-visual-caption-svg" x="190" y="210" textAnchor="middle">يصل إلى الجميع — والصحيح فقط يستعملها</text>
    </svg>
  );
}
