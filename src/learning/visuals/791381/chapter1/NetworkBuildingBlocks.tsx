import type { LearningVisualProps } from "../../types";

/**
 * «احتياجات بناء شبكة» (Book 791381, PDF 12) — three foundations build a working network: البنية التحتية،
 * عناوين IP، وبروتوكول الاتصال. Three pillars carry a «شبكة» bar on top (structure/assembly metaphor). Subtle
 * sequential highlight rises across the pillars. Reduced motion ⇒ no rising highlight (all pillars shown solid).
 * Technical tokens (IP, TCP/IP) render LTR inside their own tspans.
 */
const PILLARS = [
  { x: 60, line1: "بنية تحتية", token: null as string | null },
  { x: 170, line1: "عناوين", token: "IP" },
  { x: 280, line1: "بروتوكول", token: "TCP/IP" },
];
const PW = 60;

export default function NetworkBuildingBlocks({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg
      className={"eb-visual" + (className ? " " + className : "")}
      viewBox="0 0 400 250" role="img" aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
    >
      {/* the network bar the foundations carry */}
      <rect className="eb-visual-hub" x="40" y="34" width="320" height="46" rx="10" />
      <text className="eb-visual-hub-label" x="200" y="57" textAnchor="middle" dominantBaseline="central">شبكة تعمل</text>

      {/* three foundation pillars */}
      {PILLARS.map((p, i) => (
        <g key={"p" + i}>
          <rect className={"eb-visual-pillar" + (reducedMotion ? "" : " eb-visual-pillar-anim")}
            x={p.x} y="100" width={PW} height="110" rx="8" style={{ animationDelay: `${i * 0.6}s` }} />
          <text className="eb-visual-pillar-label" x={p.x + PW / 2} y="150" textAnchor="middle" dominantBaseline="central">{p.line1}</text>
          {p.token && (
            <text className="eb-visual-token" x={p.x + PW / 2} y="172" textAnchor="middle" dominantBaseline="central" direction="ltr">{p.token}</text>
          )}
        </g>
      ))}

      {/* ground line */}
      <line className="eb-visual-ground" x1="40" y1="214" x2="360" y2="214" />
    </svg>
  );
}
