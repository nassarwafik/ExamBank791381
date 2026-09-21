import type { LearningVisualProps } from "../../types";

/**
 * «وحدات التخزين» (Book 791381, PDF 72) — the storage ladder from smallest to largest with the book's exact ratios:
 * 1 بايت = 8 بت، ثم كل وحدة = 1024 من التي تحتها (KB, MB, GB, TB). A rising staircase makes "each step is bigger"
 * concrete. Motion: a marker climbs the steps. Reduced motion ⇒ the marker rests on the first step. Numbers are LTR.
 */
const STEPS = [
  { u: "bit", ar: "بت", note: "أصغر وحدة" },
  { u: "Byte", ar: "بايت", note: "= 8 بت" },
  { u: "KB", ar: "كيلوبايت", note: "= 1024 بايت" },
  { u: "MB", ar: "ميجابايت", note: "= 1024 KB" },
  { u: "GB", ar: "جيجابايت", note: "= 1024 MB" },
  { u: "TB", ar: "تيرابايت", note: "= 1024 GB" },
];
export default function StorageUnits({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const x0 = 30, bw = 54, gap = 3, baseY = 176;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line className="eb-visual-axis" x1="24" y1={baseY} x2="360" y2={baseY} />
      {STEPS.map((s, i) => {
        const h = 22 + i * 22, x = x0 + i * (bw + gap), y = baseY - h;
        const climb = i === 0 && !reducedMotion;
        return (
          <g key={s.u}>
            <rect className={"eb-visual-band is-a" + (climb ? " eb-visual-glow-anim" : "")} x={x} y={y} width={bw} height={h} rx="4" />
            <text className="eb-visual-token is-inverse" x={x + bw / 2} y={y + 15} textAnchor="middle" direction="ltr">{s.u}</text>
            <text className="eb-visual-part-label" x={x + bw / 2} y={baseY + 14} textAnchor="middle">{s.ar}</text>
            <text className="eb-visual-meta" x={x + bw / 2} y={baseY + 26} textAnchor="middle">{s.note}</text>
          </g>
        );
      })}
      {/* climbing marker */}
      {!reducedMotion ? (
        <g className="eb-visual-packet">
          <rect x="-6" y="-6" width="12" height="12" rx="3" />
          <animateMotion dur="4.8s" repeatCount="indefinite" path={`M ${x0 + bw / 2} ${baseY - 30} L ${x0 + 5 * (bw + gap) + bw / 2} ${baseY - 22 - 5 * 22 - 8}`} />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={x0 + bw / 2 - 6} y={baseY - 30} width="12" height="12" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">من الأصغر إلى الأكبر · كل وحدة = 1024 من التي تحتها (بعد البايت)</text>
    </svg>
  );
}
