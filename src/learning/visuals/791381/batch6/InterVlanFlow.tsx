import type { LearningVisualProps } from "../../types";

/**
 * «خلاصة الوحدة — رحلة الحزمة» (Book 791381, PDF 156) — one packet's Inter-VLAN journey, exactly as the page's story
 * tells it: it leaves a host in VLAN 10, crosses the Trunk carrying a Tag, reaches the router sub-interface g0/0.10,
 * the router routes it, and it goes back out through g0/0.20 to VLAN 20. Motion TEACHES that ordered path: the packet
 * travels VLAN 10 → router → VLAN 20 in sequence (each leg begins after the previous ends). ONE-SHOT: the first leg
 * begins at a fixed time (not from the last leg's end) and the packet freezes at VLAN 20, so it never teleports back.
 * Reduced motion ⇒ the path with a static packet on the trunk. Book scope: VLAN 10/20, Trunk, Tag, g0/0.10/.20, router
 * — no new addresses.
 */
const H10 = { x: 60, y: 190 };   // VLAN 10 host (start)
const RTR = { x: 190, y: 48 };   // router (top)
const H20 = { x: 320, y: 190 };  // VLAN 20 host (end)
export default function InterVlanFlow({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 226"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏رحلة الحزمة بين VLAN عبر الراوتر</text>

      {/* router with the two sub-interfaces, switch, and the two VLAN hosts */}
      <g transform={`translate(${RTR.x} ${RTR.y})`}>
        <rect className="eb-visual-router" x="-38" y="-15" width="76" height="30" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central">Router</text>
      </g>
      <text className="eb-visual-token" data-subif="g0/0.10" x="150" y="80" textAnchor="middle" fontSize="10">g0/0.10</text>
      <text className="eb-visual-token" data-subif="g0/0.20" x="230" y="80" textAnchor="middle" fontSize="10">g0/0.20</text>
      <line className="eb-visual-link is-strong" x1="190" y1="63" x2="190" y2="104" strokeWidth="4" />
      <text className="eb-visual-zone-label" x="200" y="90">Trunk (Tag)</text>
      <rect className="eb-visual-switch-box" x="150" y="104" width="80" height="26" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="190" y="117" textAnchor="middle" dominantBaseline="central">Switch</text>

      <g data-vlan="10">
        <line className="eb-visual-link" x1="190" y1="130" x2={H10.x} y2={H10.y - 12} />
        <rect className="eb-visual-node is-target" x={H10.x - 26} y={H10.y - 12} width="52" height="26" rx="5" />
        <text className="eb-visual-node-label" x={H10.x} y={H10.y + 1} textAnchor="middle" dominantBaseline="central" fontSize="11">VLAN 10</text>
      </g>
      <g data-vlan="20">
        <line className="eb-visual-link" x1="190" y1="130" x2={H20.x} y2={H20.y - 12} />
        <rect className="eb-visual-node is-target" x={H20.x - 26} y={H20.y - 12} width="52" height="26" rx="5" />
        <text className="eb-visual-node-label" x={H20.x} y={H20.y + 1} textAnchor="middle" dominantBaseline="central" fontSize="11">VLAN 20</text>
      </g>

      {/* the packet: VLAN 10 → router (up), then router → VLAN 20 (down). Causal, one-shot, freezes at VLAN 20. */}
      {!reducedMotion ? (
        <g className="eb-visual-packet">
          <rect x="-6" y="-6" width="12" height="12" rx="2" />
          <animateMotion id="ivrUp" begin="0.4s" dur="1.1s" fill="freeze"
            path={`M ${H10.x} ${H10.y} L 190 130 L ${RTR.x} ${RTR.y + 16}`} />
          <animateMotion id="ivrDown" begin="ivrUp.end" dur="1.1s" fill="freeze"
            path={`M ${RTR.x} ${RTR.y + 16} L 190 130 L ${H20.x} ${H20.y}`} />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x="184" y="112" width="12" height="12" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="218" textAnchor="middle">‏من VLAN 10 عبر Trunk (Tag) إلى g0/0.10، يوجّهها الراوتر، فتخرج من g0/0.20 إلى VLAN 20</text>
    </svg>
  );
}
