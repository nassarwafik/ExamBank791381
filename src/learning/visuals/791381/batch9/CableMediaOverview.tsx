import type { LearningVisualProps } from "../../types";

/**
 * «الكوابل ووسائط الاتصال — نظرة عامة» (Book 791381, PDF 235) — the THREE source groupings the page prints, in full:
 * (A) cable types — UTP copper unshielded (الأشيع), STP copper shielded (ضد التشويش), Fiber (مسافات طويلة وسرعة);
 * (B) the «وسائط الاتصال» table with the book's exact speed + range values — UTP 1 Gbps / 100 م, Fiber 100 Gbps /
 * عدّة كم, Coaxial 10 Mbps / قصير; and (C) wiring uses — Straight (جهاز→سويتش/راوتر), Cross (جهاز→جهاز), Roll-over
 * (كونسول للإعداد). Purely a still overview (no motion). Book scope: exactly these source values — NO Cat5/Cat6, no
 * connector types, no external speed/distance data is added.
 */
const CABLES: [string, string][] = [
  ["UTP", "نحاسي بدون حماية، الأشيع"],
  ["STP", "نحاسي مع حماية ضد التشويش"],
  ["Fiber", "ألياف، مسافات طويلة وسرعة"],
];
const MEDIA: [string, string, string][] = [
  ["UTP", "1 Gbps", "100 م"],
  ["Fiber", "100 Gbps", "عدّة كم"],
  ["Coaxial", "10 Mbps", "قصير"],
];
const WIRING: [string, string][] = [
  ["Straight", "جهاز إلى سويتش/راوتر"],
  ["Cross", "جهاز إلى جهاز"],
  ["Roll-over", "كونسول للإعداد"],
];
const X = 16, W = 348, RH = 22;
export default function CableMediaOverview({ ariaLabel, className }: LearningVisualProps) {
  const header = (y: number, txt: string) => <text className="eb-visual-part-label" x={190} y={y} textAnchor="middle">{txt}</text>;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 304"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="18" textAnchor="middle">‏الكوابل · الوسائط · التوصيل</text>

      {/* A. cable types */}
      {header(36, "أ · أنواع الكوابل")}
      {CABLES.map(([k, d], i) => {
        const y = 44 + i * RH;
        return (
          <g key={"c" + k} data-cable={k}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="19" rx="4" />
            <text className="eb-visual-node-label" x={X + 10} y={y + 10} dominantBaseline="central" textAnchor="start" fontSize="10.5" direction="ltr">{k}</text>
            <text className="eb-visual-meta" x={X + W * 0.62} y={y + 10} dominantBaseline="central" textAnchor="middle">{d}</text>
          </g>
        );
      })}

      {/* B. media (exact source speed + range) */}
      {header(122, "ب · وسائط الاتصال — السرعة والمدى")}
      {MEDIA.map(([k, speed, range], i) => {
        const y = 130 + i * RH;
        return (
          <g key={"m" + k} data-media={k}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="19" rx="4" />
            <text className="eb-visual-node-label" x={X + 10} y={y + 10} dominantBaseline="central" textAnchor="start" fontSize="10.5" direction="ltr">{k}</text>
            <text className="eb-visual-token is-octet" x={X + W * 0.5} y={y + 10} dominantBaseline="central" textAnchor="middle" fontSize="11" direction="ltr">{speed}</text>
            <text className="eb-visual-meta" x={X + W - 44} y={y + 10} dominantBaseline="central" textAnchor="middle">{range}</text>
          </g>
        );
      })}

      {/* C. wiring uses */}
      {header(208, "ج · طريقة التوصيل")}
      {WIRING.map(([k, d], i) => {
        const y = 216 + i * RH;
        return (
          <g key={"w" + k} data-wiring={k}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="19" rx="4" />
            <text className="eb-visual-node-label" x={X + 10} y={y + 10} dominantBaseline="central" textAnchor="start" fontSize="10.5" direction="ltr">{k}</text>
            <text className="eb-visual-meta" x={X + W * 0.62} y={y + 10} dominantBaseline="central" textAnchor="middle">{d}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="296" textAnchor="middle">‏النوع، ثم السرعة والمدى، ثم طريقة التوصيل المناسبة</text>
    </svg>
  );
}
