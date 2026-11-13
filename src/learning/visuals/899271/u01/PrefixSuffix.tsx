import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 1 (S1 21–23) — the word aaba: brackets under it for its prefixes (from the start) and over it for its suffixes (to the end). Static. */
export default function PrefixSuffix({ ariaLabel, className }: LearningVisualProps) {
  const W = ["a", "a", "b", "a"];
  const x0 = 110, cw = 40;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 230" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏اللواحق تنتهي عند آخر الكلمة</text>
      {[1, 2, 3].map(k => <path key={"s" + k} className="eb-visual-link is-strong" d={`M ${x0 + (4 - k) * cw + 3} ${100 - k * 14} L ${x0 + 4 * cw - 3} ${100 - k * 14}`} />)}
      {["a", "ba", "aba"].map((t, k) => <text key={t} className="eb-visual-meta" x={x0 + 4 * cw + 14} y={100 - (k + 1) * 14 + 4} direction="ltr">{t}</text>)}
      <g direction="ltr">
        {W.map((s, i) => (
          <g key={i}>
            <rect className="eb-visual-seg" x={x0 + i * cw} y="104" width={cw - 4} height="36" rx="5" />
            <text className="eb-visual-token" x={x0 + i * cw + (cw - 4) / 2} y="122" textAnchor="middle" dominantBaseline="central" fontSize="18">{s}</text>
          </g>
        ))}
      </g>
      {[1, 2, 3].map(k => <path key={"p" + k} className="eb-visual-link" d={`M ${x0 + 3} ${146 + k * 14} L ${x0 + k * cw - 7} ${146 + k * 14}`} />)}
      {["a", "aa", "aab"].map((t, k) => <text key={t} className="eb-visual-meta" x={x0 - 14} y={146 + (k + 1) * 14 + 4} textAnchor="end" direction="ltr">{t}</text>)}
      <text className="eb-visual-caption-svg" x="190" y="220" textAnchor="middle">‏البادئات تبدأ من أول الكلمة (و ε والكلمة نفسها بادئة ولاحقة دائمًا)</text>
    </svg>
  );
}
