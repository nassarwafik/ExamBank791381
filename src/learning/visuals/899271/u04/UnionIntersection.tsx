import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 4 (S2 59) — union and intersection of L1 and L2: the whole of both circles, and only their common part. Static. */
export default function UnionIntersection({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g>
        <circle className="eb-visual-zone is-core" cx="70" cy="95" r="45" />
        <circle className="eb-visual-zone is-core" cx="120" cy="95" r="45" />
        <text className="eb-visual-zone-label" x="55" y="99" textAnchor="middle" direction="ltr">L1</text>
        <text className="eb-visual-zone-label" x="137" y="99" textAnchor="middle" direction="ltr">L2</text>
        <text className="eb-visual-row-label" x="95" y="168" textAnchor="middle" direction="ltr">L1 ∪ L2</text>
        <text className="eb-visual-meta" x="95" y="186" textAnchor="middle">في إحداهما على الأقل</text>
      </g>
      <g>
        <circle className="eb-visual-zone" cx="260" cy="95" r="45" />
        <circle className="eb-visual-zone" cx="310" cy="95" r="45" />
        <path className="eb-visual-zone is-core" d="M 285 57.5 A 45 45 0 0 1 285 132.5 A 45 45 0 0 1 285 57.5 Z" />
        <text className="eb-visual-zone-label" x="245" y="99" textAnchor="middle" direction="ltr">L1</text>
        <text className="eb-visual-zone-label" x="327" y="99" textAnchor="middle" direction="ltr">L2</text>
        <text className="eb-visual-row-label" x="285" y="168" textAnchor="middle" direction="ltr">L1 ∩ L2</text>
        <text className="eb-visual-meta" x="285" y="186" textAnchor="middle">في الاثنتين معًا</text>
      </g>
    </svg>
  );
}
