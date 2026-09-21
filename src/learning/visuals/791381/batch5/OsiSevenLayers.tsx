import type { LearningVisualProps } from "../../types";

/**
 * «طبقات OSI السبع» (Book 791381, PDF 78) — the full seven-layer stack, TOP = 7 Application, BOTTOM = 1 Physical
 * (numbering is never reversed). The page says: sending goes 7 → 1, receiving goes 1 → 7. Motion TEACHES exactly that
 * and is causal: the send indicator travels DOWN 7→1 on the right lane, and ONLY AFTER it finishes does the receive
 * indicator travel UP 1→7 on the left lane; then it repeats. Reduced motion ⇒ the static labelled stack. This is the
 * seven-layer stack itself — distinct from 791381/m13/osi-vs-tcpip (that one maps OSI onto TCP/IP; not touched here,
 * and no TCP/IP four-layer mapping is imported into this visual).
 */
const LAYERS = [
  { n: 7, name: "التطبيق Application", ab: "App" },
  { n: 6, name: "العرض Presentation", ab: "Pres" },
  { n: 5, name: "الجلسة Session", ab: "Sess" },
  { n: 4, name: "النقل Transport", ab: "TCP/UDP" },
  { n: 3, name: "الشبكة Network", ab: "IP" },
  { n: 2, name: "ربط البيانات Data Link", ab: "MAC" },
  { n: 1, name: "الفيزيائية Physical", ab: "Cable" },
];
const rowY = (i: number) => 44 + i * 33;
const cy = (i: number) => rowY(i) + 14;
export default function OsiSevenLayers({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 296"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-part-label" x="352" y="22" textAnchor="end">‏إرسال 7→1 ↓</text>
      <text className="eb-visual-part-label" x="28" y="22" textAnchor="start">‏↑ استقبال 1→7</text>
      {LAYERS.map((l, i) => {
        const y = rowY(i);
        return (
          <g key={l.n} data-layer={l.n}>
            <rect className={"eb-visual-seg " + (i === 0 || i === 6 ? "is-v4" : "")} x="56" y={y} width="268" height="28" rx="6" />
            <circle className="eb-visual-hub" cx="308" cy={y + 14} r="12" />
            <text className="eb-visual-node-label is-inverse" x="308" y={y + 14} textAnchor="middle" dominantBaseline="central" direction="ltr">{l.n}</text>
            <text className="eb-visual-node-label" x="176" y={y + 14} textAnchor="middle" dominantBaseline="central" fontSize="13">{l.name}</text>
            <text className="eb-visual-token" x="72" y={y + 14} dominantBaseline="central" direction="ltr" fontSize="11">{l.ab}</text>
          </g>
        );
      })}
      {/* causal motion: send DOWN 7→1 (right lane), then receive UP 1→7 (left lane) */}
      {!reducedMotion ? (
        <>
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
            <animateMotion id="osiSend" begin="0s;osiRecv.end" dur="2.1s" path={`M 340 ${cy(0)} L 340 ${cy(6)}`} /></g>
          <g className="eb-visual-dot is-response"><circle r="5" />
            <animateMotion id="osiRecv" begin="osiSend.end" dur="2.1s" path={`M 40 ${cy(6)} L 40 ${cy(0)}`} /></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="335" y={cy(3) - 5} width="10" height="10" rx="2" />
          <circle className="eb-visual-dot is-response" cx="40" cy={cy(3)} r="5" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="288" textAnchor="middle">‏الإرسال ينزل 7→1 ثم الاستقبال يصعد 1→7</text>
    </svg>
  );
}
