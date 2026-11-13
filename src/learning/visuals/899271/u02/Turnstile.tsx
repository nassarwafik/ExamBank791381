import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 2 (EX 8–17) — the turnstile: locked / unlocked, the inputs «بطاقة» and «دفع», and the two self-loops. Static. */
export default function Turnstile({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <path className="eb-visual-link" d="M 20 120 L 66 120" /><path className="eb-visual-link" d="M 58 114 L 68 120 L 58 126" fill="none" />
      <circle className="eb-visual-node" cx="110" cy="120" r="40" />
      <text className="eb-visual-node-label" x="110" y="120" textAnchor="middle" dominantBaseline="central" fontSize="13">مقفلة</text>
      <circle className="eb-visual-node is-target" cx="270" cy="120" r="40" />
      <text className="eb-visual-node-label" x="270" y="120" textAnchor="middle" dominantBaseline="central" fontSize="13">غير مقفلة</text>
      <path className="eb-visual-link is-strong" d="M 140 94 Q 190 62 240 94" fill="none" /><path className="eb-visual-link is-strong" d="M 230 86 L 241 95 L 228 98" fill="none" />
      <text className="eb-visual-part-label" x="190" y="66" textAnchor="middle">بطاقة</text>
      <path className="eb-visual-link is-strong" d="M 240 146 Q 190 178 140 146" fill="none" /><path className="eb-visual-link is-strong" d="M 150 154 L 139 145 L 152 142" fill="none" />
      <text className="eb-visual-part-label" x="190" y="184" textAnchor="middle">دفع</text>
      <path className="eb-visual-link" d="M 96 82 C 80 40, 140 40, 124 82" fill="none" />
      <text className="eb-visual-meta" x="110" y="36" textAnchor="middle">دفع</text>
      <path className="eb-visual-link" d="M 256 82 C 240 40, 300 40, 284 82" fill="none" />
      <text className="eb-visual-meta" x="270" y="36" textAnchor="middle">بطاقة</text>
      <text className="eb-visual-caption-svg" x="190" y="212" textAnchor="middle">‏المدخل الذي لا يغيّر الحالة حلقة ذاتية</text>
    </svg>
  );
}
