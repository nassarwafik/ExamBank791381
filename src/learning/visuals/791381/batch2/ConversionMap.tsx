import type { LearningVisualProps } from "../../types";

/**
 * «خلاصة التحويلات» (Book 791381, PDF 23) — the three number systems and the conversions between them, as one map:
 * عشري (decimal) · ثنائي (binary) · Hex, with directional links. Motion: a highlight travels around the triangle to
 * convey "you can move between all three". Reduced motion ⇒ the ring is drawn, no traveling highlight.
 */
const NODES = [
  { x: 190, y: 44, label: "عشري", token: "" },
  { x: 66, y: 150, label: "ثنائي", token: "" },
  { x: 314, y: 150, label: "Hex", token: "" },
];

export default function ConversionMap({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* triangle ring */}
      <path id="conv-ring" className="eb-visual-ring" fill="none"
        d="M 190 74 L 96 140 M 96 160 L 284 160 M 284 140 L 214 78" />
      {/* the closed path used for the traveling dot */}
      <path id="conv-loop" d="M 190 60 L 78 150 L 302 150 Z" className="eb-visual-tri" fill="none" />
      {NODES.map((n, i) => (
        <g key={i}>
          <circle className="eb-visual-hub" cx={n.x} cy={n.y} r="34" />
          <text className="eb-visual-hub-label" x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central">{n.label}</text>
        </g>
      ))}
      {/* traveling highlight around the loop */}
      {!reducedMotion && (
        <circle className="eb-visual-dot" r="5">
          <animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href="#conv-loop" /></animateMotion>
        </circle>
      )}
      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">تحويلات متبادلة بين الأنظمة الثلاثة</text>
    </svg>
  );
}
