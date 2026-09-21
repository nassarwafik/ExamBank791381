import type { LearningVisualProps } from "../../types";

/**
 * «Administrative Distance و METRIC» (Book 791381, PDF 213) — the page teaches TWO different questions, and this
 * diagram now shows both side by side. METRIC answers «which path is best WITHIN one protocol?» (EIGRP Metric =
 * Bandwidth + Delay, OSPF Metric = Bandwidth). Administrative Distance answers «which protocol do I TRUST when several
 * know a route to the same network?», ranked by the page's exact values: Connected = 0, Static = 1, EIGRP = 90,
 * OSPF = 110, RIP = 120. In BOTH the smaller number wins. Static diagram (no motion): the metric panel above the AD
 * trust ladder, complete as a still frame. Book scope: the Metric-vs-AD distinction and these five AD values only — no
 * metric formulas beyond the two the page names, and NOT the routing-table output codes (PDF 222) or OSPF areas
 * (PDF 215).
 */
const METRIC = [
  { name: "EIGRP Metric", basis: "Bandwidth + Delay" },
  { name: "OSPF Metric", basis: "Bandwidth" },
];
const AD = [
  { name: "Connected", v: 0 },
  { name: "Static", v: 1 },
  { name: "EIGRP", v: 90 },
  { name: "OSPF", v: 110 },
  { name: "RIP", v: 120 },
];
export default function AdminDistance({ ariaLabel, className }: LearningVisualProps) {
  const mY = (i: number) => 74 + i * 26;
  const adY = (i: number) => 178 + i * 24;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 300"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏Metric مقابل Administrative Distance — الأصغر أفضل</text>

      {/* METRIC — which path is best WITHIN one protocol */}
      <g data-concept="metric">
        <text className="eb-visual-part-label" x="20" y="44">METRIC — أيّ طريق أفضل داخل البروتوكول؟</text>
        {METRIC.map((r, i) => (
          <g key={r.name} data-metric={r.name}>
            <rect className="eb-visual-seg is-v6" x="20" y={mY(i) - 15} width="340" height="24" rx="5" />
            <text className="eb-visual-node-label" x="32" y={mY(i) - 2} dominantBaseline="central" fontSize="11">{r.name}</text>
            <text className="eb-visual-token" x="348" y={mY(i) - 2} textAnchor="end" dominantBaseline="central" fontSize="10">{r.basis}</text>
          </g>
        ))}
      </g>

      <line className="eb-visual-divider" x1="20" y1="140" x2="360" y2="140" />

      {/* AD — which protocol do I trust for the SAME network */}
      <g data-concept="ad">
        <text className="eb-visual-part-label" x="20" y="162">AD — أيّ بروتوكول أصدّق للشبكة نفسها؟</text>
        {AD.map((r, i) => (
          <g key={r.name} data-ad={r.v}>
            <rect className="eb-visual-seg is-v4" x="20" y={adY(i) - 13} width="260" height="22" rx="5"
              opacity={1 - i * 0.13} />
            <text className="eb-visual-node-label" x="32" y={adY(i) - 1} dominantBaseline="central" fontSize="11">{r.name}</text>
            <text className="eb-visual-token is-octet" x="320" y={adY(i) - 1} textAnchor="middle" dominantBaseline="central">{r.v}</text>
          </g>
        ))}
      </g>

      <text className="eb-visual-caption-svg" x="190" y="290" textAnchor="middle">‏Metric يختار الطريق داخل البروتوكول · AD يختار بين البروتوكولات — وفي الحالتين الأصغر يفوز</text>
    </svg>
  );
}
