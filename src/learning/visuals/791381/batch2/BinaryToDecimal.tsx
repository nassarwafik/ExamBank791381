import type { LearningVisualProps } from "../../types";

/**
 * «تحويل من الثنائي للعشري» (Book 791381, PDF 16) — the "boxes" method: place each binary digit under its weight
 * (128…1) and add only the weights whose bit is 1. Faithful example 01111011 → 64+32+16+8+2+1 = 123. Motion: the
 * lit bits glow in reading order (left→right), conveying "add the on-boxes". Reduced motion ⇒ lit bits shown solid,
 * no glow. Digits/weights render LTR.
 */
const WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];
const BITS = [0, 1, 1, 1, 1, 0, 1, 1]; // 01111011 = 123
const X0 = 24, CW = 44, GAP = 2, Y = 62, H = 44;

export default function BinaryToDecimal({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  let order = 0;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 170"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {WEIGHTS.map((w, i) => {
        const x = X0 + i * (CW + GAP);
        const on = BITS[i] === 1;
        const glow = on && !reducedMotion ? " eb-visual-glow-anim" : "";
        const delay = on ? order++ * 0.35 : 0;
        return (
          <g key={i}>
            <text className="eb-visual-weight" x={x + CW / 2} y={Y - 8} textAnchor="middle">{w}</text>
            <rect className={"eb-visual-bit" + (on ? " is-on" : "") + glow} x={x} y={Y} width={CW} height={H} rx="6"
              style={glow ? { animationDelay: `${delay}s` } : undefined} />
            <text className={"eb-visual-bit-label" + (on ? " is-on" : "")} x={x + CW / 2} y={Y + H / 2} textAnchor="middle" dominantBaseline="central">{BITS[i]}</text>
          </g>
        );
      })}
      <text className="eb-visual-sum" x="190" y="140" textAnchor="middle" direction="ltr">64 + 32 + 16 + 8 + 2 + 1 = 123</text>
    </svg>
  );
}
