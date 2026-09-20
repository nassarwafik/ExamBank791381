import type { LearningVisualProps } from "../../types";

/**
 * «مشكلة Bus / التصادم» (Book 791381, PDF 59) — in a Bus every device shares ONE line; if two devices send at the
 * same instant, their data meet on that shared line and collide (Collision), the data is corrupted and re-sent.
 * Motion: two packets travel from opposite ends toward the middle and meet at the collision burst. Reduced motion ⇒
 * both packets parked either side of a static collision burst. Faithful to the page's worked example.
 */
const BUS_Y = 96;
const LEFT_D = `M 70 ${BUS_Y} L 190 ${BUS_Y}`;   // PC1 → middle
const RIGHT_D = `M 310 ${BUS_Y} L 190 ${BUS_Y}`;  // PC2 → middle
export default function BusCollision({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const pc = (x: number, label: string) => (
    <g>
      <rect className="eb-visual-node" x={x - 26} y={BUS_Y - 58} width="52" height="30" rx="6" />
      <text className="eb-visual-node-label" x={x} y={BUS_Y - 43} textAnchor="middle" dominantBaseline="central">{label}</text>
      <line className="eb-visual-link" x1={x} y1={BUS_Y - 28} x2={x} y2={BUS_Y} />
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* the single shared bus line */}
      <line className="eb-visual-link is-strong" x1="40" y1={BUS_Y} x2="340" y2={BUS_Y} />
      <text className="eb-visual-part-label" x="190" y={BUS_Y + 22} textAnchor="middle">خط واحد مشترك (Bus)</text>
      {pc(70, "PC1")}
      {pc(310, "PC2")}
      {/* invisible routes for the two packets */}
      <path id="bc-l" className="eb-visual-route" d={LEFT_D} />
      <path id="bc-r" className="eb-visual-route" d={RIGHT_D} />
      {/* collision burst at the meeting point */}
      <g className={reducedMotion ? "" : "eb-visual-pulse"}>
        <path className="eb-visual-pin" d="M190 82 l4 9 9 -3 -6 8 6 8 -9 -3 -4 9 -4 -9 -9 3 6 -8 -6 -8 9 3 z" />
      </g>
      <text className="eb-visual-token is-octet" x="190" y={BUS_Y - 26} textAnchor="middle" direction="ltr">Collision</text>
      {!reducedMotion ? (
        <>
          <g className="eb-visual-packet"><rect x="-7" y="-6" width="14" height="12" rx="3" /><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#bc-l" /></animateMotion></g>
          <g className="eb-visual-packet"><rect x="-7" y="-6" width="14" height="12" rx="3" /><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#bc-r" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="150" y={BUS_Y - 6} width="14" height="12" rx="3" />
          <rect className="eb-visual-packet-static" x="216" y={BUS_Y - 6} width="14" height="12" rx="3" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="168" textAnchor="middle">إرسالان في اللحظة نفسها ⇐ تصادم فتتلف البيانات ويُعاد الإرسال</text>
    </svg>
  );
}
