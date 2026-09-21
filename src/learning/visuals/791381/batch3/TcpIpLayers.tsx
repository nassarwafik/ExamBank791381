import type { LearningVisualProps } from "../../types";

/**
 * «طبقات TCP/IP الأربع» (Book 791381, PDF 82) — the TCP/IP model's four layers, numbered by the book top→bottom as
 * 4 Application, 3 Transport, 2 Internet, 1 Link. Shown as a labelled stack; motion: a data unit travels DOWN the
 * stack 4 → 3 → 2 → 1 (the direction data takes as it is sent). Reduced motion ⇒ the unit rests at the Application
 * layer. Layer names + numbers render LTR.
 */
const LAYERS = [
  { n: 4, en: "Application", ar: "التطبيقات" },
  { n: 3, en: "Transport", ar: "النقل" },
  { n: 2, en: "Internet", ar: "الإنترنت" },
  { n: 1, en: "Link", ar: "الوصول للشبكة" },
];
export default function TcpIpLayers({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const x = 70, w = 240, h = 40, gap = 8, y0 = 16;
  const yOf = (i: number) => y0 + i * (h + gap);
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 218"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {LAYERS.map((l, i) => (
        <g key={l.en}>
          <rect className="eb-visual-seg is-v4" x={x} y={yOf(i)} width={w} height={h} rx="7" />
          <text className="eb-visual-token" x={x + 16} y={yOf(i) + h / 2} dominantBaseline="central" direction="ltr">{l.n}. {l.en}</text>
          <text className="eb-visual-part-label" x={x + w - 12} y={yOf(i) + h / 2} textAnchor="end" dominantBaseline="central">{l.ar}</text>
        </g>
      ))}
      {/* descending data unit */}
      {!reducedMotion ? (
        <g className="eb-visual-packet">
          <rect x="-7" y="-7" width="14" height="14" rx="3" />
          <animateMotion dur="4s" repeatCount="indefinite" path={`M ${x - 18} ${yOf(0) + h / 2} L ${x - 18} ${yOf(3) + h / 2}`} />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={x - 25} y={yOf(0) + h / 2 - 7} width="14" height="14" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="212" textAnchor="middle">أربع طبقات (4 → 1) · البيانات تنزل من Application إلى Link عند الإرسال</text>
    </svg>
  );
}
