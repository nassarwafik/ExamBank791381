import type { LearningVisualProps } from "../../types";

/**
 * «Router on a Stick» (Book 791381, PDF 151) — one router connects to a switch by a SINGLE Trunk cable, and the router
 * splits that one physical port into sub-interfaces (g0/0.10 for VLAN 10, g0/0.20 for VLAN 20). Below the switch sit
 * the two VLAN groups (two PCs each). The goal drawn on the page is Inter-VLAN Routing: letting different VLANs talk
 * through one router. Static diagram (no motion): the topology is a still map. Book scope for THIS page: sub-interface
 * NAMES and the two VLAN groups only — no IP addresses (they arrive on PDF 154) and no `encapsulation dot1Q` command.
 */
const GROUPS = [{ vlan: 10, x: 96 }, { vlan: 20, x: 268 }];
export default function RouterOnAStick({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Router on a Stick — Inter-VLAN Routing</text>

      {/* router on top with its two sub-interfaces */}
      <g transform="translate(190 44)">
        <rect className="eb-visual-router" x="-40" y="-16" width="80" height="32" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central">Router</text>
      </g>
      <text className="eb-visual-token" data-subif="g0/0.10" x="150" y="78" textAnchor="middle" fontSize="11">g0/0.10</text>
      <text className="eb-visual-token" data-subif="g0/0.20" x="230" y="78" textAnchor="middle" fontSize="11">g0/0.20</text>

      {/* the single Trunk cable down to the switch */}
      <line className="eb-visual-link is-strong" x1="190" y1="60" x2="190" y2="112" strokeWidth="4" />
      <text className="eb-visual-zone-label" x="200" y="92">Trunk</text>

      {/* the switch */}
      <rect className="eb-visual-switch-box" x="150" y="112" width="80" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="190" y="126" textAnchor="middle" dominantBaseline="central">Switch</text>

      {/* two VLAN groups, two PCs each */}
      {GROUPS.map(g => (
        <g key={g.vlan} data-vlangroup={g.vlan}>
          <line className="eb-visual-link" x1="190" y1="140" x2={g.x + 24} y2="176" />
          <rect className="eb-visual-zone" x={g.x - 20} y="176" width="88" height="52" rx="10" />
          <text className="eb-visual-zone-label" x={g.x + 24} y="190" textAnchor="middle">VLAN {g.vlan}</text>
          {[0, 1].map(k => (
            <rect key={k} className="eb-visual-node is-target" x={g.x - 12 + k * 44} y="200" width="32" height="20" rx="4" />
          ))}
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="238" textAnchor="middle">‏كابل Trunk واحد + واجهتان فرعيّتان (g0/0.10 و g0/0.20) تربطان VLAN مختلفة عبر راوتر واحد</text>
    </svg>
  );
}
