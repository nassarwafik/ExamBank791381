import type { LearningVisualProps } from "../../types";

/**
 * AUTO-A2 unit 6 (S3 43–46) — the picture of the non-regularity proof: from q0 two different words wi = aⁱ and wj = aʲ reach the
 * SAME state q (finitely many states), then the same suffix w = bⁱ leads both to the accepting state — so aʲbⁱ is accepted too.
 * Static.
 */
export default function SameStatePaths({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g direction="ltr">
        <path className="eb-visual-link" d="M 14 100 L 40 100" /><path className="eb-visual-link" d="M 33 95 L 41 100 L 33 105" fill="none" />
        <circle className="eb-visual-node" cx="62" cy="100" r="20" />
        <text className="eb-visual-node-label" x="62" y="100" textAnchor="middle" dominantBaseline="central">q0</text>
        <path className="eb-visual-link is-strong" d="M 80 90 C 110 30, 160 60, 180 50 S 220 70, 232 88" fill="none" />
        <text className="eb-visual-part-label" x="150" y="40" textAnchor="middle">wi = aⁱ</text>
        <path className="eb-visual-link" d="M 80 110 C 110 170, 160 140, 180 150 S 220 130, 232 112" fill="none" strokeDasharray="6 4" />
        <text className="eb-visual-part-label" x="150" y="172" textAnchor="middle">wj = aʲ</text>
        <circle className="eb-visual-node is-target" cx="252" cy="100" r="20" />
        <text className="eb-visual-node-label" x="252" y="100" textAnchor="middle" dominantBaseline="central">q</text>
        <path className="eb-visual-link is-strong" d="M 272 100 L 318 100" /><path className="eb-visual-link is-strong" d="M 310 95 L 318 100 L 310 105" fill="none" />
        <text className="eb-visual-part-label" x="295" y="90" textAnchor="middle">w = bⁱ</text>
        <circle className="eb-visual-node" cx="342" cy="100" r="20" />
        <circle className="eb-visual-node" cx="342" cy="100" r="15" fill="none" />
      </g>
      <text className="eb-visual-caption-svg" x="190" y="194" textAnchor="middle">‏i ≠ j لكن الحالة نفسها q: إن قُبلت aⁱbⁱ فستُقبل aʲbⁱ أيضًا</text>
    </svg>
  );
}
