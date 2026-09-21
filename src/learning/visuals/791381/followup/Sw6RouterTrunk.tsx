import type { LearningVisualProps } from "../../types";

/**
 * «Trunk على Sw6 مع الراوتر» (Book 791381, PDF 150) — the network diagram the teacher requested: Sw6 connects UP to
 * the Router through port G0/0 as a TRUNK (so packets carrying several VLAN tags reach the router for Router-on-a-Stick
 * routing), and DOWN to other switches through ports F0/22–F0/24. The one teaching point made obvious: the Sw6 ↔ Router
 * link must be a TRUNK because multiple VLANs need to reach the router. Static diagram (no motion). Book scope for THIS
 * page: the topology and the trunk idea only — NO sub-interfaces (g0/0.10/.20), NO IP addresses, NO Dot1Q commands
 * (those are the following pages, PDF 151–154).
 */
const DOWNLINKS = ["F0/22", "F0/23", "F0/24"];
export default function Sw6RouterTrunk({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 250"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Sw6 ↔ الراوتر عبر G0/0 (Trunk)</text>

      {/* the router on top */}
      <g data-node="router">
        <rect className="eb-visual-router" x="150" y="34" width="80" height="30" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="190" y="49" textAnchor="middle" dominantBaseline="central" fontSize="11">الراوتر</text>
      </g>

      {/* the Sw6 ↔ Router TRUNK uplink (the teaching point) */}
      <g data-link="trunk">
        <line className="eb-visual-link is-strong" x1="190" y1="64" x2="190" y2="104" stroke="var(--eb-primary)" strokeWidth="3" />
        <text className="eb-visual-meta" x="198" y="76" textAnchor="start">G0/0</text>
        <text className="eb-visual-part-label" x="198" y="94" textAnchor="start" fill="var(--eb-primary)">TRUNK</text>
      </g>

      {/* Sw6 in the middle */}
      <g data-node="sw6">
        <rect className="eb-visual-switch-box" x="150" y="104" width="80" height="30" rx="6" />
        <text className="eb-visual-node-label" x="190" y="119" textAnchor="middle" dominantBaseline="central" fontSize="11">Sw6</text>
      </g>

      {/* three downlinks F0/22–F0/24 to other switches */}
      {DOWNLINKS.map((port, i) => {
        const x = 66 + i * 124;
        return (
          <g key={port} data-downlink={port}>
            <line className="eb-visual-link" x1="190" y1="134" x2={x} y2="188" />
            <text className="eb-visual-meta" x={(190 + x) / 2 + (i === 2 ? 10 : -10)} y={158 + i * 2} textAnchor="middle">{port}</text>
            <rect className="eb-visual-switch-box" x={x - 40} y="188" width="80" height="28" rx="6" />
            <text className="eb-visual-node-label" x={x} y="202" textAnchor="middle" dominantBaseline="central" fontSize="10">سويتش آخر</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="236" textAnchor="middle">‏رابط Sw6 بالراوتر Trunk لأن عدة VLAN يجب أن تصل الراوتر · F0/22–F0/24 نحو سويتشات أخرى</text>
    </svg>
  );
}
