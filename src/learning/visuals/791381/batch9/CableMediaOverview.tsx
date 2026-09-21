import type { LearningVisualProps } from "../../types";

/**
 * «الكوابل ووسائط الاتصال — نظرة عامة» (Book 791381, PDF 235) — the two source groupings the page prints: the three
 * cable types (UTP copper unshielded, STP copper shielded, Fiber) and the three wiring uses (Straight device↔switch,
 * Cross device↔device, Roll-over to the console). Purely a still overview (no motion). Book scope: exactly these
 * types and wiring uses — NO external speed / distance figures are added.
 */
const CABLES: [string, string][] = [
  ["UTP", "نحاسي بدون حماية"],
  ["STP", "نحاسي مع حماية"],
  ["Fiber", "ألياف — الأبعد"],
];
const WIRING: [string, string][] = [
  ["Straight", "جهاز — سويتش/راوتر"],
  ["Cross", "جهاز — جهاز"],
  ["Roll-over", "كونسول للإعداد"],
];
export default function CableMediaOverview({ ariaLabel, className }: LearningVisualProps) {
  const col = (items: [string, string][], x: number, title: string, tag: string) => {
    const W = 158, Y0 = 54, RH = 42;
    return (
      <g>
        <text className="eb-visual-part-label" x={x + W / 2} y="42" textAnchor="middle">{title}</text>
        {items.map(([k, d], i) => {
          const y = Y0 + i * RH;
          return (
            <g key={k} data-cable={tag === "cable" ? k : undefined} data-wiring={tag === "wiring" ? k : undefined}>
              <rect className="eb-visual-zone" x={x} y={y} width={W} height={36} rx="6" />
              <text className="eb-visual-node-label" x={x + W / 2} y={y + 13} textAnchor="middle" dominantBaseline="central" fontSize="11" direction="ltr">{k}</text>
              <text className="eb-visual-meta" x={x + W / 2} y={y + 26} textAnchor="middle" dominantBaseline="central">{d}</text>
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏أنواع الكوابل · طريقة التوصيل</text>
      {col(CABLES, 20, "الكابل", "cable")}
      {col(WIRING, 202, "التوصيل", "wiring")}
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏لكل كابل نوعه، ولكل حالة توصيلها المناسب</text>
    </svg>
  );
}
