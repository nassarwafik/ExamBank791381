import type { LearningVisualProps } from "../../types";

/**
 * «مصطلحات مهمة في VLAN» (Book 791381, PDF 126) — the three terms exactly as the page gives them: a VLAN ID numbers a
 * VLAN (range 1–4094; VLAN 1 is the default, not preferred for security); an ACCESS port belongs to ONE VLAN and
 * serves a normal end device; a TRUNK link carries MORE THAN ONE VLAN over a single cable between switches. Motion
 * TEACHES the distinction: each access link carries a single VLAN colour, while the trunk carries both VLAN colours
 * together. Reduced motion ⇒ the labelled map shown statically. No Dot1Q tagging mechanics (not on this page yet).
 */
const SW1 = { x: 108, y: 74 };
const SW2 = { x: 272, y: 74 };
const D1 = { x: 108, y: 168 };
const D2 = { x: 272, y: 168 };
export default function VlanAccessTrunkTerms({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const sw = (p: { x: number; y: number }, label: string) => (
    <g><rect className="eb-visual-switch-box" x={p.x - 26} y={p.y - 15} width="52" height="30" rx="6" /><text className="eb-visual-node-label is-inverse" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text></g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Access مقابل Trunk</text>
      {/* trunk between the two switches — carries more than one VLAN */}
      <line data-trunk="1" className="eb-visual-link is-strong" x1={SW1.x + 26} y1={SW1.y} x2={SW2.x - 26} y2={SW2.y} strokeWidth="4" />
      <text className="eb-visual-part-label" x="190" y={SW1.y - 20} textAnchor="middle">Trunk — عدة VLAN عبر كابل واحد</text>
      {sw(SW1, "SW1")}
      {sw(SW2, "SW2")}
      {/* access links — each one VLAN only */}
      <line data-access="10" className="eb-visual-link is-strong" x1={SW1.x} y1={SW1.y + 15} x2={D1.x} y2={D1.y - 13} stroke="var(--eb-primary)" />
      <line data-access="20" className="eb-visual-link is-strong" x1={SW2.x} y1={SW2.y + 15} x2={D2.x} y2={D2.y - 13} stroke="var(--eb-success)" />
      <rect className="eb-visual-node is-target" x={D1.x - 22} y={D1.y - 13} width="44" height="26" rx="5" /><text className="eb-visual-node-label" x={D1.x} y={D1.y} textAnchor="middle" dominantBaseline="central" fontSize="11">VLAN 10</text>
      <rect className="eb-visual-node" x={D2.x - 22} y={D2.y - 13} width="44" height="26" rx="5" /><text className="eb-visual-node-label" x={D2.x} y={D2.y} textAnchor="middle" dominantBaseline="central" fontSize="11">VLAN 20</text>
      <text className="eb-visual-part-label" x={D1.x - 34} y={D1.y + 28} textAnchor="middle">Access — VLAN واحدة</text>
      <text className="eb-visual-part-label" x={D2.x + 34} y={D2.y + 28} textAnchor="middle">Access — VLAN واحدة</text>
      {/* motion: single VLAN on each access, both VLANs together on the trunk */}
      {!reducedMotion ? (
        <>
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${D1.x} ${D1.y - 13} L ${SW1.x} ${SW1.y}`} /></g>
          <g className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${D2.x} ${D2.y - 13} L ${SW2.x} ${SW2.y}`} /></g>
          <g data-trunkpkt="1" className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="1.8s" repeatCount="indefinite" path={`M ${SW1.x + 26} ${SW1.y} L ${SW2.x - 26} ${SW2.y}`} /></g>
          <g data-trunkpkt="1" className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="1.8s" begin="0.3s" repeatCount="indefinite" path={`M ${SW2.x - 26} ${SW2.y} L ${SW1.x + 26} ${SW1.y}`} /></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x={(D1.x + SW1.x) / 2 - 5} y={(D1.y + SW1.y) / 2 - 5} width="10" height="10" rx="2" />
          <rect data-trunkpkt="1" className="eb-visual-packet-static" x="176" y={SW1.y - 5} width="10" height="10" rx="2" />
          <circle data-trunkpkt="1" className="eb-visual-dot is-response" cx="204" cy={SW1.y} r="5" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏Access = جهاز في VLAN واحدة · Trunk = عدة VLAN بين السويتشات</text>
    </svg>
  );
}
