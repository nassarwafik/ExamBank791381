import type { LearningVisualProps } from "../../types";

/**
 * AUTO-A2 unit 8 (S4 36–40) — the stack of a push-down automaton: elements enter and leave only at the top (LIFO), the bottom
 * mark ⏊ is never removed; «ادفع» may push several symbols, «اسحب» removes exactly one. Static.
 */
export default function StackLifo({ ariaLabel, className }: LearningVisualProps) {
  const CELLS = ["A", "A", "S", "⏊"];
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 230" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <path className="eb-visual-link is-strong" d="M 150 50 L 150 200 L 230 200 L 230 50" fill="none" />
      {CELLS.map((c, i) => (
        <g key={i}>
          <rect className={"eb-visual-seg" + (i === 0 ? " is-v4" : "")} x="156" y={58 + i * 35} width="68" height="31" rx="4" />
          <text className="eb-visual-token" x="190" y={74 + i * 35} textAnchor="middle" dominantBaseline="central" fontSize="16" direction="ltr">{c}</text>
        </g>
      ))}
      <text className="eb-visual-part-label" x="250" y="76" direction="rtl">← القمة</text>
      <text className="eb-visual-meta" x="250" y="183" direction="rtl">← القاع: لا يُسحب أبدًا</text>
      <path className="eb-visual-link is-strong" d="M 110 30 Q 150 22 170 46" fill="none" /><path className="eb-visual-link is-strong" d="M 162 42 L 171 48 L 172 37" fill="none" />
      <text className="eb-visual-part-label" x="80" y="34" textAnchor="middle">ادفع (رمز أو أكثر)</text>
      <path className="eb-visual-link" d="M 210 46 Q 230 22 270 30" fill="none" /><path className="eb-visual-link" d="M 262 25 L 271 30 L 262 36" fill="none" />
      <text className="eb-visual-part-label" x="310" y="34" textAnchor="middle">اسحب (رمزًا واحدًا)</text>
      <text className="eb-visual-caption-svg" x="190" y="222" textAnchor="middle">‏الأخير الذي دخل هو الأول الذي يخرج (LIFO)</text>
    </svg>
  );
}
