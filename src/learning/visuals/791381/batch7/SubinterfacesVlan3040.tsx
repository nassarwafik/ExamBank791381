import type { LearningVisualProps } from "../../types";

/**
 * «Router on a Stick — VLAN 30 / 40» (Book 791381, PDF 155) — the exact sub-interface config on THIS page: the one
 * physical interface g0/0 carries two fully-configured sub-interfaces — g0/0.30 (encapsulation dot1Q 30, ip address
 * 192.168.30.254 = VLAN 30 gateway) and g0/0.40 (encapsulation dot1Q 40, ip address 192.168.40.254 = VLAN 40 gateway).
 * Static diagram (no motion): the same pattern as PDF 154 but with THIS page's own VLAN 30/40 values. SPLIT from PDF
 * 154 so its VLAN 10/20 values never leak here — this component shows only g0/0.30/.40, dot1Q 30/40 and the
 * 192.168.30/40 addresses.
 */
const SUBS = [
  { name: "g0/0.30", vlan: 30, ip: "192.168.30.254", x: 100 },
  { name: "g0/0.40", vlan: 40, ip: "192.168.40.254", x: 280 },
];
export default function SubinterfacesVlan3040({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏واجهة g0/0 واحدة → واجهتان فرعيّتان</text>

      <g transform="translate(190 46)">
        <rect className="eb-visual-router" x="-44" y="-15" width="88" height="30" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="11">g0/0 (المنفذ)</text>
      </g>

      {SUBS.map(s => (
        <g key={s.name} data-subif={s.name}>
          <line className="eb-visual-link is-strong" x1="190" y1="61" x2={s.x} y2="96" />
          <rect className="eb-visual-seg is-v4" x={s.x - 80} y="96" width="160" height="66" rx="8" />
          <text className="eb-visual-token" x={s.x} y="112" textAnchor="middle" fontSize="11">{s.name}</text>
          <text className="eb-visual-meta" x={s.x} y="128" textAnchor="middle">encapsulation dot1Q {s.vlan}</text>
          <text className="eb-visual-meta" x={s.x} y="142" textAnchor="middle">Gateway VLAN {s.vlan}</text>
          <text className="eb-visual-token" x={s.x} y="156" textAnchor="middle" fontSize="10">{s.ip}</text>
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">‏g0/0.30 = بوابة VLAN 30 (192.168.30.254) · g0/0.40 = بوابة VLAN 40 (192.168.40.254)</text>
      <text className="eb-visual-meta" x="190" y="206" textAnchor="middle">رقم dot1Q لكل واجهة فرعية يطابق رقم VLAN التي تخدمها</text>
    </svg>
  );
}
