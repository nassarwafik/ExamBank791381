import type { LearningVisualProps } from "../../types";

/**
 * «Half Duplex / Full Duplex» (Book 791381, PDF 103) — Half Duplex can carry traffic BOTH ways but only ONE direction
 * at a time; Full Duplex carries both directions SIMULTANEOUSLY. The MOTION is the whole point: on the Half side the
 * A→B and B→A packets are strictly sequenced (one finishes before the other starts, on a single shared line); on the
 * Full side both directions animate at the same time on two lanes. Reduced motion ⇒ still packets. Names render LTR.
 */
export default function HalfFullDuplex({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const nodeAB = (ox: number, y: number) => (
    <>
      <rect className="eb-visual-node" x={ox - 2} y={y - 14} width="34" height="28" rx="5" /><text className="eb-visual-node-label" x={ox + 15} y={y} textAnchor="middle" dominantBaseline="central" direction="ltr">A</text>
      <rect className="eb-visual-node" x={ox + 118} y={y - 14} width="34" height="28" rx="5" /><text className="eb-visual-node-label" x={ox + 135} y={y} textAnchor="middle" dominantBaseline="central" direction="ltr">B</text>
    </>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── HALF DUPLEX — one shared line, one direction at a time ── */}
      <text className="eb-visual-row-label" x="90" y="24" textAnchor="middle" direction="ltr">Half Duplex</text>
      <rect className="eb-visual-node" x="8" y="44" width="164" height="70" rx="10" fill="none" />
      {nodeAB(14, 74)}
      <line className="eb-visual-link is-strong" x1="45" y1="74" x2="132" y2="74" />
      {!reducedMotion ? (
        <>
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion id="halfAB" begin="0s;halfBA.end" dur="1.1s" path="M 45 74 L 132 74" /></g>
          <g className="eb-visual-dot is-response"><circle r="4.5" /><animateMotion id="halfBA" begin="halfAB.end" dur="1.1s" path="M 132 74 L 45 74" /></g>
        </>
      ) : (
        <rect className="eb-visual-packet-static" x="83" y="69" width="10" height="10" rx="2" />
      )}
      <text className="eb-visual-part-label" x="90" y="108" textAnchor="middle">اتجاه واحد في كل مرة</text>

      {/* ── FULL DUPLEX — two lanes, both directions at once ── */}
      <text className="eb-visual-row-label" x="290" y="24" textAnchor="middle" direction="ltr">Full Duplex</text>
      <rect className="eb-visual-node" x="208" y="44" width="164" height="70" rx="10" fill="none" />
      {nodeAB(214, 74)}
      <line className="eb-visual-link is-strong" x1="245" y1="64" x2="332" y2="64" />
      <line className="eb-visual-link is-strong" x1="332" y1="84" x2="245" y2="84" />
      {!reducedMotion ? (
        <>
          <g data-full-dir="1" className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion id="fullAB" begin="0s" dur="1.4s" repeatCount="indefinite" path="M 245 64 L 332 64" /></g>
          <g data-full-dir="1" className="eb-visual-dot is-response"><circle r="4.5" /><animateMotion id="fullBA" begin="0s" dur="1.4s" repeatCount="indefinite" path="M 332 84 L 245 84" /></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="283" y="59" width="10" height="10" rx="2" />
          <circle className="eb-visual-dot is-response" cx="288" cy="84" r="4.5" />
        </>
      )}
      <text className="eb-visual-part-label" x="290" y="108" textAnchor="middle">الاتجاهان في نفس الوقت</text>
      <text className="eb-visual-caption-svg" x="190" y="168" textAnchor="middle">‏Half: اتجاه واحد كل مرة · Full: إرسال واستقبال معًا</text>
    </svg>
  );
}
