import type { LearningVisualProps } from "../../types";

/** AUTO-A2 units 1 and 4 (S1 30, S2 64–68) — L1 = {aⁿbⁿ | n ≥ 1} ⊆ L2 = {aⁿbᵐ | n,m ≥ 1} ⊆ L3 = {aⁿbᵐ | n,m ≥ 0}, as on the slides. Static. */
export default function LanguagesNested({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <ellipse className="eb-visual-zone" cx="190" cy="110" rx="170" ry="98" />
      <ellipse className="eb-visual-zone is-inner" cx="175" cy="100" rx="115" ry="66" />
      <ellipse className="eb-visual-zone is-core" cx="160" cy="92" rx="60" ry="34" />
      <g direction="ltr">
        <text className="eb-visual-zone-label" x="160" y="84" textAnchor="middle">L1</text>
        <text className="eb-visual-token" x="160" y="104" textAnchor="middle">ab, aabb</text>
        <text className="eb-visual-zone-label" x="250" y="72" textAnchor="middle">L2</text>
        <text className="eb-visual-token" x="245" y="140" textAnchor="middle">aab, abb</text>
        <text className="eb-visual-zone-label" x="320" y="120" textAnchor="middle">L3</text>
        <text className="eb-visual-token" x="190" y="190" textAnchor="middle">ε, aa, b, bbb</text>
      </g>
    </svg>
  );
}
