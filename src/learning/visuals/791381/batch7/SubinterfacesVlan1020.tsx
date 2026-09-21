import type { LearningVisualProps } from "../../types";

/**
 * «Router on a Stick — VLAN 10 / 20» (Book 791381, PDF 154) — the exact sub-interface config on THIS page: the one
 * physical interface g0/0 is split into sub-interfaces; g0/0.10 is fully mapped to VLAN 10 (encapsulation dot1Q 10,
 * ip address 192.168.10.254 = the VLAN 10 gateway), and g0/0.20 is only OPENED for VLAN 20 (the page ends before its
 * dot1Q/IP are given). Static diagram (no motion): the physical-interface → sub-interfaces mapping with THIS page's
 * exact values only. SPLIT from PDF 155 (VLAN 30/40) so no later-page value leaks here — this component never shows
 * g0/0.30/.40, dot1Q 30/40 or the 192.168.30/40 addresses.
 */
export default function SubinterfacesVlan1020({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 216"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏واجهة g0/0 واحدة → واجهات فرعية</text>

      {/* the one physical interface */}
      <g transform="translate(190 46)">
        <rect className="eb-visual-router" x="-44" y="-15" width="88" height="30" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="11">g0/0 (المنفذ)</text>
      </g>

      {/* g0/0.10 → VLAN 10 (fully mapped) */}
      <g data-subif="g0/0.10">
        <line className="eb-visual-link is-strong" x1="190" y1="61" x2="100" y2="96" />
        <rect className="eb-visual-seg is-v4" x="20" y="96" width="160" height="66" rx="8" />
        <text className="eb-visual-token" x="100" y="112" textAnchor="middle" fontSize="11">g0/0.10</text>
        <text className="eb-visual-meta" x="100" y="128" textAnchor="middle">encapsulation dot1Q 10</text>
        <text className="eb-visual-meta" x="100" y="142" textAnchor="middle">Gateway VLAN 10</text>
        <text className="eb-visual-token" x="100" y="156" textAnchor="middle" fontSize="10">192.168.10.254</text>
      </g>

      {/* g0/0.20 → VLAN 20 (opened only on this page) */}
      <g data-subif="g0/0.20">
        <line className="eb-visual-link" x1="190" y1="61" x2="280" y2="96" strokeDasharray="4 4" />
        <rect className="eb-visual-seg" x="200" y="96" width="160" height="66" rx="8" strokeDasharray="4 4" />
        <text className="eb-visual-token" x="280" y="112" textAnchor="middle" fontSize="11">g0/0.20</text>
        <text className="eb-visual-meta" x="280" y="130" textAnchor="middle">Sub-Interface لـ VLAN 20</text>
        <text className="eb-visual-meta" x="280" y="148" textAnchor="middle">(فُتحت في نهاية الصفحة)</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏g0/0.10 = بوابة VLAN 10 بعنوان 192.168.10.254 · g0/0.20 تُفتح لـ VLAN 20</text>
      <text className="eb-visual-meta" x="190" y="210" textAnchor="middle">كل واجهة فرعية تخدم VLAN واحدة عبر رقم dot1Q الخاص بها</text>
    </svg>
  );
}
