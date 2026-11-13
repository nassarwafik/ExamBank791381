import type { LearningVisualProps } from "../../types";

/**
 * AUTO-A2 unit 10 (S5 48, 51) — the Turing machine: an unbounded tape starting with the left mark ├, the word a b b, blank cells ∆,
 * the read / write head under the first letter and the control holding the current state. Static.
 */
export default function TuringTape({ ariaLabel, className }: LearningVisualProps) {
  const CELLS = ["├", "a", "b", "b", "∆", "∆", "∆"];
  const x0 = 40, cw = 40;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <rect className="eb-visual-node is-target" x="64" y="18" width="72" height="40" rx="8" />
      <text className="eb-visual-node-label" x="100" y="33" textAnchor="middle" dominantBaseline="central" fontSize="11">وحدة التحكم</text>
      <text className="eb-visual-token" x="100" y="48" textAnchor="middle" dominantBaseline="central" direction="ltr">q0</text>
      <path className="eb-visual-link is-strong" d="M 100 58 L 100 96" /><path className="eb-visual-link is-strong" d="M 94 88 L 100 98 L 106 88" fill="none" />
      <g direction="ltr">
        {CELLS.map((c, i) => (
          <g key={i}>
            <rect className={"eb-visual-seg" + (i === 1 ? " is-v4" : "")} x={x0 + i * cw} y="102" width={cw - 2} height="40" rx="3" />
            <text className="eb-visual-token" x={x0 + i * cw + (cw - 2) / 2} y="122" textAnchor="middle" dominantBaseline="central" fontSize="17">{c}</text>
          </g>
        ))}
        <text className="eb-visual-meta" x={x0 + CELLS.length * cw + 4} y="126">…</text>
      </g>
      <text className="eb-visual-meta" x="59" y="160" textAnchor="middle">البداية</text>
      <text className="eb-visual-part-label" x="140" y="178" textAnchor="middle">الرأس يقرأ ويكتب ويتحرك L / R</text>
      <text className="eb-visual-meta" x="300" y="160" textAnchor="middle">خانات فارغة ∆ بلا حدّ</text>
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏الكلمة على الشريط قبل أن تبدأ الآلة؛ والشريط ذاكرة غير محدودة</text>
    </svg>
  );
}
