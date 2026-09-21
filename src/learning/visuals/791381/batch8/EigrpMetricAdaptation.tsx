import type { LearningVisualProps } from "../../types";

/**
 * «EIGRP» (Book 791381, PDF 218) — the concept page before the CLI configuration, at its own level only: EIGRP
 * (Enhanced Interior Gateway Routing Protocol) is an advanced Distance Vector protocol from Cisco; it chooses a route
 * by a metric of Bandwidth + Delay, and it adapts quickly to changes (faster convergence than older protocols). Static
 * diagram (no motion): the metric inputs feeding the route choice, plus the fast-adaptation cue, complete as a still
 * frame. It teaches only what PDF 218 introduces — it does NOT show neighbours exchanging routes, the PDF 219 example
 * (AS number, R1 / R2 topology) or any PDF 220–221 configuration command. Book scope: EIGRP is Distance Vector · Cisco
 * · metric = Bandwidth + Delay · fast adaptation to change.
 */
export default function EigrpMetricAdaptation({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏EIGRP — المقياس والتكيّف السريع</text>
      <text className="eb-visual-meta" x="190" y="37" textAnchor="middle">Enhanced Interior Gateway Routing Protocol</text>

      {/* what EIGRP is (source badges only) */}
      <g data-badge="distance-vector">
        <rect className="eb-visual-token is-octet" x="66" y="46" width="128" height="22" rx="4" />
        <text className="eb-visual-token" x="130" y="57" textAnchor="middle" dominantBaseline="central" fontSize="10">Distance Vector</text>
      </g>
      <g data-badge="cisco">
        <rect className="eb-visual-token is-octet" x="206" y="46" width="92" height="22" rx="4" />
        <text className="eb-visual-token" x="252" y="57" textAnchor="middle" dominantBaseline="central" fontSize="10">من Cisco</text>
      </g>

      {/* the metric: Bandwidth + Delay → route choice */}
      <g data-metric="1">
        <rect className="eb-visual-seg is-v6" x="20" y="82" width="86" height="24" rx="5" />
        <text className="eb-visual-token" x="63" y="94" textAnchor="middle" dominantBaseline="central" fontSize="10">Bandwidth</text>
        <text className="eb-visual-part-label" x="118" y="98" textAnchor="middle" fontSize="13">+</text>
        <rect className="eb-visual-seg is-v6" x="130" y="82" width="66" height="24" rx="5" />
        <text className="eb-visual-token" x="163" y="94" textAnchor="middle" dominantBaseline="central" fontSize="10">Delay</text>

        <line className="eb-visual-link is-strong" x1="196" y1="94" x2="240" y2="94" />
        <path className="eb-visual-marker" d="M 236 87 l 10 7 l -10 7 z" />
        <rect className="eb-visual-router" x="246" y="80" width="114" height="28" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="303" y="94" textAnchor="middle" dominantBaseline="central" fontSize="10.5">اختيار المسار</text>
      </g>
      <text className="eb-visual-meta" x="190" y="126" textAnchor="middle">المقياس (Metric) = Bandwidth + Delay</text>

      {/* fast adaptation to change */}
      <g data-adapt="1">
        <rect className="eb-visual-seg is-v4" x="24" y="146" width="136" height="30" rx="6" />
        <text className="eb-visual-node-label" x="92" y="161" textAnchor="middle" dominantBaseline="central" fontSize="10.5">تغيّر في الشبكة</text>
        <line className="eb-visual-link is-strong" x1="160" y1="161" x2="214" y2="161" />
        <path className="eb-visual-marker" d="M 210 154 l 10 7 l -10 7 z" />
        <rect className="eb-visual-seg is-v6" x="220" y="146" width="136" height="30" rx="6" fill="var(--eb-success)" opacity="0.16" stroke="var(--eb-success)" />
        <text className="eb-visual-node-label" x="288" y="161" textAnchor="middle" dominantBaseline="central" fontSize="10.5">سريع التكيّف</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏EIGRP بروتوكول Distance Vector من Cisco: يختار المسار بمقياس Bandwidth + Delay ويتكيّف سريعًا مع التغييرات</text>
    </svg>
  );
}
