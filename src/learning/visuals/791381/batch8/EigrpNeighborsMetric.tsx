import type { LearningVisualProps } from "../../types";

/**
 * «EIGRP» (Book 791381, PDF 218) — the concept page before the CLI configuration: EIGRP (Enhanced Interior Gateway
 * Routing Protocol) is an advanced Distance Vector protocol from Cisco; neighbouring routers exchange routing
 * information and it chooses paths by a metric of Bandwidth + Delay, converging quickly on change. Static diagram (no
 * motion): two EIGRP-neighbour routers exchanging routes, with the metric badge, complete as a still frame. It teaches
 * only what PDF 218 introduces — it does NOT show the PDF 219 example's AS number / R1·R2 topology, nor any of the
 * PDF 220–221 configuration commands. Book scope: EIGRP is Distance Vector · Cisco · metric = Bandwidth + Delay · fast
 * convergence between neighbours.
 */
export default function EigrpNeighborsMetric({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏EIGRP — الجيران يتبادلون المسارات</text>
      <text className="eb-visual-meta" x="190" y="40" textAnchor="middle">Enhanced Interior Gateway Routing Protocol</text>

      {/* two neighbouring EIGRP routers */}
      <g data-role="router">
        <rect className="eb-visual-router" x="34" y="66" width="72" height="34" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="70" y="83" textAnchor="middle" dominantBaseline="central" fontSize="11">Router A</text>
      </g>
      <g data-role="router">
        <rect className="eb-visual-router" x="274" y="66" width="72" height="34" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="310" y="83" textAnchor="middle" dominantBaseline="central" fontSize="11">Router B</text>
      </g>

      {/* the neighbour relationship: they exchange routing information */}
      <g data-neighbors="1">
        <line className="eb-visual-link is-strong" x1="106" y1="83" x2="274" y2="83" />
        <path className="eb-visual-marker" d="M 150 74 l 10 5 l -10 5 z" />
        <path className="eb-visual-marker" d="M 230 74 l -10 5 l 10 5 z" />
        <text className="eb-visual-token" x="190" y="70" textAnchor="middle" fontSize="9">جيران EIGRP — تبادل المسارات</text>
      </g>

      {/* the EIGRP metric */}
      <g data-metric="1">
        <rect className="eb-visual-seg is-v6" x="90" y="116" width="200" height="30" rx="7" />
        <text className="eb-visual-token" x="190" y="131" textAnchor="middle" dominantBaseline="central" fontSize="11">Metric = Bandwidth + Delay</text>
      </g>

      <text className="eb-visual-part-label" x="190" y="170" textAnchor="middle">Distance Vector · من Cisco · سريع التقارب</text>
      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏EIGRP بروتوكول Distance Vector من Cisco: الجيران يتبادلون المسارات ويختارون بـ Bandwidth + Delay</text>
    </svg>
  );
}
