import type { LearningVisualProps } from "../../types";

/**
 * «ACL — Access Control List» (Book 791381, PDF 223) — an ACL on a router interface is a gate: a Permit packet passes
 * through, a Deny packet is stopped at the router. The page also gives the placement rule: a Standard ACL (which
 * filters by source IP only) goes near the destination, while an Extended ACL (source + destination + protocol +
 * port) goes near the source. Motion TEACHES the gate: a permitted packet crosses the interface and freezes past it,
 * a denied packet halts at the interface. ONE-SHOT: each packet begins at a fixed time (not from the other's end) and
 * freezes, so it plays once. Reduced motion ⇒ the gate with a passed packet and a stopped packet shown statically.
 * Book scope: the permit/deny gate and the Standard/Extended placement idea only — NOT the specific access-list
 * command lines (PDF 224–227).
 */
export default function AclGate({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const GATE = 214;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏ACL = بوابة Permit / Deny على الراوتر</text>

      {/* the router interface = the gate */}
      <line className="eb-visual-divider" x1={GATE} y1="36" x2={GATE} y2="140" stroke="var(--eb-primary)" />
      <g transform={`translate(${GATE} 88)`}>
        <rect className="eb-visual-router" x="-20" y="-16" width="40" height="32" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="9">ACL</text>
      </g>

      {/* Permit lane — packet passes through, freezes past the gate */}
      <g data-decision="permit">
        <text className="eb-visual-meta" x="30" y="52" fill="var(--eb-success)">Permit ✓</text>
        <line className="eb-visual-link" x1="30" y1="62" x2="356" y2="62" stroke="var(--eb-success)" />
        {!reducedMotion ? (
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
            <animateMotion id="aclPermit" begin="0.4s" dur="1.4s" fill="freeze" path="M 30 62 L 356 62" /></g>
        ) : <rect className="eb-visual-packet-static" x="330" y="57" width="10" height="10" rx="2" />}
      </g>

      {/* Deny lane — packet stops at the gate */}
      <g data-decision="deny">
        <text className="eb-visual-meta" x="30" y="118" fill="var(--eb-danger)">Deny ✕</text>
        <line className="eb-visual-link" x1="30" y1="128" x2={GATE} y2="128" stroke="var(--eb-danger)" strokeDasharray="5 4" />
        {!reducedMotion ? (
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" fill="var(--eb-danger)" />
            <animateMotion id="aclDeny" begin="0.4s" dur="1.0s" fill="freeze" path={`M 30 128 L ${GATE - 22} 128`} /></g>
        ) : <rect className="eb-visual-packet-static" x={GATE - 27} y="123" width="10" height="10" rx="2" fill="var(--eb-danger)" />}
      </g>

      {/* placement rule */}
      <text className="eb-visual-part-label" x="190" y="162" textAnchor="middle">‏Standard قرب الوجهة (المصدر فقط) · Extended قرب المصدر (المصدر + الوجهة + المنفذ)</text>
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">‏الراوتر يسمح أو يمنع الحزمة عند الواجهة حسب قاعدة ACL</text>
    </svg>
  );
}
