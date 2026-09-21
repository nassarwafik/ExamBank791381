import type { LearningVisualProps } from "../../types";

/**
 * «Administrative Distance و METRIC» (Book 791381, PDF 213) — Administrative Distance ranks how much the router TRUSTS
 * a source of a route: the SMALLER the value, the more trusted. The page's exact values: Connected = 0, Static = 1,
 * EIGRP = 90, OSPF = 110, RIP = 120. Static diagram (no motion): a trust scale from most-trusted (0) to least (120),
 * complete as a still frame. Book scope: these five AD values only — no metric formulas, and NOT the routing-table
 * output codes (PDF 222) or OSPF areas (PDF 215).
 */
const AD = [
  { name: "Connected", v: 0 },
  { name: "Static", v: 1 },
  { name: "EIGRP", v: 90 },
  { name: "OSPF", v: 110 },
  { name: "RIP", v: 120 },
];
export default function AdminDistance({ ariaLabel, className }: LearningVisualProps) {
  const rowY = (i: number) => 56 + i * 28;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏Administrative Distance — الأصغر أفضل</text>
      <text className="eb-visual-part-label" x="40" y="44">أكثر ثقة</text>
      <text className="eb-visual-part-label" x="340" y="44" textAnchor="end">أقل ثقة</text>

      {AD.map((r, i) => (
        <g key={r.name} data-ad={r.v}>
          <rect className="eb-visual-seg is-v4" x="40" y={rowY(i) - 14} width="220" height="24" rx="5"
            opacity={1 - i * 0.13} />
          <text className="eb-visual-node-label" x="52" y={rowY(i) - 1} dominantBaseline="central" fontSize="12">{r.name}</text>
          <text className="eb-visual-token is-octet" x="300" y={rowY(i) - 1} textAnchor="middle" dominantBaseline="central">{r.v}</text>
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="208" textAnchor="middle">‏كلّما صغُرت قيمة AD زادت ثقة الراوتر بمصدر المسار: Connected 0 → RIP 120</text>
    </svg>
  );
}
