import type { LearningVisualProps } from "../../types";

/**
 * «مثال OSPF» (Book 791381, PDF 215) — the page gives the example network as a table; a diagram makes it a real
 * topology: R1 and R2 are joined by the inter-router link 10.0.0.0/30, R1 has the LAN 192.168.1.0/24 behind it, R2 has
 * 192.168.2.0/24 behind it, and both run OSPF in area 0. Static diagram (no motion): the two routers, their link and
 * their LANs, complete as a still frame. Book scope: the topology addresses and area 0 as CONCEPTS — NOT the exact
 * `network … area 0` configuration line (PDF 217) or `router ospf 1` (PDF 216); wildcard masks are shown only as a
 * small legend.
 */
const R = [
  { id: "R1", x: 96, lan: "192.168.1.0/24" },
  { id: "R2", x: 284, lan: "192.168.2.0/24" },
];
export default function OspfTopology({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏مثال OSPF — area 0</text>

      {/* the two routers and the inter-router link */}
      <line className="eb-visual-link is-strong" x1={R[0].x + 30} y1="64" x2={R[1].x - 30} y2="64" />
      <text className="eb-visual-token" x="190" y="54" textAnchor="middle" fontSize="10">10.0.0.0/30</text>
      {R.map(r => (
        <g key={r.id} data-router={r.id}>
          <g transform={`translate(${r.x} 64)`}>
            <rect className="eb-visual-router" x="-30" y="-15" width="60" height="30" rx="7" />
            <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central">{r.id}</text>
          </g>
          {/* the LAN behind each router */}
          <line className="eb-visual-link" x1={r.x} y1="79" x2={r.x} y2="118" />
          <rect className="eb-visual-zone" x={r.x - 62} y="118" width="124" height="40" rx="10" />
          <text className="eb-visual-zone-label" x={r.x} y="134" textAnchor="middle">LAN</text>
          <text className="eb-visual-token" x={r.x} y="150" textAnchor="middle" fontSize="10">{r.lan}</text>
        </g>
      ))}
      <text className="eb-visual-meta" x="190" y="180" textAnchor="middle">قناع البدل: /24 = 0.0.0.255 · /30 = 0.0.0.3</text>
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏R1 و R2 يتبادلان مساراتهما بـ OSPF في area 0 عبر رابط 10.0.0.0/30</text>
    </svg>
  );
}
