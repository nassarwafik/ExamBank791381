import type { LearningVisualProps } from "../../types";

/**
 * «Standard ACL — القرار على المصدر فقط» (Book 791381, PDF 224) — a Standard ACL bases its permit/deny decision on the
 * SOURCE IP ALONE (list numbers 1–99). The gate reads only «من أين جاءت الحزمة؟» — never the destination, the protocol
 * or the port (those belong to the Extended ACL, PDF 227). Motion TEACHES the single criterion: one packet leaves the
 * source, reaches the ACL, and the gate lights its one field before permitting. ONE-SHOT: the packet begins at a fixed
 * time and freezes at the gate, so it plays once. Reduced motion ⇒ the source → ACL → permit/deny gate shown still.
 * Book scope: the source-only decision and the 1–99 range only — NOT the access-list command line.
 */
export default function StandardAclSource({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const SRC = 60, GATE = 210;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Standard ACL — القرار على المصدر فقط</text>

      {/* the source */}
      <g data-node="source">
        <rect className="eb-visual-node is-target" x={SRC - 30} y="70" width="60" height="34" rx="6" />
        <text className="eb-visual-node-label" x={SRC} y="83" textAnchor="middle" dominantBaseline="central" fontSize="10">المصدر</text>
        <text className="eb-visual-token is-octet" x={SRC} y="97" textAnchor="middle" dominantBaseline="central" fontSize="9" direction="ltr">192.168.1.0</text>
      </g>

      {/* the ACL gate + its single criterion */}
      <line className="eb-visual-divider" x1={GATE} y1="40" x2={GATE} y2="150" stroke="var(--eb-primary)" />
      <g transform={`translate(${GATE} 87)`}>
        <rect className="eb-visual-router" x="-24" y="-18" width="48" height="36" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="0" y="-3" textAnchor="middle" dominantBaseline="central" fontSize="9">ACL</text>
        <text className="eb-visual-node-label is-inverse" x="0" y="9" textAnchor="middle" dominantBaseline="central" fontSize="8">1–99</text>
      </g>
      <g data-reads="source">
        <text className="eb-visual-part-label" x={GATE} y="168" textAnchor="middle">يفحص: IP المصدر فقط</text>
      </g>

      {/* the source → gate link and the moving packet (one-shot, freeze at the gate) */}
      <line className="eb-visual-link" x1={SRC + 30} y1="87" x2={GATE - 26} y2="87" />
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id="stdIn" begin="0.4s" dur="1.2s" fill="freeze" path={`M ${SRC + 30} 87 L ${GATE - 28} 87`} /></g>
      ) : <rect className="eb-visual-packet-static" x={GATE - 33} y="82" width="10" height="10" rx="2" />}

      {/* the two outcomes */}
      <g data-decision="permit">
        <line className="eb-visual-link" x1={GATE} y1="66" x2="352" y2="52" stroke="var(--eb-success)" />
        <text className="eb-visual-meta" x="326" y="44" textAnchor="middle" fill="var(--eb-success)">Permit ✓</text>
      </g>
      <g data-decision="deny">
        <line className="eb-visual-link" x1={GATE} y1="108" x2="352" y2="122" stroke="var(--eb-danger)" strokeDasharray="5 4" />
        <text className="eb-visual-meta" x="326" y="134" textAnchor="middle" fill="var(--eb-danger)">Deny ✕</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="198" textAnchor="middle">‏القائمة القياسية تسأل «من المصدر؟» فقط، ثم تسمح أو تمنع</text>
    </svg>
  );
}
