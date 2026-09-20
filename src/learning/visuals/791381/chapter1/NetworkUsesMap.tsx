import type { LearningVisualProps } from "../../types";

/**
 * «استخدامات الشبكة» (Book 791381, PDF 9) — a concept map: the four uses radiate from one network hub
 * (مشاركة الملفات، الإنترنت، التواصل، التعاون). Helps the student see the network as ONE center enabling many uses.
 * Reduced motion ⇒ no staggered pulse (the spokes render fully, statically).
 */
const USES = [
  { x: 90, y: 55, label: "ملفات" },
  { x: 310, y: 55, label: "إنترنت" },
  { x: 90, y: 205, label: "تواصل" },
  { x: 310, y: 205, label: "تعاون" },
];
const HUB = { x: 200, y: 130 };

export default function NetworkUsesMap({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg
      className={"eb-visual" + (className ? " " + className : "")}
      viewBox="0 0 400 260" role="img" aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
    >
      {USES.map((u, i) => (
        <line key={"sp" + i} className="eb-visual-link" x1={HUB.x} y1={HUB.y} x2={u.x} y2={u.y} />
      ))}

      {/* uses (leaf nodes) */}
      {USES.map((u, i) => (
        <g key={"u" + i}>
          <circle className={"eb-visual-leaf" + (reducedMotion ? "" : " eb-visual-leaf-anim")} cx={u.x} cy={u.y} r="30"
            style={{ animationDelay: `${i * 0.4}s` }} />
          <text className="eb-visual-leaf-label" x={u.x} y={u.y} textAnchor="middle" dominantBaseline="central">{u.label}</text>
        </g>
      ))}

      {/* central network hub */}
      <circle className="eb-visual-hub" cx={HUB.x} cy={HUB.y} r="40" />
      <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y} textAnchor="middle" dominantBaseline="central">شبكة</text>
    </svg>
  );
}
