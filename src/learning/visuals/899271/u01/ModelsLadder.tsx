import type { LearningVisualProps } from "../../types";

/**
 * AUTO-A2 «الوحدة الخامسة: الأتمتة», unit 1 (S1 5–8) — the map of the unit: three models, each adding memory to the one before
 * (finite automaton → push-down automaton → Turing machine). Static.
 */
const STEPS = [
  { y: 150, label: "أوتومات منتهٍ", memory: "ذاكرة: الحالة فقط", w: 150 },
  { y: 100, label: "أوتومات مكدّس", memory: "+ مكدّس غير محدود", w: 190 },
  { y: 50, label: "آلة تورنغ", memory: "+ شريط تقرأ وتكتب عليه", w: 230 },
];
export default function ModelsLadder({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏كل نموذج أقوى من الذي قبله</text>
      {STEPS.map((s, i) => (
        <g key={s.label} data-node="model">
          <rect className={"eb-visual-node" + (i === 2 ? " is-target" : "")} x={190 - s.w / 2} y={s.y - 18} width={s.w} height="36" rx="8" />
          <text className="eb-visual-node-label" x="190" y={s.y - 4} textAnchor="middle" dominantBaseline="central" fontSize="12">{s.label}</text>
          <text className="eb-visual-meta" x="190" y={s.y + 10} textAnchor="middle" dominantBaseline="central" fontSize="9">{s.memory}</text>
        </g>
      ))}
      <path className="eb-visual-link is-strong" d="M 330 165 L 330 40" />
      <path className="eb-visual-link is-strong" d="M 324 50 L 330 38 L 336 50" fill="none" />
      <text className="eb-visual-part-label" x="345" y="105" textAnchor="middle" transform="rotate(-90 345 105)">قوة الحساب</text>
      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏نبدأ بالأبسط ونضيف ذاكرة في كل مرة</text>
    </svg>
  );
}
