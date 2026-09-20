import type { LearningVisualProps } from "../../types";

/**
 * «مبنى الرسائل في الشبكات» (Book 791381, PDF 73) — a network message carries addressing fields around its data. The
 * book's worked Unicast example PC1 → PC2: MAC الهدف / MAC المصدر / IP الهدف / IP المصدر, then the data. Shown as a
 * labelled frame with the exact example values. Motion: a highlight sweeps across the header fields. Reduced motion ⇒
 * a static frame. All addresses render LTR.
 */
const FIELDS = [
  { ar: "MAC الهدف", v: "B4:11:C2:07:9E:31" },
  { ar: "MAC المصدر", v: "A0:02:AF:2D:10:22" },
  { ar: "IP الهدف", v: "192.168.1.20" },
  { ar: "IP المصدر", v: "192.168.1.10" },
];
export default function MessageStructure({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const x0 = 12, w = 86, gap = 3, y = 54, h = 44;
  const dataX = x0 + FIELDS.length * (w + gap);
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 150"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-part-label" x="12" y="34">حقول العنونة (الترويسة)</text>
      {FIELDS.map((f, i) => {
        const x = x0 + i * (w + gap);
        return (
          <g key={i}>
            <rect className={"eb-visual-seg is-v4" + (!reducedMotion && i === 0 ? " eb-visual-glow-anim" : "")} x={x} y={y} width={w} height={h} rx="5" />
            <text className="eb-visual-part-label" x={x + w / 2} y={y + 15} textAnchor="middle">{f.ar}</text>
            <text className="eb-visual-token" x={x + w / 2} y={y + 32} textAnchor="middle" direction="ltr">{f.v}</text>
          </g>
        );
      })}
      {/* data payload */}
      <rect className="eb-visual-seg is-v6" x={dataX} y={y} width="18" height={h} rx="5" />
      <text className="eb-visual-part-label" x={dataX + 9} y={y - 6} textAnchor="middle">البيانات</text>
      {/* a subtle sweep marker over the header when motion is on */}
      {!reducedMotion ? (
        <>
          <path id="ms-sweep" className="eb-visual-route" d={`M ${x0 + w / 2} ${y - 12} L ${x0 + 3 * (w + gap) + w / 2} ${y - 12}`} />
          <g className="eb-visual-packet"><rect x="-5" y="-4" width="10" height="8" rx="2" /><animateMotion dur="3s" repeatCount="indefinite"><mpath href="#ms-sweep" /></animateMotion></g>
        </>
      ) : null}
      <text className="eb-visual-caption-svg" x="190" y="126" textAnchor="middle">مثال Unicast: PC1 ← يرسل → PC2</text>
      <text className="eb-visual-meta" x="190" y="140" textAnchor="middle">العناوين تحيط بالبيانات فتصل الرسالة إلى الجهاز الصحيح</text>
    </svg>
  );
}
