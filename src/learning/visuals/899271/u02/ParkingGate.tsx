import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 2 (EX 4–7, S1 45–48) — the electric parking gate: two states, one input (a press of the remote's button). Static. */
export default function ParkingGate({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <path className="eb-visual-link" d="M 20 100 L 66 100" /><path className="eb-visual-link" d="M 58 94 L 68 100 L 58 106" fill="none" />
      <circle className="eb-visual-node" cx="110" cy="100" r="40" />
      <text className="eb-visual-node-label" x="110" y="100" textAnchor="middle" dominantBaseline="central" fontSize="13">مغلقة</text>
      <circle className="eb-visual-node is-target" cx="270" cy="100" r="40" />
      <text className="eb-visual-node-label" x="270" y="100" textAnchor="middle" dominantBaseline="central" fontSize="13">مفتوحة</text>
      <path className="eb-visual-link is-strong" d="M 140 74 Q 190 40 240 74" fill="none" /><path className="eb-visual-link is-strong" d="M 230 66 L 241 75 L 228 78" fill="none" />
      <path className="eb-visual-link is-strong" d="M 240 126 Q 190 160 140 126" fill="none" /><path className="eb-visual-link is-strong" d="M 150 134 L 139 125 L 152 122" fill="none" />
      <text className="eb-visual-part-label" x="190" y="44" textAnchor="middle">ضغطة زر</text>
      <text className="eb-visual-part-label" x="190" y="166" textAnchor="middle">ضغطة زر</text>
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">‏كل حالة دائرة، وكل انتقال سهم عليه المدخل</text>
    </svg>
  );
}
