import type { LearningVisualProps } from "../../types";

/**
 * «Extended ACL — قرار على أربعة معايير» (Book 791381, PDF 227) — an Extended ACL (list numbers 100–199) can evaluate
 * FOUR fields together before it permits or denies: the SOURCE IP, the DESTINATION IP, the PROTOCOL (TCP / UDP / ICMP)
 * and the PORT (e.g. 80 / 443). Motion TEACHES the richer test: the four criteria light up in order, then the gate
 * decides. ONE-SHOT: the first field begins at a fixed time and each freezes, so the reveal plays once. Reduced motion
 * ⇒ the four criteria and the permit/deny gate shown still. Book scope: the four evaluated fields and the 100–199 range
 * only — NOT the raw access-list command line.
 */
const FIELDS: [string, string, string][] = [
  ["source", "المصدر", "Source IP"],
  ["destination", "الوجهة", "Destination IP"],
  ["protocol", "البروتوكول", "TCP · UDP · ICMP"],
  ["port", "المنفذ", "Port 80 · 443"],
];
export default function ExtendedAclDecision({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const X = 16, W = 210, ROW = 38, Y0 = 42, GATE = 306;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Extended ACL — أربعة معايير معًا · 100–199</text>

      {/* the four evaluated fields */}
      {FIELDS.map(([key, label, detail], i) => {
        const y = Y0 + i * ROW;
        return (
          <g key={key} data-field={key}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height={30} rx="5"
              opacity={reducedMotion ? 1 : 0}>
              {!reducedMotion && <animate id={`ext${i}`} attributeName="opacity" from="0" to="1" dur="0.4s"
                begin={i === 0 ? "0.3s" : `ext${i - 1}.end`} fill="freeze" />}
            </rect>
            <text className="eb-visual-node-label" x={X + W / 2} y={y + 12} textAnchor="middle" dominantBaseline="central" fontSize="11">{label}</text>
            <text className="eb-visual-meta" x={X + W / 2} y={y + 23} textAnchor="middle" dominantBaseline="central" direction="ltr">{detail}</text>
            {/* feeder line into the gate */}
            <line className="eb-visual-link is-faint" x1={X + W} y1={y + 15} x2={GATE - 22} y2="107" />
          </g>
        );
      })}

      {/* the gate + its two outcomes */}
      <g transform={`translate(${GATE} 107)`}>
        <rect className="eb-visual-router" x="-22" y="-20" width="44" height="40" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="9">ACL</text>
      </g>
      <g data-decision="permit">
        <line className="eb-visual-link" x1={GATE} y1="87" x2="368" y2="66" stroke="var(--eb-success)" />
        <text className="eb-visual-meta" x="352" y="56" textAnchor="middle" fill="var(--eb-success)">Permit ✓</text>
      </g>
      <g data-decision="deny">
        <line className="eb-visual-link" x1={GATE} y1="127" x2="368" y2="150" stroke="var(--eb-danger)" strokeDasharray="5 4" />
        <text className="eb-visual-meta" x="352" y="160" textAnchor="middle" fill="var(--eb-danger)">Deny ✕</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏الموسّعة تفحص المصدر والوجهة والبروتوكول والمنفذ معًا قبل القرار</text>
    </svg>
  );
}
