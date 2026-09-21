import type { LearningVisualProps } from "../../types";

/**
 * «جدول مثال VLAN» / «توزيع الأجهزة على VLAN» (Book 791381, PDF 128–129) — the page's OWN example, values verbatim:
 *   Pc1-ADMIN, Pc2-ADMIN → VLAN 10 (الإدارة), 192.168.10.1 / .2, /24
 *   Pc1-GAZ,  Pc2-GAZ   → VLAN 20 (المحاسبة), 192.168.20.1 / .2, /24
 * The switch tells devices apart by the PORT they connect to (not by name). Motion TEACHES "which device belongs to
 * which VLAN": each device is associated with its VLAN in turn, a marker running device→switch. Reduced motion ⇒ the
 * full grouping shown statically. No invented devices, ports or addresses.
 */
const SW = { x: 190, y: 120 };
const DEVS = [
  { name: "Pc1-ADMIN", ip: "192.168.10.1", vlan: 10, x: 74, y: 62 },
  { name: "Pc2-ADMIN", ip: "192.168.10.2", vlan: 10, x: 74, y: 180 },
  { name: "Pc1-GAZ", ip: "192.168.20.1", vlan: 20, x: 306, y: 62 },
  { name: "Pc2-GAZ", ip: "192.168.20.2", vlan: 20, x: 306, y: 180 },
];
export default function VlanExampleTopology({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 232"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏أي جهاز في أي VLAN؟</text>
      <g data-vlan="10"><rect className="eb-visual-zone" x="12" y="34" width="128" height="176" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="22" y="50" fill="var(--eb-primary-strong)">VLAN 10 · الإدارة</text></g>
      <g data-vlan="20"><rect className="eb-visual-zone" x="240" y="34" width="128" height="176" rx="12" stroke="var(--eb-success)" /><text className="eb-visual-zone-label" x="250" y="50" fill="var(--eb-success)">VLAN 20 · المحاسبة</text></g>
      {DEVS.map((d, i) => (
        <g key={i} data-dev={d.name}>
          <line className="eb-visual-link is-strong" x1={SW.x} y1={SW.y} x2={d.x} y2={d.y} />
          <rect className={"eb-visual-node " + (d.vlan === 10 ? "is-target" : "")} x={d.x - 44} y={d.y - 16} width="88" height="32" rx="6" />
          <text className="eb-visual-node-label" x={d.x} y={d.y - 4} textAnchor="middle" direction="ltr" fontSize="11">{d.name}</text>
          <text className="eb-visual-token" x={d.x} y={d.y + 9} textAnchor="middle" direction="ltr" fontSize="10">{d.ip}</text>
          {!reducedMotion && (
            <g className="eb-visual-packet"><rect x="-4" y="-4" width="8" height="8" rx="2" />
              <animateMotion id={`vlanAssoc${i}`} begin={i === 0 ? "0s;vlanAssoc3.end" : `vlanAssoc${i - 1}.end`} dur="0.7s" path={`M ${d.x} ${d.y} L ${SW.x} ${SW.y}`} /></g>
          )}
        </g>
      ))}
      <rect className="eb-visual-switch-box" x={SW.x - 26} y={SW.y - 15} width="52" height="30" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central">Switch</text>
      <text className="eb-visual-caption-svg" x="190" y="226" textAnchor="middle">‏السويتش يميّز الجهاز حسب المنفذ — كل VLAN لها شبكة IP مختلفة</text>
    </svg>
  );
}
