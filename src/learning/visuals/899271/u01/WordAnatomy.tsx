import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 1 (S1 14–17) — the word aab: its symbols from Σ = {a, b}, one per box, numbered, and |aab| = 3. Static. */
export default function WordAnatomy({ ariaLabel, className }: LearningVisualProps) {
  const SYMBOLS = ["a", "a", "b"];
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 190" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="24" textAnchor="middle" direction="ltr">Σ = {"{a, b}"}</text>
      <g direction="ltr">
        {SYMBOLS.map((s, i) => (
          <g key={i} data-node="symbol">
            <rect className="eb-visual-seg" x={115 + i * 50} y="58" width="44" height="44" rx="6" />
            <text className="eb-visual-token" x={137 + i * 50} y="80" textAnchor="middle" dominantBaseline="central" fontSize="20">{s}</text>
            <text className="eb-visual-meta" x={137 + i * 50} y="118" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
      </g>
      <path className="eb-visual-link" d="M 115 132 L 115 140 L 259 140 L 259 132" fill="none" />
      <text className="eb-visual-part-label" x="187" y="158" textAnchor="middle" direction="ltr">|aab| = 3</text>
      <text className="eb-visual-caption-svg" x="190" y="182" textAnchor="middle">‏الكلمة w = aab: ثلاثة رموز من الأبجدية</text>
    </svg>
  );
}
