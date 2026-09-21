import type { LearningVisualProps } from "../../types";

/**
 * «Router on a Stick — VLAN 10 / 20» (Book 791381, PDF 154) — a NETWORK TOPOLOGY view of THIS page's exact config:
 * the Router connects to the Switch through the one physical interface g0/0 as a single TRUNK; g0/0 is split into
 * sub-interfaces — g0/0.10 is fully mapped to VLAN 10 (encapsulation dot1Q 10, gateway 192.168.10.254) and g0/0.20 is
 * only OPENED for VLAN 20 (the page ends before its dot1Q/IP are given) — and the Switch fans the two VLANs out to
 * their device groups. Static diagram (no motion). SPLIT from PDF 155 (VLAN 30/40): this component never shows
 * g0/0.30/.40, dot1Q 30/40, VLAN 30/40 or the 192.168.20/30/40 addresses.
 */
export default function SubinterfacesVlan1020({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 300"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Router on a Stick — g0/0 واحد (Trunk) → VLAN 10 / 20</text>

      {/* the router on top */}
      <g data-node="router">
        <rect className="eb-visual-router" x="150" y="30" width="80" height="30" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="190" y="45" textAnchor="middle" dominantBaseline="central" fontSize="11">الراوتر</text>
      </g>

      {/* the single physical g0/0 TRUNK link down to the switch */}
      <line className="eb-visual-link is-strong" x1="190" y1="60" x2="190" y2="196" stroke="var(--eb-primary)" strokeWidth="3" />
      <text className="eb-visual-part-label" x="196" y="76" textAnchor="start" fill="var(--eb-primary)">g0/0 · TRUNK</text>

      {/* g0/0 split into two sub-interfaces (the logical division carried on the one trunk) */}
      <g data-subif="g0/0.10">
        <rect className="eb-visual-seg is-v4" x="12" y="86" width="150" height="60" rx="8" />
        <text className="eb-visual-token" x="87" y="102" textAnchor="middle" fontSize="11">g0/0.10 → VLAN 10</text>
        <text className="eb-visual-meta" x="87" y="118" textAnchor="middle">encapsulation dot1Q 10</text>
        <text className="eb-visual-meta" x="87" y="132" textAnchor="middle">بوابة <tspan style={{ direction: "ltr", unicodeBidi: "embed" }}>192.168.10.254</tspan></text>
        <line className="eb-visual-link is-faint" x1="162" y1="116" x2="190" y2="128" />
      </g>
      <g data-subif="g0/0.20">
        <rect className="eb-visual-seg" x="218" y="86" width="150" height="60" rx="8" strokeDasharray="4 4" />
        <text className="eb-visual-token" x="293" y="104" textAnchor="middle" fontSize="11">g0/0.20 → VLAN 20</text>
        <text className="eb-visual-meta" x="293" y="122" textAnchor="middle">فُتحت الواجهة الفرعية</text>
        <text className="eb-visual-meta" x="293" y="136" textAnchor="middle">(تُكمَّل لاحقًا)</text>
        <line className="eb-visual-link is-faint" x1="218" y1="116" x2="190" y2="128" strokeDasharray="4 4" />
      </g>

      {/* the switch and the two VLAN device groups it serves */}
      <g data-node="switch">
        <rect className="eb-visual-switch-box" x="150" y="196" width="80" height="28" rx="6" />
        <text className="eb-visual-node-label" x="190" y="210" textAnchor="middle" dominantBaseline="central" fontSize="11">السويتش</text>
      </g>
      <line className="eb-visual-link" x1="176" y1="224" x2="96" y2="258" />
      <line className="eb-visual-link" x1="204" y1="224" x2="284" y2="258" />
      <g data-vlangroup="10">
        <rect className="eb-visual-zone" x="24" y="258" width="144" height="30" rx="6" stroke="var(--eb-primary)" />
        <text className="eb-visual-node-label" x="96" y="273" textAnchor="middle" dominantBaseline="central" fontSize="10">أجهزة VLAN 10</text>
      </g>
      <g data-vlangroup="20">
        <rect className="eb-visual-zone" x="212" y="258" width="144" height="30" rx="6" stroke="var(--eb-line-2)" strokeDasharray="4 4" />
        <text className="eb-visual-node-label" x="284" y="273" textAnchor="middle" dominantBaseline="central" fontSize="10">أجهزة VLAN 20</text>
      </g>
    </svg>
  );
}
