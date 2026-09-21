import type { LearningVisualProps } from "../../types";

/**
 * «قناع البدل Wildcard — قلب القناع» (Book 791381, PDF 243) — the book's exact conversion 255.255.255.0 → 0.0.0.255,
 * shown octet by octet with the rule «255 − الخانة». Motion TEACHES the causal inversion: each wildcard octet appears
 * only after the one before it, so 255→0, 255→0, 255→0, 0→255 unfolds left to right. ONE-SHOT: the first octet begins
 * at a fixed time and each freezes, so it plays once. Reduced motion ⇒ both rows shown still. Book scope: this exact
 * mask / wildcard pair and the 255 − rule only.
 */
const MASK = ["255", "255", "255", "0"];
const WILD = ["0", "0", "0", "255"];
export default function WildcardInversion({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const X0 = 40, CW = 68, GAP = 6, MY = 62, WY = 138;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="24" textAnchor="middle">‏255.255.255.0  ⟵ القناع · القاعدة: 255 − الخانة</text>

      {/* subnet-mask row */}
      <text className="eb-visual-part-label" x="26" y={MY + 20} textAnchor="middle" dominantBaseline="central">Mask</text>
      {MASK.map((v, i) => {
        const x = X0 + i * (CW + GAP);
        return (
          <g key={"m" + i} data-mask={v}>
            <rect className="eb-visual-octet is-network" x={x} y={MY} width={CW} height={38} rx="6" />
            <text className="eb-visual-token is-octet" x={x + CW / 2} y={MY + 19} textAnchor="middle" dominantBaseline="central" direction="ltr">{v}</text>
            {/* the causal arrow down to the wildcard octet */}
            <line className="eb-visual-link is-faint" x1={x + CW / 2} y1={MY + 42} x2={x + CW / 2} y2={WY - 4} />
          </g>
        );
      })}

      {/* wildcard row — each octet revealed after the previous (one-shot, freeze) */}
      <text className="eb-visual-part-label" x="26" y={WY + 20} textAnchor="middle" dominantBaseline="central">Wildcard</text>
      {WILD.map((v, i) => {
        const x = X0 + i * (CW + GAP);
        return (
          <g key={"w" + i} data-wildcard={v} opacity={reducedMotion ? 1 : 0}>
            {!reducedMotion && <animate id={`wc${i}`} attributeName="opacity" from="0" to="1" dur="0.4s"
              begin={i === 0 ? "0.4s" : `wc${i - 1}.end`} fill="freeze" />}
            <rect className="eb-visual-octet is-host" x={x} y={WY} width={CW} height={38} rx="6" />
            <text className="eb-visual-token is-octet" x={x + CW / 2} y={WY + 19} textAnchor="middle" dominantBaseline="central" direction="ltr">{v}</text>
            <text className="eb-visual-mask-cell" x={x + CW / 2} y={WY - 8} textAnchor="middle" direction="ltr">255−{MASK[i]}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏كل خانة في القناع = 255 − الخانة المقابلة في Wildcard</text>
    </svg>
  );
}
