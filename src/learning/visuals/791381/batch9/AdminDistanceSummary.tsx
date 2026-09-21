import type { LearningVisualProps } from "../../types";

/**
 * «المسافة الإدارية AD» (Book 791381, PDF 252) — the summary-level, AD-ONLY view: Administrative Distance is the trust
 * in the SOURCE of a route, and the smaller the number the higher the priority. The book's exact values, ordered from
 * most to least trusted: Connected 0, Static 1, EIGRP 90, OSPF 110, RIP 120. Purely a still summary (no motion). Book
 * scope: PDF252's AD values and the "smaller = more trusted" rule ONLY — NO metric formulas, NO Bandwidth, NO Delay
 * (that Metric-vs-AD content lives on PDF213, not here).
 */
const AD: [string, string][] = [
  ["Connected", "0"],
  ["Static", "1"],
  ["EIGRP", "90"],
  ["OSPF", "110"],
  ["RIP", "120"],
];
const X = 40, W = 300, RH = 30;
export default function AdminDistanceSummary({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏المسافة الإدارية AD — الأصغر أوثق</text>
      <text className="eb-visual-part-label" x="190" y="40" textAnchor="middle">الثقة في مصدر المسار — كلّما قلّ الرقم زادت الأولوية</text>

      {AD.map(([name, ad], i) => {
        const y = 52 + i * RH;
        return (
          <g key={name} data-ad={ad}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="26" rx="5" />
            <text className="eb-visual-node-label" x={X + 12} y={y + 13} dominantBaseline="central" textAnchor="start" fontSize="11" direction="ltr">{name}</text>
            <text className="eb-visual-token is-octet" x={X + W - 14} y={y + 13} dominantBaseline="central" textAnchor="end" fontSize="13" direction="ltr">{ad}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="224" textAnchor="middle">‏عند تعدّد المسارات لنفس الشبكة يفوز الأقل AD</text>
    </svg>
  );
}
