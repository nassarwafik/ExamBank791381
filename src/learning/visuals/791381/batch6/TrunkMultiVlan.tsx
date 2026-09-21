import type { LearningVisualProps } from "../../types";

/**
 * «ما هو Trunk؟» (Book 791381, PDF 147) — a Trunk is ONE cable between two switches that carries SEVERAL VLANs; each
 * frame keeps a Tag that says which VLAN it belongs to (VLAN 10 · VLAN 20 · VLAN 30 in the page's own example). The
 * contrast the page draws: WITHOUT a trunk you would need a separate cable per VLAN. Static diagram (no motion): the
 * three tagged frames on the single trunk are shown together so the "one cable, many tagged VLANs" idea reads at a
 * glance, and the still frame is complete. Book scope only: Switch 1 / Switch 2, VLAN 10/20/30, Tag — no Dot1Q term
 * (PDF 152), no sub-interfaces, no router (PDF 150+).
 */
const VLANS = [10, 20, 30];
export default function TrunkMultiVlan({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Trunk = كابل واحد يحمل عدة VLAN</text>

      {/* the two switches and the single trunk cable between them */}
      <g data-trunk="1">
        <line className="eb-visual-link is-strong" x1="86" y1="70" x2="294" y2="70" strokeWidth="4" />
        <text className="eb-visual-zone-label" x="190" y="60" textAnchor="middle">Trunk</text>
      </g>
      <rect className="eb-visual-switch-box" x="40" y="56" width="46" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="63" y="70" textAnchor="middle" dominantBaseline="central">Switch 1</text>
      <rect className="eb-visual-switch-box" x="294" y="56" width="46" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="317" y="70" textAnchor="middle" dominantBaseline="central">Switch 2</text>

      {/* the three tagged frames travelling the one cable — each carries its VLAN Tag */}
      {VLANS.map((v, i) => {
        const x = 120 + i * 68;
        return (
          <g key={v} data-tagvlan={v}>
            <rect className="eb-visual-seg is-v4" x={x} y="94" width="60" height="26" rx="5" />
            <text className="eb-visual-token" x={x + 30} y="107" textAnchor="middle" dominantBaseline="central" fontSize="11">Tag {v}</text>
            <text className="eb-visual-meta" x={x + 30} y="132" textAnchor="middle">VLAN {v}</text>
          </g>
        );
      })}

      {/* the contrast: without a trunk, one cable per VLAN */}
      <text className="eb-visual-part-label" x="190" y="162" textAnchor="middle">‏بدون Trunk: كابل منفصل لكل VLAN</text>
      {VLANS.map((v, i) => (
        <line key={v} className="eb-visual-link is-faint" x1={120 + i * 68} y1="172" x2={172 + i * 68} y2="172" />
      ))}
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏كابل واحد + Tag لكل حزمة يميّز VLAN · Access لجهاز واحد، Trunk لعدة VLAN</text>
    </svg>
  );
}
