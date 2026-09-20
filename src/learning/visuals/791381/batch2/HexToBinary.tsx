import type { LearningVisualProps } from "../../types";

/**
 * «من السادس عشر إلى الثنائي» (Book 791381, PDF 20) — each Hex symbol becomes 4 binary digits (a nibble). Faithful
 * example A23F → 1010 0010 0011 1111, kept left-to-right in the same order. Motion: a soft highlight travels group
 * by group (hex → its nibble), conveying the one-to-four expansion. Reduced motion ⇒ groups shown solid.
 */
const GROUPS = [
  { hex: "A", bits: "1010" },
  { hex: "2", bits: "0010" },
  { hex: "3", bits: "0011" },
  { hex: "F", bits: "1111" },
];
const X0 = 20, GW = 84, GAP = 4;

export default function HexToBinary({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {GROUPS.map((g, i) => {
        const x = X0 + i * (GW + GAP);
        const anim = reducedMotion ? "" : " eb-visual-glow-anim";
        return (
          <g key={i}>
            {/* hex symbol */}
            <rect className="eb-visual-hex-cell" x={x + GW / 2 - 22} y="24" width="44" height="40" rx="7" />
            <text className="eb-visual-hex-label" x={x + GW / 2} y="44" textAnchor="middle" dominantBaseline="central">{g.hex}</text>
            {/* connector */}
            <path className="eb-visual-link" d={`M ${x + GW / 2} 66 L ${x + GW / 2} 96`} fill="none" />
            {/* nibble */}
            <g className={anim} style={anim ? { animationDelay: `${i * 0.5}s` } : undefined}>
              {g.bits.split("").map((b, j) => (
                <g key={j}>
                  <rect className={"eb-visual-bit" + (b === "1" ? " is-on" : "")} x={x + j * 20 + 2} y="100" width="18" height="34" rx="4" />
                  <text className={"eb-visual-bit-label" + (b === "1" ? " is-on" : "")} x={x + j * 20 + 11} y="117" textAnchor="middle" dominantBaseline="central">{b}</text>
                </g>
              ))}
            </g>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="162" textAnchor="middle">كل رمز Hex ← 4 بتات</text>
    </svg>
  );
}
