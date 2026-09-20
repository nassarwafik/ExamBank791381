import type { LearningVisualProps } from "../../types";

/**
 * «ما هي الشبكة؟» (Book 791381, PDF 8) — a network IS a set of connected devices that exchange data.
 *
 * A central switch links four everyday devices (حاسوب، هاتف، طابعة، لوحي). Subtle data pulses travel along the
 * links to show that connected devices share information. Purely presentational; RTL-safe (symmetric layout);
 * technical/label text is short Arabic. Reduced motion ⇒ the pulses are not rendered (still frame of nodes + links).
 */
const NODES = [
  { x: 90, y: 60, label: "حاسوب" },
  { x: 310, y: 60, label: "هاتف" },
  { x: 90, y: 200, label: "طابعة" },
  { x: 310, y: 200, label: "لوحي" },
];
const HUB = { x: 200, y: 130 };

export default function NetworkConnectedDevices({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg
      className={"eb-visual" + (className ? " " + className : "")}
      viewBox="0 0 400 260" role="img" aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
    >
      {/* links (drawn first, under the nodes) */}
      {NODES.map((n, i) => (
        <path key={"lk" + i} id={"cd-lk" + i} className="eb-visual-link"
          d={`M ${HUB.x} ${HUB.y} L ${n.x} ${n.y}`} fill="none" />
      ))}

      {/* central switch / hub */}
      <g>
        <circle className="eb-visual-hub eb-visual-pulse" cx={HUB.x} cy={HUB.y} r="34" />
        <circle className="eb-visual-hub-core" cx={HUB.x} cy={HUB.y} r="26" />
        <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y} textAnchor="middle" dominantBaseline="central">شبكة</text>
      </g>

      {/* devices */}
      {NODES.map((n, i) => (
        <g key={"nd" + i}>
          <rect className="eb-visual-node" x={n.x - 40} y={n.y - 22} width="80" height="44" rx="9" />
          <text className="eb-visual-node-label" x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central">{n.label}</text>
        </g>
      ))}

      {/* traveling data pulses (motion) — omitted entirely under reduced motion */}
      {!reducedMotion && NODES.map((_, i) => (
        <circle key={"dot" + i} className="eb-visual-dot" r="4">
          <animateMotion dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" rotate="auto">
            <mpath href={`#cd-lk${i}`} />
          </animateMotion>
        </circle>
      ))}
    </svg>
  );
}
