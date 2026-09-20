import type { LearningVisualProps } from "../../types";

/**
 * «إدارة الشبكة وصيانتها» (Book 791381, PDF 13) — the four ongoing management areas as a maintenance CYCLE:
 * التكوين والإدارة ← أمان الشبكة ← خدمات الشبكة ← الاختبار والصيانة. Four quadrant nodes on a ring; a gentle
 * highlight travels around the ring to convey "ongoing". Reduced motion ⇒ the traveling highlight is not rendered.
 */
const CX = 200, CY = 128, R = 82;
const AREAS = [
  { a: -90, label: "التكوين" },
  { a: 0, label: "الأمان" },
  { a: 90, label: "الخدمات" },
  { a: 180, label: "الصيانة" },
];
const pt = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
};

export default function NetworkManagementCycle({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg
      className={"eb-visual" + (className ? " " + className : "")}
      viewBox="0 0 400 256" role="img" aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
    >
      {/* the cycle ring */}
      <circle id="mc-ring" className="eb-visual-ring" cx={CX} cy={CY} r={R} fill="none" />
      <text className="eb-visual-hub-label eb-visual-center-label" x={CX} y={CY} textAnchor="middle" dominantBaseline="central">إدارة الشبكة</text>

      {/* four area nodes */}
      {AREAS.map((ar, i) => {
        const p = pt(ar.a, R);
        return (
          <g key={"a" + i}>
            <circle className="eb-visual-area" cx={p.x} cy={p.y} r="30" />
            <text className="eb-visual-area-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{ar.label}</text>
          </g>
        );
      })}

      {/* traveling highlight around the ring (motion) */}
      {!reducedMotion && (
        <circle className="eb-visual-dot" r="5">
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
            <mpath href="#mc-ring" />
          </animateMotion>
        </circle>
      )}
    </svg>
  );
}
